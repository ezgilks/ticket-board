import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server, type Socket } from "socket.io";
import { config, corsOrigins } from "./config.js";
import { prisma } from "./db.js";
import { verifyToken } from "./lib/jwt.js";
import { getRedis } from "./redis.js";
import { assertMember } from "./services/access.js";

// Socket.io keeps a persistent connection open between browser and server, so
// the server can *push* changes instead of clients polling for them.
//
// Rooms: each board is a room named "board:<id>". Emitting to a room reaches
// only the sockets that joined it — i.e. people currently looking at that board.

let io: Server | null = null;

export const roomFor = (boardId: string) => `board:${boardId}`;

/** Who is looking at a board right now. Ephemeral — never stored, derived from live sockets. */
export interface PresentUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Broadcasts the list of users currently in a board's room.
 *
 * fetchSockets() is adapter-aware: with the Redis adapter it asks *every* API instance
 * over pub/sub, not just this process. Without it the count would only ever reflect
 * the one container that happened to answer — which is exactly the bug the adapter exists
 * to prevent.
 *
 * excludeSocketId is for the `disconnecting` event, which fires while the leaving socket
 * is still a member of the room.
 */
async function broadcastPresence(server: Server, boardId: string, excludeSocketId?: string) {
  const room = roomFor(boardId);
  try {
    const sockets = await server.in(room).fetchSockets();
    // One entry per person, not per tab: three open tabs is still one viewer.
    const byId = new Map<string, PresentUser>();
    for (const s of sockets) {
      if (s.id === excludeSocketId) continue;
      const user = s.data.user as PresentUser | undefined;
      if (user) byId.set(user.id, user);
    }
    server.to(room).emit("board:presence", { boardId, users: [...byId.values()] });
  } catch (err) {
    // Presence is a nicety; never let it take down a connection.
    console.error("[presence] broadcast failed", err instanceof Error ? err.message : err);
  }
}

export async function initRealtime(server: HttpServer) {
  io = new Server(server, { cors: { origin: corsOrigins } });

  // Without this, io.to(room).emit() only reaches sockets connected to *this*
  // process. Run two API containers behind a load balancer and users on different
  // containers never see each other's changes.
  //
  // The Redis adapter fixes that with pub/sub: every emit is also published to Redis,
  // and every API instance subscribes and forwards it to its own local sockets.
  const redis = getRedis();
  if (redis && config.REDIS_URL) {
    const pub = redis.duplicate();
    const sub = redis.duplicate(); // a subscribed connection can't run other commands
    pub.on("error", (err) => console.error("[redis pub]", err.message));
    sub.on("error", (err) => console.error("[redis sub]", err.message));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    serverClients.set(io, [pub, sub]);
  }

  // Handshake auth: runs once per connection, before any events. Same JWT as REST.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth["token"];
      if (typeof token !== "string") throw new Error("missing token");
      const userId = verifyToken(token);
      // One lookup per connection (not per event) so presence can show names rather
      // than ids. The name comes from the database, never from the client.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });
      if (!user) throw new Error("unknown user");
      socket.data.userId = userId;
      socket.data.user = user;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  const ioServer = io; // captured: `io` is reassigned if another instance is initialised
  ioServer.on("connection", (socket: Socket) => {
    // Clients ask to join a board's room. Membership is checked here too —
    // otherwise anyone could listen in on any board by guessing its id.
    socket.on("board:join", async (boardId: unknown, ack?: (res: { ok: boolean }) => void) => {
      try {
        if (typeof boardId !== "string") throw new Error("bad id");
        await assertMember(socket.data.userId, boardId);
        await socket.join(roomFor(boardId));
        ack?.({ ok: true });
        await broadcastPresence(ioServer, boardId);
      } catch {
        ack?.({ ok: false });
      }
    });

    socket.on("board:leave", async (boardId: unknown) => {
      if (typeof boardId !== "string") return;
      await socket.leave(roomFor(boardId));
      await broadcastPresence(ioServer, boardId);
    });

    // "disconnecting", not "disconnect": by the time "disconnect" fires the socket has
    // already left every room, so there would be no way to tell which boards to update.
    socket.on("disconnecting", () => {
      for (const room of socket.rooms) {
        if (room === socket.id) continue; // every socket is in a room named after itself
        const boardId = room.slice("board:".length);
        const pending = broadcastPresence(ioServer, boardId, socket.id);
        inFlightPresence.add(pending);
        void pending.finally(() => inFlightPresence.delete(pending));
      }
    });
  });

  return io;
}

export function getIO() {
  return io;
}

/**
 * Pull a removed member's open tabs out of the board's room, on every API instance.
 *
 * Membership is checked when a socket *joins* a room, not on every event. So without this,
 * someone removed from a board would keep receiving its live updates until they reloaded.
 * fetchSockets() goes through the Redis adapter, so it finds their sockets wherever they're
 * connected, and leave()/emit() on those remote sockets are relayed the same way.
 */
export async function evictFromBoard(boardId: string, userId: string) {
  if (!io) return;
  const room = roomFor(boardId);
  const sockets = await io.in(room).fetchSockets();
  for (const s of sockets) {
    if (s.data.userId !== userId) continue;
    s.emit("board:event", { type: "board:removed" });
    s.leave(room);
  }
  await broadcastPresence(io, boardId);
}

// Disconnect-triggered broadcasts are fire-and-forget, so shutdown has to wait for them:
// quitting Redis underneath one makes its publish reject with "client is closed".
const inFlightPresence = new Set<Promise<void>>();

const serverClients = new WeakMap<Server, { quit: () => Promise<unknown> }[]>();

// Close the server and its dedicated Redis connections (used by tests and shutdown).
export async function closeRealtime(server: Server) {
  await server.close();
  await Promise.all(inFlightPresence);
  await Promise.all((serverClients.get(server) ?? []).map((c) => c.quit()));
}
