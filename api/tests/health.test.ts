import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { connectRedis, disconnectRedis } from "../src/redis.js";
import { app } from "./helpers.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("health probes", () => {
  it("/health answers without touching the database", async () => {
    const query = vi.spyOn(prisma, "$queryRaw");
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(query).not.toHaveBeenCalled();
  });

  it("/health/ready reports ok when Postgres and Redis both answer", async () => {
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", checks: { postgres: "ok", redis: "ok" } });
  });

  it("/health/ready returns 503 when Postgres is unreachable", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connection refused"));
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ postgres: "down", redis: "ok" });
  });

  it("/health/ready returns 503 when Redis is configured but not connected", async () => {
    await disconnectRedis();
    try {
      const res = await request(app).get("/health/ready");
      expect(res.status).toBe(503);
      expect(res.body.checks).toEqual({ postgres: "ok", redis: "down" });
    } finally {
      await connectRedis();
    }
  });
});
