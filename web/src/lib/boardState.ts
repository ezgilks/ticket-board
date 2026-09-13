import type { Board, Column, Ticket } from "./types";

// Pure functions: (board, change) -> new board. They never mutate, which is what
// lets React notice the change. Drag-and-drop and live socket events both use these.

const byPosition = (a: Ticket, b: Ticket) => a.position - b.position;

export function findTicket(board: Board, ticketId: string) {
  for (const column of board.columns) {
    const index = column.tickets.findIndex((t) => t.id === ticketId);
    if (index !== -1) return { column, index, ticket: column.tickets[index] as Ticket };
  }
  return null;
}

/** Move a ticket to `index` within `toColumnId` (index counted without the ticket itself). */
export function moveTicketLocal(board: Board, ticketId: string, toColumnId: string, index: number): Board {
  const found = findTicket(board, ticketId);
  if (!found) return board;
  const moved = { ...found.ticket, columnId: toColumnId };

  return {
    ...board,
    columns: board.columns.map((col) => {
      let tickets = col.tickets.filter((t) => t.id !== ticketId);
      if (col.id === toColumnId) {
        tickets = [...tickets.slice(0, index), moved, ...tickets.slice(index)];
      }
      return tickets === col.tickets ? col : { ...col, tickets };
    }),
  };
}

/** Insert or replace a ticket that came from the server, keeping columns sorted by position. */
export function upsertTicket(board: Board, ticket: Ticket): Board {
  return {
    ...board,
    columns: board.columns.map((col) => {
      const without = col.tickets.filter((t) => t.id !== ticket.id);
      if (col.id !== ticket.columnId) {
        return without.length === col.tickets.length ? col : { ...col, tickets: without };
      }
      return { ...col, tickets: [...without, ticket].sort(byPosition) };
    }),
  };
}

export function removeTicket(board: Board, ticketId: string): Board {
  return {
    ...board,
    columns: board.columns.map((col) => ({ ...col, tickets: col.tickets.filter((t) => t.id !== ticketId) })),
  };
}

export function upsertColumn(board: Board, column: Column): Board {
  const exists = board.columns.some((c) => c.id === column.id);
  const columns = exists
    ? board.columns.map((c) => (c.id === column.id ? { ...c, name: column.name } : c))
    : [...board.columns, { ...column, tickets: column.tickets ?? [] }];
  return { ...board, columns: columns.sort((a, b) => a.position - b.position) };
}

export function removeColumn(board: Board, columnId: string): Board {
  return { ...board, columns: board.columns.filter((c) => c.id !== columnId) };
}
