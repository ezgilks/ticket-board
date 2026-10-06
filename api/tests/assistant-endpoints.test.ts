import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enrichTicket } from "../src/ai/enrich.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";
import { startFakeAi } from "./fake-ai.js";

// The endpoints added for non-browser clients (the MCP server): read one ticket,
// free-text semantic search, and an on-demand triage suggestion.

let fakeAi: Awaited<ReturnType<typeof startFakeAi>>;
let triageFails = false;

beforeAll(async () => {
  fakeAi = await startFakeAi(() => {
    if (triageFails) throw new Error("boom");
    return { labels: ["bug"], priority: "HIGH", provider: "fake" };
  });
});
afterAll(async () => {
  config.AI_SERVICE_URL = "";
  await fakeAi.close();
});
beforeEach(async () => {
  await resetDb();
  triageFails = false;
  // Created with AI off so no background job outlives the test; enrichment is awaited directly.
  config.AI_SERVICE_URL = "";
});

async function setup() {
  const user = await registerUser();
  const board = await createBoard(user.auth);
  const make = async (title: string) => {
    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ title, columnId: board.columns[0].id });
    return res.body.ticket;
  };
  return { user, board, make };
}

describe("GET /tickets/:id", () => {
  it("returns the ticket with its column name", async () => {
    const { user, board, make } = await setup();
    const t = await make("Read me");

    const res = await request(app).get(`/tickets/${t.id}`).set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body.ticket).toMatchObject({ id: t.id, title: "Read me", column: { name: board.columns[0].name } });
    expect(res.body.ticket).not.toHaveProperty("embedding");
  });

  it("is a 404 for someone who isn't on the board", async () => {
    const { make } = await setup();
    const t = await make("Private");
    const stranger = await registerUser("Stranger");

    const res = await request(app).get(`/tickets/${t.id}`).set("Authorization", stranger.auth);
    expect(res.status).toBe(404);
  });
});

describe("POST /boards/:id/search", () => {
  it("ranks the board's tickets by similarity to free text", async () => {
    const { user, board, make } = await setup();
    const tickets = [await make("login button broken"), await make("login page slow"), await make("footer year")];
    config.AI_SERVICE_URL = fakeAi.url;
    for (const t of tickets) await enrichTicket(t.id);

    const res = await request(app)
      .post(`/boards/${board.id}/search`)
      .set("Authorization", user.auth)
      .send({ query: "login button" });

    expect(res.status).toBe(200);
    expect(res.body.results.map((r: { title: string }) => r.title)).toEqual(["login button broken", "login page slow"]);
    expect(res.body.results[0]).toMatchObject({ columnName: board.columns[0].name });
  });

  it("is a 503 when the AI service is off, and a 404 for non-members", async () => {
    const { user, board } = await setup();
    const off = await request(app).post(`/boards/${board.id}/search`).set("Authorization", user.auth).send({ query: "x" });
    expect(off.status).toBe(503);

    config.AI_SERVICE_URL = fakeAi.url;
    const stranger = await registerUser("Stranger");
    const res = await request(app).post(`/boards/${board.id}/search`).set("Authorization", stranger.auth).send({ query: "x" });
    expect(res.status).toBe(404);
  });

  it("rejects an empty query", async () => {
    const { user, board } = await setup();
    config.AI_SERVICE_URL = fakeAi.url;
    const res = await request(app).post(`/boards/${board.id}/search`).set("Authorization", user.auth).send({ query: "  " });
    expect(res.status).toBe(400);
  });
});

describe("POST /tickets/:id/triage", () => {
  it("returns a suggestion without changing the ticket", async () => {
    const { user, make } = await setup();
    const t = await make("Login returns 500");
    config.AI_SERVICE_URL = fakeAi.url;

    const res = await request(app).post(`/tickets/${t.id}/triage`).set("Authorization", user.auth);
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toEqual({ labels: ["bug"], priority: "HIGH", provider: "fake" });

    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(stored).toMatchObject({ priority: "MEDIUM", labels: [], version: 1 });
  });

  it("is a 503 when the AI service fails", async () => {
    const { user, make } = await setup();
    const t = await make("Anything");
    config.AI_SERVICE_URL = fakeAi.url;
    triageFails = true;

    const res = await request(app).post(`/tickets/${t.id}/triage`).set("Authorization", user.auth);
    expect(res.status).toBe(503);
  });
});
