import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { corsOrigins } from "./config.js";
import { verifyToken } from "./lib/jwt.js";
import { assertMember } from "./services/access.js";

// Socket.io keeps a persistent connection open between browser and server, so
// the server can *push* changes instead of clients polling for them.
//
// Rooms: each board is a room named "board:<id>". Emitting to a room reaches
// only the sockets that joined it — i.e. people currently looking at that board.

let io: Server | null = null;

export const roomFor = (boardId: string) => `board:${boardId}`;

export function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: corsOrigins } });

  // Handshake auth: runs once per connection, before any events. Same JWT as REST.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth["token"];
      if (typeof token !== "string") throw new Error("missing token");
      socket.data.userId = verifyToken(token);
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    // Clients ask to join a board's room. Membership is checked here too —
    // otherwise anyone could listen in on any board by guessing its id.
    socket.on("board:join", async (boardId: unknown, ack?: (res: { ok: boolean }) => void) => {
      try {
        if (typeof boardId !== "string") throw new Error("bad id");
        await assertMember(socket.data.userId, boardId);
        await socket.join(roomFor(boardId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on("board:leave", async (boardId: unknown) => {
      if (typeof boardId === "string") await socket.leave(roomFor(boardId));
    });
  });

  return io;
}

export function getIO() {
  return io;
}
