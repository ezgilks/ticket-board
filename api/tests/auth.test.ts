import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("auth", () => {
  it("registers a user and never returns the password hash", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "Ada@Example.com", password: "password123", name: "Ada" });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.email).toBe("ada@example.com"); // normalised
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    const body = { email: "dup@example.com", password: "password123", name: "A" };
    await request(app).post("/auth/register").send(body);
    const res = await request(app).post("/auth/register").send(body);
    expect(res.status).toBe(409);
  });

  it("validates input", async () => {
    const res = await request(app).post("/auth/register").send({ email: "nope", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.issues.length).toBeGreaterThan(0);
  });

  it("logs in with the right password only, with the same error for unknown emails", async () => {
    const user = await registerUser();
    const good = await request(app).post("/auth/login").send({ email: user.email, password: "password123" });
    const bad = await request(app).post("/auth/login").send({ email: user.email, password: "wrong-password" });
    const unknown = await request(app).post("/auth/login").send({ email: "ghost@x.com", password: "whatever1" });

    expect(good.status).toBe(200);
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error).toBe(unknown.body.error);
  });

  it("protects /auth/me", async () => {
    const user = await registerUser("Grace");
    expect((await request(app).get("/auth/me")).status).toBe(401);
    expect((await request(app).get("/auth/me").set("Authorization", "Bearer garbage")).status).toBe(401);

    const res = await request(app).get("/auth/me").set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe("Grace");
  });
});
