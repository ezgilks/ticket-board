import { z } from "zod";
import { prisma } from "../db.js";
import { assertColumnAccess, assertMember } from "./access.js";

export const CreateColumnInput = z.object({ name: z.string().trim().min(1).max(50) });
export const UpdateColumnInput = z.object({ name: z.string().trim().min(1).max(50) });

export async function createColumn(userId: string, boardId: string, input: z.infer<typeof CreateColumnInput>) {
  await assertMember(userId, boardId);
  const last = await prisma.column.findFirst({
    where: { boardId },
    orderBy: { position: "desc" },
  });
  return prisma.column.create({
    data: { boardId, name: input.name, position: (last?.position ?? -1) + 1 },
    include: { tickets: true },
  });
}

export async function updateColumn(userId: string, columnId: string, input: z.infer<typeof UpdateColumnInput>) {
  await assertColumnAccess(userId, columnId);
  return prisma.column.update({ where: { id: columnId }, data: { name: input.name } });
}

export async function deleteColumn(userId: string, columnId: string) {
  const column = await assertColumnAccess(userId, columnId);
  // Tickets in the column are removed by the ON DELETE CASCADE foreign key.
  await prisma.column.delete({ where: { id: columnId } });
  return column;
}
