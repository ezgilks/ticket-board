import { z } from "zod";
import { getCachedBoard, setCachedBoard } from "../cache.js";
import { prisma } from "../db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { assertMember, assertOwner } from "./access.js";

export const BoardInput = z.object({ name: z.string().trim().min(1).max(100) });
export const AddMemberInput = z.object({ email: z.email().transform((e) => e.toLowerCase()) });

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

export async function addMember(userId: string, boardId: string, input: z.infer<typeof AddMemberInput>) {
  await assertOwner(userId, boardId);
  const invitee = await prisma.user.findUnique({ where: { email: input.email } });
  if (!invitee) throw badRequest("No user with that email");
  const existing = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: invitee.id } },
  });
  if (existing) throw conflict("Already a member");
  return prisma.boardMember.create({
    data: { boardId, userId: invitee.id },
    include: { user: userSummary },
  });
}
