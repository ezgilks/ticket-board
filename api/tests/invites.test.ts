import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function ownerWithBoard() {
  const alice = await registerUser("Alice");
  const board = await createBoard(alice.auth, "Launch plan");
  const invite = (email: string, auth = alice.auth) =>
    request(app).post(`/boards/${board.id}/members`).set("Authorization", auth).send({ email });
  return { alice, board, invite };
}

const accept = (token: string, auth: string) =>
  request(app).post(`/invites/${token}/accept`).set("Authorization", auth);

describe("board invites", () => {
  it("still adds someone who already has an account directly", async () => {
    const { invite } = await ownerWithBoard();
    const bob = await registerUser("Bob");
    const res = await invite(bob.email);
    expect(res.status).toBe(201);
    expect(res.body.member.user.name).toBe("Bob");
    expect(res.body.token).toBeUndefined();
  });

  it("creates a pending invite with a one-time token for an unknown email", async () => {
    const { invite } = await ownerWithBoard();
    const res = await invite("New.Person@Example.com");
    expect(res.status).toBe(201);
    expect(res.body.invite.email).toBe("new.person@example.com");
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // Only a hash is stored: the database never holds a working link.
    const row = await prisma.boardInvite.findFirstOrThrow();
    expect(row.tokenHash).not.toContain(res.body.token);
    expect(row.tokenHash).toHaveLength(64);
  });

  it("describes the invite to someone signed out", async () => {
    const { invite } = await ownerWithBoard();
    const { token } = (await invite("bob@example.com")).body;
    const res = await request(app).get(`/invites/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.invite).toMatchObject({ boardName: "Launch plan", invitedBy: "Alice", email: "bob@example.com" });
  });

  it("lets a new user join by accepting, and only once", async () => {
    const { board, invite } = await ownerWithBoard();
    const { token } = (await invite("bob@example.com")).body;
    const bob = await registerUser("Bob");

    const res = await accept(token, bob.auth);
    expect(res.status).toBe(200);
    expect(res.body.boardId).toBe(board.id);
    const boardRes = await request(app).get(`/boards/${board.id}`).set("Authorization", bob.auth);
    expect(boardRes.status).toBe(200);

    // Single use: a forwarded or replayed link does nothing.
    const carol = await registerUser("Carol");
    expect((await accept(token, carol.auth)).status).toBe(404);
  });

  it("lets exactly one of two simultaneous accepts through", async () => {
    const { invite } = await ownerWithBoard();
    const { token } = (await invite("bob@example.com")).body;
    const [bob, carol] = [await registerUser("Bob"), await registerUser("Carol")];
    const results = await Promise.all([accept(token, bob.auth), accept(token, carol.auth)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
  });

  it("does not let someone join just by registering with the invited email", async () => {
    const { board, invite } = await ownerWithBoard();
    await invite("bob@example.com");
    // Registration doesn't verify emails, so the address alone must not grant access.
    const impostor = await request(app)
      .post("/auth/register")
      .send({ email: "bob@example.com", password: "password123", name: "Not Bob" });
    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", `Bearer ${impostor.body.token}`);
    expect(res.status).toBe(404);
  });

  it("rejects expired, garbage and revoked tokens", async () => {
    const { alice, board, invite } = await ownerWithBoard();
    const bob = await registerUser("Bob");

    const expired = (await invite("old@example.com")).body;
    await prisma.boardInvite.update({ where: { id: expired.invite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(expired.token, bob.auth)).status).toBe(404);

    expect((await request(app).get("/invites/not-a-token")).status).toBe(404);

    const revoked = (await invite("gone@example.com")).body;
    const del = await request(app)
      .delete(`/boards/${board.id}/invites/${revoked.invite.id}`)
      .set("Authorization", alice.auth);
    expect(del.status).toBe(204);
    expect((await accept(revoked.token, bob.auth)).status).toBe(404);
  });

  it("re-inviting the same email replaces the old link", async () => {
    const { alice, board, invite } = await ownerWithBoard();
    const first = (await invite("bob@example.com")).body.token;
    const second = (await invite("bob@example.com")).body.token;
    const bob = await registerUser("Bob");

    expect((await accept(first, bob.auth)).status).toBe(404);
    expect((await accept(second, bob.auth)).status).toBe(200);
    const list = await request(app).get(`/boards/${board.id}/invites`).set("Authorization", alice.auth);
    expect(list.body.invites).toEqual([]);
  });

  it("lists pending invites to the owner only", async () => {
    const { board, invite } = await ownerWithBoard();
    const bob = await registerUser("Bob");
    await invite(bob.email);
    await invite("pending@example.com");

    const res = await request(app).get(`/boards/${board.id}/invites`).set("Authorization", bob.auth);
    expect(res.status).toBe(403);
    // Members can't mint invites either.
    expect((await invite("x@example.com", bob.auth)).status).toBe(403);
  });
});
