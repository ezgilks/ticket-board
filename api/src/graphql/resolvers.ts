import type { Board, Column, Ticket } from "../generated/prisma/client.js";
import { prisma } from "../db.js";
import { unauthorized } from "../lib/errors.js";
import { assertMember } from "../services/access.js";
import { getBoardAnalytics } from "../services/analytics.js";
import { getMe } from "../services/auth.js";
import type { Loaders } from "./loaders.js";

export interface GraphQLContext {
  userId: string | null;
  loaders: Loaders;
}

function requireUser(ctx: GraphQLContext) {
  if (!ctx.userId) throw unauthorized("Missing or invalid bearer token");
  return ctx.userId;
}

// A resolver is a function that produces one field's value. GraphQL calls only the
// resolvers for fields the query actually selected.
export const resolvers = {
  Query: {
    me: (_: unknown, __: unknown, ctx: GraphQLContext) => getMe(requireUser(ctx)),

    boards: (_: unknown, __: unknown, ctx: GraphQLContext) =>
      prisma.board.findMany({
        where: { members: { some: { userId: requireUser(ctx) } } },
        orderBy: { createdAt: "desc" },
      }),

    board: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      // Same authorization as REST: non-members get null, as if the board didn't exist.
      try {
        await assertMember(requireUser(ctx), args.id);
      } catch (err) {
        if (!ctx.userId) throw err;
        return null;
      }
      return prisma.board.findUnique({ where: { id: args.id } });
    },
  },

  // Nested resolvers. Access was checked once at the board, so children don't re-check.
  Board: {
    createdAt: (b: Board) => b.createdAt.toISOString(),
    owner: (b: Board, _: unknown, ctx: GraphQLContext) => ctx.loaders.userById.load(b.ownerId),
    members: (b: Board) =>
      prisma.boardMember.findMany({
        where: { boardId: b.id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
    columns: (b: Board, _: unknown, ctx: GraphQLContext) => ctx.loaders.columnsByBoard.load(b.id),
    analytics: (b: Board, _: unknown, ctx: GraphQLContext) => getBoardAnalytics(requireUser(ctx), b.id),
  },

  Column: {
    tickets: async (
      c: Column,
      args: { priority?: string | null; label?: string | null },
      ctx: GraphQLContext,
    ) => {
      const tickets = await ctx.loaders.ticketsByColumn.load(c.id);
      return tickets.filter(
        (t) => (!args.priority || t.priority === args.priority) && (!args.label || t.labels.includes(args.label)),
      );
    },
  },

  Ticket: {
    createdAt: (t: Ticket) => t.createdAt.toISOString(),
    updatedAt: (t: Ticket) => t.updatedAt.toISOString(),
    assignee: (t: Ticket, _: unknown, ctx: GraphQLContext) =>
      t.assigneeId ? ctx.loaders.userById.load(t.assigneeId) : null,
  },
};
