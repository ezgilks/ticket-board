import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server as IOServer } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeRealtime, initRealtime } from "../src/realtime.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

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
  await new Promise((resolve) => setTimeout(resolve, 100));
  await closeRealtime(io);
});

beforeEach(resetDb);

async function boardWithMembers() {
  const alice = await registerUser("Alice"); // owner
  const bob = await registerUser("Bob");
  const carol = await registerUser("Carol");
  const board = await createBoard(alice.auth);
  for (const u of [bob, carol]) {
    await request(app).post(`/boards/${board.id}/members`).set("Authorization", alice.auth).send({ email: u.email });
  }
  const remove = (targetId: string, auth: string) =>
    request(app).delete(`/boards/${board.id}/members/${targetId}`).set("Authorization", auth);
  const canSee = async (auth: string) => (await request(app).get(`/boards/${board.id}`).set("Authorization", auth)).status === 200;
  return { alice, bob, carol, board, remove, canSee };
}

describe("removing members", () => {
  it("lets the owner remove a member, who then loses access", async () => {
    const { alice, bob, remove, canSee } = await boardWithMembers();
    expect((await remove(bob.id, alice.auth)).status).toBe(204);
    expect(await canSee(bob.auth)).toBe(false);
  });

  it("lets a member leave", async () => {
    const { bob, remove, canSee } = await boardWithMembers();
    expect((await remove(bob.id, bob.auth)).status).toBe(204);
    expect(await canSee(bob.auth)).toBe(false);
  });

  it("does not let a member remove someone else", async () => {
    const { bob, carol, remove, canSee } = await boardWithMembers();
    expect((await remove(carol.id, bob.auth)).status).toBe(403);
    expect(await canSee(carol.auth)).toBe(true);
  });

  it("does not let the owner leave or be removed", async () => {
    const { alice, bob, remove } = await boardWithMembers();
    expect((await remove(alice.id, alice.auth)).status).toBe(400);
    expect((await remove(alice.id, bob.auth)).status).toBe(400);
  });

  it("unassigns the removed member's tickets and bumps their version", async () => {
    const { alice, bob, board, remove } = await boardWithMembers();
    const created = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", alice.auth)
      .send({ title: "Bob's task", columnId: board.columns[0].id, assigneeId: bob.id });

    await remove(bob.id, alice.auth);
    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", alice.auth);
    const ticket = res.body.board.columns[0].tickets.find((t: { id: string }) => t.id === created.body.ticket.id);
    expect(ticket.assigneeId).toBeNull();
    expect(ticket.version).toBe(2);
  });

  it("kicks the removed member's open tab out of the live room", async () => {
    const { alice, bob, board, remove } = await boardWithMembers();
    const bobSocket = connect(url, { auth: { token: bob.token }, transports: ["websocket"], forceNew: true });
    sockets.push(bobSocket);
    await new Promise((resolve) => bobSocket.emit("board:join", board.id, resolve));

    const events: string[] = [];
    bobSocket.on("board:event", (e: { type: string }) => events.push(e.type));
    const removed = new Promise<void>((resolve) =>
      bobSocket.on("board:event", (e: { type: string }) => e.type === "board:removed" && resolve()),
    );
    await remove(bob.id, alice.auth);
    await removed;

    // After eviction, changes to the board must not reach him.
    await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", alice.auth)
      .send({ title: "Secret plan", columnId: board.columns[0].id });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events).toEqual(["board:removed"]);
  });
});
