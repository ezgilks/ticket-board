import { getIO, roomFor } from "./realtime.js";

// Everything that can change on a board, as pushed to connected clients.
export type BoardEvent =
  | { type: "ticket:upserted"; ticket: unknown }
  | { type: "ticket:deleted"; ticketId: string }
  | { type: "column:upserted"; column: unknown }
  | { type: "column:deleted"; columnId: string }
  | { type: "board:refresh" } // "something broad changed — refetch the board"
  | { type: "board:deleted" };

/**
 * The single choke point for "a board changed". Every write calls this, so
 * real-time delivery (and, later, cache invalidation) can't be forgotten in one route.
 *
 * originSocketId: the socket of the user who made the change. They already applied
 * it optimistically, so they're excluded from the broadcast.
 */
export async function publishBoardEvent(boardId: string, event: BoardEvent, originSocketId?: string) {
  const io = getIO();
  if (!io) return; // tests that don't start a socket server
  const room = io.to(roomFor(boardId));
  (originSocketId ? room.except(originSocketId) : room).emit("board:event", event);
}
