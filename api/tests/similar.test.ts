import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enrichTicket } from "../src/ai/enrich.js";
import { config } from "../src/config.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";
import { startFakeAi } from "./fake-ai.js";

let fakeAi: Awaited<ReturnType<typeof startFakeAi>>;

beforeAll(async () => {
  fakeAi = await startFakeAi();
});
afterAll(async () => {
  config.AI_SERVICE_URL = "";
  await fakeAi.close();
});
beforeEach(async () => {
  await resetDb();
  config.AI_SERVICE_URL = fakeAi.url;
});

describe("similar tickets (pgvector)", () => {
  it("ranks tickets by embedding similarity within the same board", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);
    const columnId = board.columns[0].id;

    const make = async (title: string, boardId = board.id) => {
      const res = await request(app)
        .post(`/boards/${boardId}/tickets`)
        .set("Authorization", user.auth)
        .send({ title, columnId: boardId === board.id ? columnId : other.columns[0].id });
      await enrichTicket(res.body.ticket.id); // await directly instead of the background call
      return res.body.ticket;
    };
    const other = await createBoard(user.auth, "Other");

    const source = await make("login page button broken");
    await make("login button broken on mobile");
    await make("login page slow");
    await make("update footer copyright year");
    await make("login page button broken", other.id); // identical, but a different board

    const res = await request(app).get(`/tickets/${source.id}/similar`).set("Authorization", user.auth);

    expect(res.status).toBe(200);
    const titles = res.body.similar.map((s: { title: string }) => s.title);
    expect(titles).toEqual(["login button broken on mobile", "login page slow"]);
    expect(res.body.similar[0].similarity).toBeGreaterThan(res.body.similar[1].similarity);
  });

  it("returns an empty list when the ticket has no embedding yet", async () => {
    config.AI_SERVICE_URL = "";
    const user = await registerUser();
    const board = await createBoard(user.auth);
    const t = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ title: "No vector", columnId: board.columns[0].id });

    const res = await request(app).get(`/tickets/${t.body.ticket.id}/similar`).set("Authorization", user.auth);
    expect(res.body.similar).toEqual([]);
  });
});
