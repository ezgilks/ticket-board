import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { deleteExpiredGuests, GUEST_TTL_MS } from "../src/services/guests.js";
import { app, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

const newGuest = async () => (await request(app).post("/auth/guest")).body;

describe("guest accounts", () => {
  it("creates a signed-in guest with a populated demo board", async () => {
    const res = await request(app).post("/auth/guest");
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ isGuest: true });
    expect(res.body.user.name).toMatch(/^Guest \d{4}$/);
    expect(res.body.user.email).toMatch(/@guest\.invalid$/);

    const board = await request(app).get(`/boards/${res.body.boardId}`).set("Authorization", `Bearer ${res.body.token}`);
    expect(board.status).toBe(200);
    const tickets = board.body.board.columns.flatMap((c: { tickets: unknown[] }) => c.tickets);
    expect(tickets.length).toBeGreaterThan(0);
  });

  it("gives a token that expires with the account (24h), not the usual 7 days", async () => {
    const { token } = await newGuest();
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
  });

  it("can never sign in with a password", async () => {
    const { user } = await newGuest();
    const res = await request(app).post("/auth/login").send({ email: user.email, password: "!guest-account:no-password" });
    expect(res.status).toBe(401);
  });

  it("deletes expired guests and their boards, and nothing else", async () => {
    const old = await newGuest();
    const fresh = await newGuest();
    const real = await registerUser("Real person");
    // A real user's membership on the expired guest's board must not keep it alive
    // or block the delete.
    await request(app)
      .post(`/boards/${old.boardId}/members`)
      .set("Authorization", `Bearer ${old.token}`)
      .send({ email: real.email });

    await prisma.user.update({
      where: { id: old.user.id },
      data: { createdAt: new Date(Date.now() - GUEST_TTL_MS - 60_000) },
    });

    expect(await deleteExpiredGuests()).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: old.user.id } })).toBeNull();
    expect(await prisma.board.findUnique({ where: { id: old.boardId } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: fresh.user.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();

    // The expired guest's token now gets a clean 401, which signs the browser out.
    const me = await request(app).get("/auth/me").set("Authorization", `Bearer ${old.token}`);
    expect(me.status).toBe(401);
  });

  it("never deletes a real account, however old", async () => {
    const real = await registerUser("Old timer");
    await prisma.user.update({ where: { id: real.id }, data: { createdAt: new Date(2020, 0, 1) } });
    expect(await deleteExpiredGuests()).toBe(0);
    expect(await prisma.user.findUnique({ where: { id: real.id } })).not.toBeNull();
  });
});
