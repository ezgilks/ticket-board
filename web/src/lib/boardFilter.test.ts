import { describe, expect, it } from "vitest";
import { ids, ticket } from "../test/fixtures";
import {
  type BoardFilter,
  boardLabels,
  EMPTY_FILTER,
  filterBoard,
  filterFromParams,
  filterToParams,
  matches,
  UNASSIGNED,
} from "./boardFilter";
import type { Board } from "./types";

const f = (over: Partial<BoardFilter>): BoardFilter => ({ ...EMPTY_FILTER, ...over });

const safari = ticket({
  id: "safari",
  columnId: "todo",
  title: "Login fails on iOS Safari",
  description: "After a password reset",
  priority: "HIGH",
  labels: ["bug", "auth"],
  assigneeId: "u1",
});
const csv = ticket({ id: "csv", columnId: "todo", title: "Add CSV export", priority: "LOW", labels: ["feature"] });

describe("matches", () => {
  it("matches every word in any order, across title and description, ignoring case", () => {
    expect(matches(safari, f({ text: "safari LOGIN" }))).toBe(true);
    expect(matches(safari, f({ text: "password reset" }))).toBe(true);
    expect(matches(safari, f({ text: "safari chrome" }))).toBe(false);
  });

  it("treats selected labels as any-of, and priorities as any-of", () => {
    expect(matches(safari, f({ labels: ["feature", "auth"] }))).toBe(true);
    expect(matches(csv, f({ labels: ["bug"] }))).toBe(false);
    expect(matches(safari, f({ priorities: ["HIGH", "URGENT"] }))).toBe(true);
    expect(matches(csv, f({ priorities: ["HIGH", "URGENT"] }))).toBe(false);
  });

  it("ANDs the groups together", () => {
    expect(matches(safari, f({ text: "safari", priorities: ["LOW"] }))).toBe(false);
    expect(matches(safari, f({ text: "safari", priorities: ["HIGH"], labels: ["bug"] }))).toBe(true);
  });

  it("filters by assignee, including unassigned", () => {
    expect(matches(safari, f({ assignee: "u1" }))).toBe(true);
    expect(matches(csv, f({ assignee: "u1" }))).toBe(false);
    expect(matches(csv, f({ assignee: UNASSIGNED }))).toBe(true);
    expect(matches(safari, f({ assignee: UNASSIGNED }))).toBe(false);
  });
});

const twoColumns = (): Board => ({
  id: "b1",
  name: "B",
  ownerId: "u1",
  members: [],
  columns: [
    { id: "todo", name: "To Do", position: 0, boardId: "b1", tickets: [safari, csv] },
    { id: "done", name: "Done", position: 1, boardId: "b1", tickets: [ticket({ id: "d", columnId: "done", labels: ["bug"] })] },
  ],
});

describe("filterBoard", () => {
  it("returns the same board object when nothing is filtered", () => {
    const b = twoColumns();
    expect(filterBoard(b, EMPTY_FILTER)).toBe(b);
  });

  it("hides non-matching tickets but keeps emptied columns", () => {
    const out = filterBoard(twoColumns(), f({ text: "csv" }));
    expect(ids(out, "todo")).toEqual(["csv"]);
    expect(ids(out, "done")).toEqual([]);
  });
});

describe("boardLabels", () => {
  it("lists labels most-used first", () => {
    expect(boardLabels(twoColumns())).toEqual(["bug", "auth", "feature"]);
  });
});

describe("URL round-trip", () => {
  it("survives serialising to query params and back", () => {
    const filter = f({ text: "safari login", labels: ["bug", "auth"], priorities: ["HIGH"], assignee: UNASSIGNED });
    expect(filterFromParams(new URLSearchParams(filterToParams(filter).toString()))).toEqual(filter);
  });

  it("drops priorities that aren't real, e.g. from a hand-edited URL", () => {
    expect(filterFromParams(new URLSearchParams("priority=HIGH&priority=CRITICAL")).priorities).toEqual(["HIGH"]);
  });
});
