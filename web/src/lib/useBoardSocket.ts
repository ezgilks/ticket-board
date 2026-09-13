import { useEffect, useRef } from "react";
import { getSocket } from "./socket";
import type { Column, Ticket } from "./types";

export type BoardEvent =
  | { type: "ticket:upserted"; ticket: Ticket }
  | { type: "ticket:deleted"; ticketId: string }
  | { type: "column:upserted"; column: Column }
  | { type: "column:deleted"; columnId: string }
  | { type: "board:refresh" }
  | { type: "board:deleted" };

/**
 * Joins the board's room and calls onEvent for every change pushed by the server.
 * onResync fires after a reconnect: events sent while offline are gone for good,
 * so the only safe move is to refetch the whole board.
 */
export function useBoardSocket(boardId: string | undefined, onEvent: (e: BoardEvent) => void, onResync: () => void) {
  // Refs hold the latest callbacks without re-running the effect (and re-joining) on every render.
  const eventRef = useRef(onEvent);
  const resyncRef = useRef(onResync);
  eventRef.current = onEvent;
  resyncRef.current = onResync;

  useEffect(() => {
    if (!boardId) return;
    const socket = getSocket();
    let connectedBefore = socket.connected;

    const join = () => {
      socket.emit("board:join", boardId);
      if (connectedBefore) resyncRef.current();
      connectedBefore = true;
    };
    const handle = (e: BoardEvent) => eventRef.current(e);

    if (socket.connected) socket.emit("board:join", boardId);
    socket.on("connect", join);
    socket.on("board:event", handle);

    return () => {
      socket.emit("board:leave", boardId);
      socket.off("connect", join);
      socket.off("board:event", handle);
    };
  }, [boardId]);
}
