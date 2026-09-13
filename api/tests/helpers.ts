import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { getRedis } from "../src/redis.js";

export const app = createApp();

// Wipe every table between tests so each test starts from a known-empty state.
export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Ticket", "Column", "BoardMember", "Board", "User" RESTART IDENTITY CASCADE',
  );
  await getRedis()?.flushDb(); // only DB 1 — see vitest.config.ts
}

let counter = 0;

export async function registerUser(name = "User") {
  counter += 1;
  const email = `user${counter}-${Date.now()}@test.com`;
  const res = await request(app)
    .post("/auth/register")
    .send({ email, password: "password123", name });
  if (res.status !== 201) throw new Error(`register failed: ${JSON.stringify(res.body)}`);
  return { ...res.body.user, email, token: res.body.token as string, auth: `Bearer ${res.body.token}` };
}

export async function createBoard(auth: string, name = "Board") {
  const res = await request(app).post("/boards").set("Authorization", auth).send({ name });
  const board = await request(app).get(`/boards/${res.body.board.id}`).set("Authorization", auth);
  return board.body.board;
}
