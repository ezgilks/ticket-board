import { Router } from "express";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { getRedis } from "../redis.js";

// Two probes, on purpose:
//
// /health        liveness: "is the process up?" Render polls this to decide whether to
//                restart the container, so it must NOT depend on the database — a
//                30-second Postgres blip shouldn't get a healthy API killed.
// /health/ready  readiness: "can it actually serve requests?" Checks every dependency.
//                The keep-alive workflow calls this, which also counts as database
//                activity and stops Supabase's free tier from pausing the project.
export const healthRouter = Router();

type Check = "ok" | "down" | "disabled";

const TIMEOUT_MS = 3000;

/** Rejects if `p` takes longer than TIMEOUT_MS, so a hung dependency can't hang the probe. */
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS).unref()),
  ]);
}

async function checkPostgres(): Promise<Check> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`);
    return "ok";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<Check> {
  if (!config.REDIS_URL) return "disabled"; // Redis is optional for a single instance
  const redis = getRedis();
  if (!redis) return "down"; // configured but not connected
  try {
    await withTimeout(redis.ping());
    return "ok";
  } catch {
    return "down";
  }
}

healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

healthRouter.get("/ready", async (_req, res) => {
  const [postgres, redis] = await Promise.all([checkPostgres(), checkRedis()]);
  const ready = postgres !== "down" && redis !== "down";
  // 503 makes the calling workflow fail, which is what turns it into an uptime alert.
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "degraded", checks: { postgres, redis } });
});
