import DataLoader from "dataloader";
import { prisma } from "../db.js";

/**
 * The N+1 problem: a query for 1 board with 10 columns would naively run
 * 1 query for the board + 10 queries for tickets (one per column) + one per assignee.
 *
 * DataLoader fixes it by batching. Every Column.tickets resolver calls
 * loaders.ticketsByColumn.load(columnId) during the same tick; DataLoader collects
 * those ids and makes ONE query: WHERE "columnId" IN (...). Then it hands each
 * resolver its own slice.
 *
 * Loaders are created per request, so cached results never leak between users.
 */
export function createLoaders() {
  return {
    ticketsByColumn: new DataLoader(async (columnIds: readonly string[]) => {
      const tickets = await prisma.ticket.findMany({
        where: { columnId: { in: [...columnIds] } },
        orderBy: { position: "asc" },
      });
      // DataLoader requires results in the same order as the requested ids.
      return columnIds.map((id) => tickets.filter((t) => t.columnId === id));
    }),

    userById: new DataLoader(async (ids: readonly string[]) => {
      const users = await prisma.user.findMany({
        where: { id: { in: [...ids] } },
        select: { id: true, name: true, email: true },
      });
      const byId = new Map(users.map((u) => [u.id, u]));
      return ids.map((id) => byId.get(id) ?? null);
    }),

    columnsByBoard: new DataLoader(async (boardIds: readonly string[]) => {
      const columns = await prisma.column.findMany({
        where: { boardId: { in: [...boardIds] } },
        orderBy: { position: "asc" },
      });
      return boardIds.map((id) => columns.filter((c) => c.boardId === id));
    }),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
