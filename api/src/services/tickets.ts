import { z } from "zod";
import { prisma } from "../db.js";
import { badRequest } from "../lib/errors.js";
import { assertMember, assertTicketAccess } from "./access.js";

const Priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const Labels = z.array(z.string().trim().min(1).max(30)).max(10);

export const CreateTicketInput = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  priority: Priority.optional(),
  labels: Labels.optional(),
  columnId: z.uuid(),
  assigneeId: z.uuid().nullable().optional(),
});

export const UpdateTicketInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: Priority.optional(),
  labels: Labels.optional(),
  assigneeId: z.uuid().nullable().optional(),
});

// Where to drop a ticket: a column, and its index among that column's other tickets.
export const MoveTicketInput = z.object({
  columnId: z.uuid(),
  index: z.number().int().min(0),
});

const withAssignee = { assignee: { select: { id: true, name: true, email: true } } } as const;

async function assertColumnOnBoard(columnId: string, boardId: string) {
  const column = await prisma.column.findUnique({ where: { id: columnId } });
  if (!column || column.boardId !== boardId) throw badRequest("Column is not on this board");
}

async function assertAssignable(assigneeId: string | null | undefined, boardId: string) {
  if (!assigneeId) return;
  const m = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: assigneeId } },
  });
  if (!m) throw badRequest("Assignee is not a member of this board");
}

export async function createTicket(userId: string, boardId: string, input: z.infer<typeof CreateTicketInput>) {
  await assertMember(userId, boardId);
  await assertColumnOnBoard(input.columnId, boardId);
  await assertAssignable(input.assigneeId, boardId);

  // New tickets go to the bottom of their column.
  const last = await prisma.ticket.findFirst({
    where: { columnId: input.columnId },
    orderBy: { position: "desc" },
  });

  return prisma.ticket.create({
    data: {
      boardId,
      columnId: input.columnId,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? "MEDIUM",
      labels: input.labels ?? [],
      assigneeId: input.assigneeId ?? null,
      position: (last?.position ?? 0) + 1,
    },
    include: withAssignee,
  });
}

export async function updateTicket(userId: string, ticketId: string, input: z.infer<typeof UpdateTicketInput>) {
  const ticket = await assertTicketAccess(userId, ticketId);
  await assertAssignable(input.assigneeId, ticket.boardId);

  // exactOptionalPropertyTypes: only copy keys the client actually sent.
  const data: Record<string, unknown> = {};
  for (const key of ["title", "description", "priority", "labels", "assigneeId"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  return prisma.ticket.update({ where: { id: ticketId }, data, include: withAssignee });
}

export async function deleteTicket(userId: string, ticketId: string) {
  const ticket = await assertTicketAccess(userId, ticketId);
  await prisma.ticket.delete({ where: { id: ticketId } });
  return ticket;
}

// Smallest gap we allow between neighbours before renumbering the column.
// Doubles have ~52 bits of precision, so repeated halving runs out eventually.
const MIN_GAP = 1e-6;

/**
 * Fractional positioning. Dropping a ticket between neighbours at 1 and 2 gives it
 * 1.5 — one row updated, instead of renumbering every ticket below it.
 */
export async function moveTicket(userId: string, ticketId: string, input: z.infer<typeof MoveTicketInput>) {
  const ticket = await assertTicketAccess(userId, ticketId);
  await assertColumnOnBoard(input.columnId, ticket.boardId);

  return prisma.$transaction(async (tx) => {
    const siblings = await tx.ticket.findMany({
      where: { columnId: input.columnId, id: { not: ticketId } },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    });

    const index = Math.min(input.index, siblings.length);
    const prev = siblings[index - 1];
    const next = siblings[index];

    let position: number;
    if (prev && next) position = (prev.position + next.position) / 2;
    else if (prev) position = prev.position + 1;
    else if (next) position = next.position - 1;
    else position = 1;

    const tooClose =
      (prev && position - prev.position < MIN_GAP) || (next && next.position - position < MIN_GAP);

    if (tooClose) {
      // Rare: rewrite the whole column as 1, 2, 3... with the moved ticket in place.
      const ordered = [...siblings.slice(0, index).map((s) => s.id), ticketId, ...siblings.slice(index).map((s) => s.id)];
      // Sequential on purpose: a transaction runs on a single connection anyway.
      for (const [i, id] of ordered.entries()) {
        await tx.ticket.update({ where: { id }, data: { position: i + 1 } });
      }
      position = index + 1;
    }

    return tx.ticket.update({
      where: { id: ticketId },
      data: { columnId: input.columnId, position },
      include: withAssignee,
    });
  });
}
