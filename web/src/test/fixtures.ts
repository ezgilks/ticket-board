import type { Board, Ticket } from "../lib/types";

export function ticket(overrides: Partial<Ticket> & { id: string; columnId: string }): Ticket {
  return {
    title: overrides.id,
    description: null,
    priority: "MEDIUM",
    labels: [],
    position: 1,
    boardId: "b1",
    assigneeId: null,
    assignee: null,
    aiTriage: null,
    createdAt: "2026-09-13T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
    ...overrides,
  };
}

/** Two columns: todo [a@1, b@2, c@3], done [d@1]. */
export function board(): Board {
  return {
    id: "b1",
    name: "Test board",
    ownerId: "u1",
    members: [],
    columns: [
      {
        id: "todo",
        name: "To Do",
        position: 0,
        boardId: "b1",
        tickets: [
          ticket({ id: "a", columnId: "todo", position: 1 }),
          ticket({ id: "b", columnId: "todo", position: 2 }),
          ticket({ id: "c", columnId: "todo", position: 3 }),
        ],
      },
      {
        id: "done",
        name: "Done",
        position: 1,
        boardId: "b1",
        tickets: [ticket({ id: "d", columnId: "done", position: 1 })],
      },
    ],
  };
}

export const ids = (b: Board, columnId: string) =>
  b.columns.find((c) => c.id === columnId)?.tickets.map((t) => t.id);
