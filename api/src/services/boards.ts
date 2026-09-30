import { z } from "zod";
import { getCachedBoard, setCachedBoard } from "../cache.js";
import { prisma } from "../db.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { assertMember, assertOwner } from "./access.js";

export const BoardInput = z.object({ name: z.string().trim().min(1).max(100) });

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

const userSummary = { select: { id: true, name: true, email: true } } as const;

export async function listBoards(userId: string) {
  return prisma.board.findMany({
    where: { members: { some: { userId } } },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { tickets: true, members: true } } },
  });
}

export async function createBoard(userId: string, input: z.infer<typeof BoardInput>) {
  // One nested write = one transaction: the board, its owner membership, and its
  // default columns all exist, or none of them do.
  return prisma.board.create({
    data: {
      name: input.name,
      ownerId: userId,
      members: { create: { userId, role: "OWNER" } },
      columns: { create: DEFAULT_COLUMNS.map((name, position) => ({ name, position })) },
    },
  });
}

// The full board payload the UI renders: columns in order, tickets in order.
// Membership is checked *before* the cache: authorization is never cached.
export async function getBoard(userId: string, boardId: string) {
  await assertMember(userId, boardId);

  const cached = await getCachedBoard<BoardPayload>(boardId);
  if (cached) return cached;

  const board = await loadBoard(boardId);
  if (!board) throw notFound("Board not found");
  await setCachedBoard(boardId, board);
  return board;
}

type BoardPayload = NonNullable<Awaited<ReturnType<typeof loadBoard>>>;

function loadBoard(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    include: {
      columns: {
        orderBy: { position: "asc" },
        include: {
          tickets: { orderBy: { position: "asc" }, include: { assignee: userSummary } },
        },
      },
      members: { include: { user: userSummary }, orderBy: { createdAt: "asc" } },
    },
  });
}

export async function renameBoard(userId: string, boardId: string, input: z.infer<typeof BoardInput>) {
  await assertOwner(userId, boardId);
  return prisma.board.update({ where: { id: boardId }, data: { name: input.name } });
}

export async function deleteBoard(userId: string, boardId: string) {
  await assertOwner(userId, boardId);
  await prisma.board.delete({ where: { id: boardId } });
}

/**
 * Remove someone from a board. One endpoint, two cases:
 *   - the owner removes a member
 *   - a member removes themselves ("leave board")
 * The owner can't be removed or leave: a board always has an owner. They delete it instead.
 */
export async function removeMember(actorId: string, boardId: string, targetId: string) {
  const actor = await assertMember(actorId, boardId);
  const target = await prisma.boardMember.findUnique({ where: { boardId_userId: { boardId, userId: targetId } } });
  if (!target) throw notFound("Not a member of this board");
  if (target.role === "OWNER") throw badRequest("The owner can't leave. Delete the board instead.");
  if (actorId !== targetId && actor.role !== "OWNER") throw forbidden("Only the board owner can remove members");

  await prisma.$transaction([
    // Tickets can only be assigned to members (see assertAssignable), so unassign theirs.
    // That changes ticket content, so it bumps the version like any other edit.
    prisma.ticket.updateMany({
      where: { boardId, assigneeId: targetId },
      data: { assigneeId: null, version: { increment: 1 } },
    }),
    prisma.boardMember.delete({ where: { boardId_userId: { boardId, userId: targetId } } }),
  ]);
}
