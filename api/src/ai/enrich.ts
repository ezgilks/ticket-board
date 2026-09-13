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
  await Promise.all(jobs);
}

async function storeEmbedding(ticketId: string, text: string) {
  try {
    const [vector] = await embed([text]);
    if (!vector) return;
    // Prisma can't write vector columns, so this is raw SQL. $executeRaw is a tagged
    // template: ${values} become bind parameters ($1, $2), never string-concatenated
    // into the query — which is what prevents SQL injection.
    await prisma.$executeRaw`
      UPDATE "Ticket" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${ticketId}
    `;
  } catch (err) {
    console.error(`[ai] embed failed for ${ticketId}:`, err instanceof Error ? err.message : err);
  }
}

async function applyTriage(ticketId: string, title: string, description: string | null, options: EnrichOptions) {
  let suggestion: TriageSuggestion;
  try {
    suggestion = await triage(title, description);
  } catch (err) {
    console.error(`[ai] triage failed for ${ticketId}:`, err instanceof Error ? err.message : err);
    return;
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
  if (count === 0) return;

  const updated = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { assignee: { select: { id: true, name: true, email: true } } },
  });
  // No origin socket to exclude — the creator's tab needs this update too.
  if (updated) await publishBoardEvent(updated.boardId, { type: "ticket:upserted", ticket: updated });
}

/** Start enrichment without awaiting it. Failures are logged, never surfaced to the user. */
export function enrichInBackground(ticketId: string, options?: EnrichOptions) {
  enrichTicket(ticketId, options).catch((err) => {
    console.error(`[ai] enrichment failed for ticket ${ticketId}:`, err instanceof Error ? err.message : err);
  });
}
