import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initRealtime } from "../src/realtime.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

let server: Server;
let url: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve)); // port 0 = any free port
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(resetDb);

function open(token: string | undefined) {
  const socket = connect(url, { auth: token ? { token } : {}, transports: ["websocket"], forceNew: true });
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
});
