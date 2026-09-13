import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app, registerUser, resetDb } from "./helpers.js";

beforeAll(async () => {
  await resetDb();
});
afterAll(() => {
  delete process.env["RATE_LIMIT_IN_TESTS"];
});

describe("auth rate limiting", () => {
  it("limits login attempts but never /auth/me", async () => {
    const user = await registerUser();
    process.env["RATE_LIMIT_IN_TESTS"] = "1";

    for (let i = 0; i < 25; i++) {
      const me = await request(app).get("/auth/me").set("Authorization", user.auth);
      expect(me.status).toBe(200);
    }

    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      const res = await request(app).post("/auth/login").send({ email: user.email, password: "wrong-password" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
  }, 30_000); // 20 deliberate bcrypt comparisons at ~250ms each
});
