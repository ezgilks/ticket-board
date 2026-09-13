import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server as IOServer } from "socket.io";
import { closeRealtime, getIO, initRealtime } from "../src/realtime.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

let server: Server;
let io: IOServer;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  io = await initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve)); // port 0 = any free port
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await closeRealtime(io);
});

beforeEach(resetDb);

function open(token: string | undefined, target = url) {
  const socket = connect(target, { auth: token ? { token } : {}, transports: ["websocket"], forceNew: true });
  sockets.push(socket);
  return socket;
}

const join = (socket: Socket, boardId: string) =>
  new Promise<{ ok: boolean }>((resolve) => socket.emit("board:join", boardId, resolve));

const nextEvent = (socket: Socket) =>
  new Promise<{ type: string; ticket?: { title: string } }>((resolve) => socket.once("board:event", resolve));

describe("realtime", () => {
  it("rejects connections without a valid token", async () => {
    const socket = open("not-a-token");
    const err = await new Promise<Error>((resolve) => socket.on("connect_error", resolve));
    expect(err.message).toBe("unauthorized");
  });

  it("refuses to let non-members join a board room", async () => {
    const alice = await registerUser("Alice");
    const mallory = await registerUser("Mallory");
    const board = await createBoard(alice.auth);

    expect(await join(open(mallory.token), board.id)).toEqual({ ok: false });
  });

  it("pushes a ticket created by one member to another member's socket", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    const board = await createBoard(alice.auth);
    await request(app).post(`/boards/${board.id}/members`).set("Authorization", alice.auth).send({ email: bob.email });

    const bobSocket = open(bob.token);
    expect(await join(bobSocket, board.id)).toEqual({ ok: true });

    const received = nextEvent(bobSocket);
    await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", alice.auth)
      .send({ title: "Live!", columnId: board.columns[0].id });

    const event = await received;
    expect(event.type).toBe("ticket:upserted");
    expect(event.ticket?.title).toBe("Live!");
  });

  it("delivers events across API instances through the Redis adapter", async () => {
    // Server B: a second, independent Socket.io server — as if it were another container.
    const serverB = createServer(app);
    const ioB = await initRealtime(serverB); // publishBoardEvent now emits via B
    expect(getIO()).toBe(ioB);

    const alice = await registerUser("Alice");
    const board = await createBoard(alice.auth);

    // Alice's socket is connected to server A only.
    const socketOnA = open(alice.token);
    expect(await join(socketOnA, board.id)).toEqual({ ok: true });

    const received = nextEvent(socketOnA);
    await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", alice.auth)
      .send({ title: "Cross-instance", columnId: board.columns[0].id });

    // Emitted on B, published to Redis, picked up by A, delivered to Alice.
    expect((await received).ticket?.title).toBe("Cross-instance");
    await closeRealtime(ioB);
  });
});
