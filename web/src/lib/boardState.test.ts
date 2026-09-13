import { describe, expect, it } from "vitest";
import { board, ids, ticket } from "../test/fixtures";
import { moveTicketLocal, removeColumn, removeTicket, upsertColumn, upsertTicket } from "./boardState";

describe("moveTicketLocal", () => {
  it("reorders within a column", () => {
    expect(ids(moveTicketLocal(board(), "c", "todo", 0), "todo")).toEqual(["c", "a", "b"]);
  });

  it("moves across columns and updates columnId", () => {
    const next = moveTicketLocal(board(), "a", "done", 1);
    expect(ids(next, "todo")).toEqual(["b", "c"]);
    expect(ids(next, "done")).toEqual(["d", "a"]);
    expect(next.columns[1]?.tickets[1]?.columnId).toBe("done");
  });

  it("does not mutate the original board (React relies on new references)", () => {
    const original = board();
    const next = moveTicketLocal(original, "a", "done", 0);
    expect(ids(original, "todo")).toEqual(["a", "b", "c"]);
    expect(next).not.toBe(original);
  });

  it("returns the same board for an unknown ticket", () => {
    const b = board();
    expect(moveTicketLocal(b, "nope", "todo", 0)).toBe(b);
  });
});

describe("upsertTicket (events from the server)", () => {
  it("inserts a new ticket sorted by position", () => {
    const next = upsertTicket(board(), ticket({ id: "x", columnId: "todo", position: 1.5 }));
    expect(ids(next, "todo")).toEqual(["a", "x", "b", "c"]);
  });

  it("moves an existing ticket to the column the server says it's in", () => {
    const next = upsertTicket(board(), ticket({ id: "a", columnId: "done", position: 0.5 }));
    expect(ids(next, "todo")).toEqual(["b", "c"]);
    expect(ids(next, "done")).toEqual(["a", "d"]);
  });

  it("replaces fields on an existing ticket", () => {
    const next = upsertTicket(board(), ticket({ id: "b", columnId: "todo", position: 2, priority: "URGENT" }));
    expect(next.columns[0]?.tickets[1]?.priority).toBe("URGENT");
  });
});

describe("removals and columns", () => {
  it("removes a ticket", () => {
    expect(ids(removeTicket(board(), "b"), "todo")).toEqual(["a", "c"]);
  });

  it("adds a column at its position and renames an existing one", () => {
    const added = upsertColumn(board(), { id: "doing", name: "Doing", position: 5, boardId: "b1", tickets: [] });
    expect(added.columns.map((c) => c.id)).toEqual(["todo", "done", "doing"]);

    const renamed = upsertColumn(added, { id: "todo", name: "Backlog", position: 0, boardId: "b1", tickets: [] });
    expect(renamed.columns[0]?.name).toBe("Backlog");
    expect(ids(renamed, "todo")).toEqual(["a", "b", "c"]); // rename keeps tickets
  });

  it("removes a column", () => {
    expect(removeColumn(board(), "done").columns.map((c) => c.id)).toEqual(["todo"]);
  });
});
