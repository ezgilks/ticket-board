import type { Board, Priority, Ticket } from "./types";

// Board search + filters. Everything here is a pure function over the board already in
// memory: the full board is loaded (and kept live over the socket) anyway, so filtering
// client-side is instant, needs no API, and live updates keep working while filtered.
//
// The filter lives in the URL (?q=…&label=…&priority=…&assignee=…), so a filtered view
// survives a reload and can be shared as a link.

export const UNASSIGNED = "none";

export interface BoardFilter {
  text: string;
  labels: string[]; // OR within the group: any selected label matches
  priorities: Priority[]; // OR within the group
  assignee: string | null; // a user id, UNASSIGNED, or null for anyone
}

export const EMPTY_FILTER: BoardFilter = { text: "", labels: [], priorities: [], assignee: null };

export const isFiltering = (f: BoardFilter) =>
  f.text.trim() !== "" || f.labels.length > 0 || f.priorities.length > 0 || f.assignee !== null;

/** Groups are ANDed together; within a group, any selected value matches. */
export function matches(ticket: Ticket, f: BoardFilter): boolean {
  if (f.priorities.length && !f.priorities.includes(ticket.priority)) return false;
  if (f.labels.length && !ticket.labels.some((l) => f.labels.includes(l))) return false;
  if (f.assignee === UNASSIGNED && ticket.assigneeId !== null) return false;
  if (f.assignee && f.assignee !== UNASSIGNED && ticket.assigneeId !== f.assignee) return false;

  // Every word must appear somewhere, in any order: "safari login" finds
  // "Login fails on iOS Safari".
  const words = f.text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) {
    const haystack = `${ticket.title} ${ticket.description ?? ""}`.toLowerCase();
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  return true;
}

/** The board with non-matching tickets hidden. Columns are kept even when emptied. */
export function filterBoard(board: Board, f: BoardFilter): Board {
  if (!isFiltering(f)) return board;
  return { ...board, columns: board.columns.map((c) => ({ ...c, tickets: c.tickets.filter((t) => matches(t, f)) })) };
}

/** Every label in use on the board, most used first, for the filter chips. */
export function boardLabels(board: Board): string[] {
  const counts = new Map<string, number>();
  for (const c of board.columns) for (const t of c.tickets) for (const l of t.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([l]) => l);
}

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export function filterFromParams(params: URLSearchParams): BoardFilter {
  return {
    text: params.get("q") ?? "",
    labels: params.getAll("label"),
    // Ignore anything that isn't a real priority, e.g. a hand-edited URL.
    priorities: params.getAll("priority").filter((p): p is Priority => PRIORITIES.includes(p as Priority)),
    assignee: params.get("assignee"),
  };
}

export function filterToParams(f: BoardFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (f.text) params.set("q", f.text);
  for (const l of f.labels) params.append("label", l);
  for (const p of f.priorities) params.append("priority", p);
  if (f.assignee) params.set("assignee", f.assignee);
  return params;
}
