import { useEffect, useState } from "react";
import { getSocket } from "./socket";
import type { User } from "./types";

/**
 * Who else has this board open right now.
 *
 * Presence is ephemeral: the server derives it from live socket connections and never
 * stores it, so there is nothing to clean up when a browser dies. The list arrives
 * whenever someone joins or leaves — this hook only listens; `useBoardSocket` owns
 * joining the room.
 */
export function useBoardPresence(boardId: string | undefined): User[] {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setUsers([]); // a different board starts from nothing
    if (!boardId) return;
    const socket = getSocket();

    // Events carry their board id: switching boards fast can otherwise apply a late
    // broadcast from the previous room to the new one.
    const handle = (payload: { boardId: string; users: User[] }) => {
      if (payload.boardId === boardId) setUsers(payload.users);
    };

    socket.on("board:presence", handle);
    return () => {
      socket.off("board:presence", handle);
    };
  }, [boardId]);

  return users;
}
