import { prisma } from "../db.js";
import { publishBoardEvent } from "../events.js";
import { aiEnabled, embed, type TriageSuggestion, triage } from "./client.js";
import { ticketText, toVectorLiteral } from "./text.js";

export interface EnrichOptions {
  /** Ask the LLM for labels/priority. Only on creation — not every time a title is edited. */
  triage: boolean;
  /** Only overwrite fields the user left blank: AI suggests, humans decide. */
  applyPriority: boolean;
  applyLabels: boolean;
}

const EMBED_ONLY: EnrichOptions = { triage: false, applyPriority: false, applyLabels: false };

/**
 * Runs *after* the HTTP response is sent (fire-and-forget), so creating a ticket stays
 * fast even when the AI service is slow or asleep. Results reach every open tab over
 * the socket, like any other change.
 */
export async function enrichTicket(ticketId: string, options: EnrichOptions = EMBED_ONLY) {
  if (!aiEnabled()) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return; // deleted in the meantime

  // Independent jobs, run concurrently: a slow embedding (e.g. a cold model load) must not
  // hold back the triage result the user is waiting to see, and one failing doesn't stop the other.
  const jobs = [storeEmbedding(ticketId, ticketText(ticket))];
  if (options.triage) jobs.push(applyTriage(ticketId, ticket.title, ticket.description, options));
  const results = await Promise.all(jobs);

  // One publish at the end, not one per job: the client needs the triage result and the
  // "no longer pending" flag together, and two events would flash a half-updated card.
  await finishEnrichment(ticketId, results.every(Boolean));
}

/** Record the outcome and push the finished ticket to every open tab. */
async function finishEnrichment(ticketId: string, ok: boolean) {
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId },
    data: { aiStatus: ok ? "DONE" : "FAILED" },
  });
  if (count === 0) return; // deleted mid-enrichment

  const updated = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
  // No origin socket to exclude — the tab that created the ticket needs this update too.
  if (updated) await publishBoardEvent(updated.boardId, { type: "ticket:upserted", ticket: updated });
}

async function storeEmbedding(ticketId: string, text: string): Promise<boolean> {
  try {
    const [vector] = await embed([text]);
    if (!vector) return false;
    // Prisma can't write vector columns, so this is raw SQL. $executeRaw is a tagged
    // template: ${values} become bind parameters ($1, $2), never string-concatenated
    // into the query — which is what prevents SQL injection.
    await prisma.$executeRaw`
      UPDATE "Ticket" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${ticketId}
    `;
    return true;
  } catch (err) {
    console.error(`[ai] embed failed for ${ticketId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

async function applyTriage(
  ticketId: string,
  title: string,
  description: string | null,
  options: EnrichOptions,
): Promise<boolean> {
  let suggestion: TriageSuggestion;
  try {
    suggestion = await triage(title, description);
  } catch (err) {
    console.error(`[ai] triage failed for ${ticketId}:`, err instanceof Error ? err.message : err);
    return false;
  }

  const applied: string[] = [];
  const data: { priority?: TriageSuggestion["priority"]; labels?: string[] } = {};
  if (options.applyPriority) {
    data.priority = suggestion.priority;
    applied.push("priority");
  }
  if (options.applyLabels && suggestion.labels.length > 0) {
    data.labels = suggestion.labels;
    applied.push("labels");
  }

  // updateMany with the id filter: a no-op instead of an error if the ticket was just deleted.
  const { count } = await prisma.ticket.updateMany({
    where: { id: ticketId },
    data: { ...data, aiTriage: { ...suggestion, applied } },
  });
  return count > 0;
}

/** Start enrichment without awaiting it. Failures are logged, never surfaced to the user. */
export function enrichInBackground(ticketId: string, options?: EnrichOptions) {
  enrichTicket(ticketId, options).catch((err) => {
    console.error(`[ai] enrichment failed for ticket ${ticketId}:`, err instanceof Error ? err.message : err);
  });
}

/**
 * Enrichment for a freshly seeded demo board.
 *
 * Two differences from the per-ticket path. Embeddings go out as ONE batched call —
 * /embed already takes an array, and nine separate round-trips to a free-tier service
 * that sleeps when idle means waiting on it nine times. Triage runs only on the
 * tickets the seed deliberately left blank, so the AI fills gaps rather than
 * overwriting the seed's own labels.
 */
export function enrichSeededBoardInBackground(boardId: string) {
  enrichSeededBoard(boardId).catch((err) => {
    console.error(`[ai] seed enrichment failed for board ${boardId}:`, err instanceof Error ? err.message : err);
  });
}

/** Awaitable form — used by tests, which must not leave jobs running past the test. */
export async function enrichSeededBoard(boardId: string) {
  if (!aiEnabled()) return;

  const tickets = await prisma.ticket.findMany({
    where: { boardId },
    select: { id: true, title: true, description: true, labels: true },
  });
  if (tickets.length === 0) return;

  const blank = tickets.filter((t) => t.labels.length === 0);
  const [embedded, ...triaged] = await Promise.all([
    embedMany(tickets),
    ...blank.map(async (t) => ({
      id: t.id,
      ok: await applyTriage(t.id, t.title, t.description, {
        triage: true,
        applyPriority: true,
        applyLabels: true,
      }),
    })),
  ]);

  // Status is per ticket, not per board. A failed embed breaks similarity for every
  // ticket, so that fails them all; a failed triage only concerns its own ticket —
  // marking the whole board FAILED over one would misreport the eight that worked.
  const failed = new Set(embedded ? triaged.filter((t) => !t.ok).map((t) => t.id) : tickets.map((t) => t.id));
  const partition = [
    { ids: tickets.filter((t) => failed.has(t.id)).map((t) => t.id), status: "FAILED" as const },
    { ids: tickets.filter((t) => !failed.has(t.id)).map((t) => t.id), status: "DONE" as const },
  ];
  for (const { ids, status } of partition) {
    if (ids.length > 0) await prisma.ticket.updateMany({ where: { id: { in: ids } }, data: { aiStatus: status } });
  }

  // One refresh rather than nine ticket events: the whole board just changed, and the
  // client already knows how to refetch.
  await publishBoardEvent(boardId, { type: "board:refresh" });
}

async function embedMany(tickets: { id: string; title: string; description: string | null }[]): Promise<boolean> {
  try {
    const vectors = await embed(tickets.map(ticketText));
    // One statement per row, one transaction: nine small UPDATEs that either all
    // land or none do, without nine separate round-trips to Postgres.
    await prisma.$transaction(
      tickets.flatMap((ticket, i) => {
        const vector = vectors[i];
        if (!vector) return [];
        return [
          prisma.$executeRaw`
            UPDATE "Ticket" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${ticket.id}
          `,
        ];
      }),
    );
    return true;
  } catch (err) {
    console.error("[ai] batch embed failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
