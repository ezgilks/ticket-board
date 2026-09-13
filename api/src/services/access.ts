import { prisma } from "../db.js";
import { forbidden, notFound } from "../lib/errors.js";

// Authorization lives here, in one place. Every service that touches a board
// calls one of these first.
//
// Non-members get 404, not 403: a 403 would confirm that the board exists.

export async function assertMember(userId: string, boardId: string) {
  const membership = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });
  if (!membership) throw notFound("Board not found");
  return membership;
}

export async function assertOwner(userId: string, boardId: string) {
  const membership = await assertMember(userId, boardId);
  if (membership.role !== "OWNER") throw forbidden("Only the board owner can do that");
  return membership;
}

// Columns and tickets are reached by their own id, so look up which board they
// belong to, then run the normal membership check.
export async function assertColumnAccess(userId: string, columnId: string) {
  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column) throw notFound("Column not found");
  await assertMember(userId, column.boardId);
  return column;
}

export async function assertTicketAccess(userId: string, ticketId: string) {
  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw notFound("Ticket not found");
  await assertMember(userId, ticket.boardId);
  return ticket;
}
