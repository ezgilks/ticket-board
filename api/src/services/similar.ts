import { z } from "zod";
import { aiEnabled, embed } from "../ai/client.js";
import { toVectorLiteral } from "../ai/text.js";
import { prisma } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { assertMember, assertTicketAccess } from "./access.js";

export interface SimilarTicket {
  id: string;
  title: string;
  columnName: string;
  similarity: number;
}

// Calibrated on real tickets with MiniLM: related pairs ("can't sign in" vs "password
// reset email never arrives") score ~0.34; unrelated pairs score below 0.1.
const MIN_SIMILARITY = 0.3;

/**
 * Nearest neighbours by meaning, written in raw SQL on purpose.
 *
 * `a <=> b` is pgvector's cosine *distance* (0 = same direction, 2 = opposite).
 * similarity = 1 - distance. ORDER BY the bare distance expression lets the HNSW
 * index do the work instead of scanning every ticket.
 */
export async function findSimilarTickets(userId: string, ticketId: string, limit = 5) {
  const ticket = await assertTicketAccess(userId, ticketId);

  return prisma.$queryRaw<SimilarTicket[]>`
    WITH source AS (
      SELECT embedding FROM "Ticket" WHERE id = ${ticketId} AND embedding IS NOT NULL
    )
    SELECT t.id,
           t.title,
           c.name AS "columnName",
           (1 - (t.embedding <=> source.embedding))::float8 AS similarity
    FROM "Ticket" t
    JOIN "Column" c ON c.id = t."columnId"
    CROSS JOIN source
    WHERE t."boardId" = ${ticket.boardId}
      AND t.id <> ${ticketId}
      AND t.embedding IS NOT NULL
      AND 1 - (t.embedding <=> source.embedding) >= ${MIN_SIMILARITY}
    ORDER BY t.embedding <=> source.embedding
    LIMIT ${limit}
  `;
}

export const SearchInput = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.number().int().min(1).max(20).optional(),
});

/**
 * Free-text semantic search: embed the query with the same model as the tickets, then the
 * same nearest-neighbour query as above, against that vector instead of a stored one.
 */
export async function searchTickets(userId: string, boardId: string, input: z.infer<typeof SearchInput>) {
  await assertMember(userId, boardId);
  if (!aiEnabled()) throw new HttpError(503, "Semantic search is not configured on this server");

  let vector: number[] | undefined;
  try {
    [vector] = await embed([input.query]);
  } catch (err) {
    console.error("[ai] search embed failed:", err instanceof Error ? err.message : err);
  }
  if (!vector) throw new HttpError(503, "The AI service is unavailable. Try again in a minute.");

  return prisma.$queryRaw<SimilarTicket[]>`
    WITH q AS (SELECT ${toVectorLiteral(vector)}::vector AS embedding)
    SELECT t.id,
           t.title,
           c.name AS "columnName",
           (1 - (t.embedding <=> q.embedding))::float8 AS similarity
    FROM "Ticket" t
    JOIN "Column" c ON c.id = t."columnId"
    CROSS JOIN q
    WHERE t."boardId" = ${boardId}
      AND t.embedding IS NOT NULL
      AND 1 - (t.embedding <=> q.embedding) >= ${MIN_SIMILARITY}
    ORDER BY t.embedding <=> q.embedding
    LIMIT ${input.limit ?? 5}
  `;
}
