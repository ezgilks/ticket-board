import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { getRedis } from "../src/redis.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("board cache", () => {
  it("caches the board on read and invalidates it on write", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth); // createBoard helper performs a GET
    const key = `board:${board.id}:full`;

    expect(await getRedis()?.exists(key)).toBe(1);

    await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ title: "New", columnId: board.columns[0].id });
    expect(await getRedis()?.exists(key)).toBe(0);

    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", user.auth);
    expect(res.body.board.columns[0].tickets).toHaveLength(1); // not stale
  });

  it("still checks membership when the board is cached", async () => {
    const owner = await registerUser();
    const stranger = await registerUser();
    const board = await createBoard(owner.auth);

    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", stranger.auth);
    expect(res.status).toBe(404);
  });
});
