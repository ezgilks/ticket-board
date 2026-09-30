import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server as IOServer } from "socket.io";
import { closeRealtime, initRealtime } from "../src/realtime.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

// Presence is derived from live sockets and never stored, so these tests drive real
// socket connections rather than poking at a table.
let server: Server;
let io: IOServer;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  io = await initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  // Each disconnect fires a presence broadcast, which talks to Redis through the adapter.
  // Let those finish before the Redis clients are closed underneath them.
  await new Promise((resolve) => setTimeout(resolve, 100));
  await closeRealtime(io);
});

beforeEach(resetDb);

function open(token: string, target = url) {
  const socket = connect(target, { auth: { token }, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  return socket;
}

const join = (socket: Socket, boardId: string) =>
  new Promise<{ ok: boolean }>((resolve) => socket.emit("board:join", boardId, resolve));

interface Presence {
  boardId: string;
  users: { id: string; name: string }[];
}

/** Resolves on the next presence broadcast that satisfies `where`. */
function nextPresence(socket: Socket, where: (p: Presence) => boolean = () => true) {
  return new Promise<Presence>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no matching presence event")), 4000);
    const handler = (p: Presence) => {
      if (!where(p)) return;
      clearTimeout(timer);
      socket.off("board:presence", handler);
      resolve(p);
    };
    socket.on("board:presence", handler);
  });
}

async function boardWithTwoMembers() {
  const alice = await registerUser("Alice");
  const bob = await registerUser("Bob");
  const board = await createBoard(alice.auth);
  await request(app).post(`/boards/${board.id}/members`).set("Authorization", alice.auth).send({ email: bob.email });
  return { alice, bob, board };
}

describe("presence", () => {
  it("tells a joiner they are the only viewer, with their name from the database", async () => {
    const alice = await registerUser("Alice");
    const board = await createBoard(alice.auth);
    const socket = open(alice.token);

    const presence = nextPresence(socket);
    await join(socket, board.id);

    const p = await presence;
    expect(p.boardId).toBe(board.id);
    expect(p.users).toHaveLength(1);
    expect(p.users[0]?.name).toBe("Alice");
  });

  it("notifies the people already on a board when someone else arrives", async () => {
    const { alice, bob, board } = await boardWithTwoMembers();
    const aliceSocket = open(alice.token);
    await join(aliceSocket, board.id);

    // Alice should hear about Bob without doing anything herself.
    const twoViewers = nextPresence(aliceSocket, (p) => p.users.length === 2);
    const bobSocket = open(bob.token);
    await join(bobSocket, board.id);

    const names = (await twoViewers).users.map((u) => u.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("counts a person once however many tabs they have open", async () => {
    const alice = await registerUser("Alice");
    const board = await createBoard(alice.auth);
    const tab1 = open(alice.token);
    await join(tab1, board.id);

    const afterSecondTab = nextPresence(tab1);
    const tab2 = open(alice.token);
    await join(tab2, board.id);

    expect((await afterSecondTab).users).toHaveLength(1);
  });

  it("drops someone from the list when their socket disconnects", async () => {
    const { alice, bob, board } = await boardWithTwoMembers();
    const aliceSocket = open(alice.token);
    await join(aliceSocket, board.id);
    const bobSocket = open(bob.token);
    await join(bobSocket, board.id);
    await nextPresence(aliceSocket, (p) => p.users.length === 2);

    const backToOne = nextPresence(aliceSocket, (p) => p.users.length === 1);
    bobSocket.disconnect();
    expect((await backToOne).users[0]?.name).toBe("Alice");
  });

  it("drops someone who leaves the board without disconnecting", async () => {
    const { alice, bob, board } = await boardWithTwoMembers();
    const aliceSocket = open(alice.token);
    await join(aliceSocket, board.id);
    const bobSocket = open(bob.token);
    await join(bobSocket, board.id);
    await nextPresence(aliceSocket, (p) => p.users.length === 2);

    const backToOne = nextPresence(aliceSocket, (p) => p.users.length === 1);
    bobSocket.emit("board:leave", board.id);
    expect((await backToOne).users[0]?.name).toBe("Alice");
  });

  // The reason the Redis adapter exists. fetchSockets() asks every instance over pub/sub;
  // without the adapter each server would only ever see its own connections and report 1.
  it("counts viewers on a different API instance", async () => {
    const { alice, bob, board } = await boardWithTwoMembers();

    const serverB = createServer(app);
    const ioB = await initRealtime(serverB);
    await new Promise<void>((resolve) => serverB.listen(0, resolve));
    const urlB = `http://localhost:${(serverB.address() as AddressInfo).port}`;

    const aliceOnA = open(alice.token, url);
    await join(aliceOnA, board.id);

    const bothSeen = nextPresence(aliceOnA, (p) => p.users.length === 2);
    const bobOnB = open(bob.token, urlB);
    await join(bobOnB, board.id);

    const names = (await bothSeen).users.map((u) => u.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);

    // Also assert the removal crosses instances — and wait for it, so the adapter isn't
    // still publishing over Redis when the server below is torn down.
    const backToOne = nextPresence(aliceOnA, (p) => p.users.length === 1);
    bobOnB.disconnect();
    expect((await backToOne).users[0]?.name).toBe("Alice");

    await closeRealtime(ioB);
    await new Promise<void>((resolve) => serverB.close(() => resolve()));
  });
});
