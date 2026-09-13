import { prisma } from "../db.js";
import { aiEnabled, embed } from "./client.js";
import { ticketText, toVectorLiteral } from "./text.js";

/**
 * Runs *after* the HTTP response is sent (fire-and-forget), so creating a ticket
 * stays fast even when the AI service is slow or asleep. The result arrives
 * later over the socket like any other change.
 */
export async function enrichTicket(ticketId: string) {
  if (!aiEnabled()) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) return; // deleted in the meantime

  const [vector] = await embed([ticketText(ticket)]);
  if (!vector) return;

  // Prisma can't write vector columns, so this is raw SQL. $executeRaw is a tagged
  // template: ${values} become bind parameters ($1, $2), never string-concatenated
  // into the query — which is what prevents SQL injection.
  await prisma.$executeRaw`
    UPDATE "Ticket" SET embedding = ${toVectorLiteral(vector)}::vector WHERE id = ${ticketId}
  `;
}

/** Start enrichment without awaiting it. Failures are logged, never surfaced to the user. */
export function enrichInBackground(ticketId: string) {
  enrichTicket(ticketId).catch((err) => {
    console.error(`[ai] enrichment failed for ticket ${ticketId}:`, err instanceof Error ? err.message : err);
  });
}
