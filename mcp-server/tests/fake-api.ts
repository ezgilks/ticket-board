import { randomUUID } from "node:crypto";
import { ApiError, type Board, type Ticket, type TicketDetail } from "../src/api.js";
import type { BoardApi } from "../src/server.js";

/**
 * An in-memory stand-in for the REST API, just faithful enough for the tool handlers:
 * one board, three columns, two members. It records every write so tests can assert on
 * exactly what the tools sent.
 */
export function fakeApi() {
  const alice = { id: randomUUID(), name: "Alice", email: "alice@example.com" };
  const bob = { id: randomUUID(), name: "Bob", email: "bob@example.com" };
  const board: Board = {
    id: randomUUID(),
    name: "Demo",
    columns: ["To Do", "In Progress", "Done"].map((name, position) => ({
      id: randomUUID(),
      name,
      position,
      tickets: [],
    })),
    members: [
      { role: "OWNER", user: alice },
      { role: "MEMBER", user: bob },
    ],
  };
  const writes: { op: string; id: string; body: unknown }[] = [];

  const ticket = (title: string, columnIndex: number, extra: Partial<Ticket> = {}): Ticket => {
    const column = board.columns[columnIndex]!;
    const t: Ticket = {
      id: randomUUID(),
      title,
      description: null,
      priority: "MEDIUM",
      labels: [],
      position: column.tickets.length + 1,
      boardId: board.id,
      columnId: column.id,
      assigneeId: null,
      assignee: null,
      aiTriage: null,
      aiStatus: "DONE",
      version: 1,
      createdAt: "2026-10-06T00:00:00.000Z",
      updatedAt: "2026-10-06T00:00:00.000Z",
      ...extra,
    };
    column.tickets.push(t);
    return t;
  };

  const find = (id: string) => {
    for (const c of board.columns) {
      const t = c.tickets.find((x) => x.id === id);
      if (t) return { t, c };
    }
    throw new ApiError(404, "Ticket not found");
  };
  const detail = (id: string): TicketDetail => {
    const { t, c } = find(id);
    return { ...t, column: { id: c.id, name: c.name } };
  };
  const checkBoard = (id: string) => {
    if (id !== board.id) throw new ApiError(404, "Board not found");
  };

  const api: BoardApi = {
    listBoards: async () => [
      { id: board.id, name: board.name, createdAt: "", _count: { tickets: count(board), members: 2 } },
    ],
    getBoard: async (id) => {
      checkBoard(id);
      return structuredClone(board);
    },
    getTicket: async (id) => detail(id),
    createTicket: async (id, input) => {
      checkBoard(id);
      writes.push({ op: "create", id, body: input });
      const index = board.columns.findIndex((c) => c.id === input.columnId);
      const { columnId: _, assigneeId, ...rest } = input;
      const assignee = board.members.find((m) => m.user.id === assigneeId)?.user ?? null;
      return ticket(input.title, index, { ...rest, assigneeId: assignee?.id ?? null, assignee, aiStatus: "PENDING" });
    },
    updateTicket: async (id, input) => {
      writes.push({ op: "update", id, body: input });
      const { t } = find(id);
      if (input.version !== undefined && input.version !== t.version) {
        throw new ApiError(409, "This ticket was changed by someone else while you were editing", { ticket: t });
      }
      const { version: _, assigneeId, ...rest } = input;
      Object.assign(t, rest, { version: t.version + 1 });
      if (assigneeId !== undefined) {
        t.assigneeId = assigneeId;
        t.assignee = board.members.find((m) => m.user.id === assigneeId)?.user ?? null;
      }
      return t;
    },
    moveTicket: async (id, input) => {
      writes.push({ op: "move", id, body: input });
      const { t, c } = find(id);
      c.tickets.splice(c.tickets.indexOf(t), 1);
      const to = board.columns.find((x) => x.id === input.columnId)!;
      to.tickets.splice(Math.min(input.index, to.tickets.length), 0, t);
      t.columnId = to.id;
      return { ticket: t, rebalanced: false };
    },
    similarTickets: async (id) => {
      find(id);
      return [{ id: randomUUID(), title: "A lookalike", columnName: "To Do", similarity: 0.8 }];
    },
    searchTickets: async (id, query) => {
      checkBoard(id);
      return [{ id: randomUUID(), title: `Match for ${query}`, columnName: "To Do", similarity: 0.6 }];
    },
    suggestTriage: async (id) => {
      find(id);
      return { labels: ["bug"], priority: "HIGH", provider: "fake" };
    },
  };

  return { api, board, alice, bob, ticket, writes };
}

function count(board: Board) {
  return board.columns.reduce((n, c) => n + c.tickets.length, 0);
}
