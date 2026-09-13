import { afterAll, beforeAll } from "vitest";
import { prisma } from "../src/db.js";
import { connectRedis, disconnectRedis } from "../src/redis.js";

// Per-file setup: connect the shared Redis client the way index.ts does.
beforeAll(async () => {
  await connectRedis();
});

afterAll(async () => {
  await disconnectRedis();
  await prisma.$disconnect();
});
