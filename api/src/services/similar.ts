import { prisma } from "../db.js";
import { assertTicketAccess } from "./access.js";

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
