import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enrichSeededBoard } from "../src/ai/enrich.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { seedDemoBoard } from "../src/services/demoBoard.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";
import { startFakeAi } from "./fake-ai.js";

// aiStatus is what the UI reads to say "AI is still working on this" instead of showing
// a bare, silently-unlabelled card. The wait is real: the AI service sleeps when idle.
let fakeAi: Awaited<ReturnType<typeof startFakeAi>>;
let triageWorks = true;

beforeAll(async () => {
  fakeAi = await startFakeAi(() => {
    if (!triageWorks) throw new Error("boom");
    return { labels: ["bug"], priority: "HIGH", provider: "fake" };
  });
});
afterAll(async () => {
  config.AI_SERVICE_URL = "";
  await fakeAi.close();
});
beforeEach(async () => {
  await resetDb();
  triageWorks = true;
  fakeAi.calls.embed = 0;
  fakeAi.calls.triage = 0;
  fakeAi.state.unavailable = 0;
  config.AI_SERVICE_URL = "";
});

/** Waits for background enrichment, which by design isn't awaited by the request. */
async function settled(boardId: string) {
  for (let i = 0; i < 100; i++) {
    const pending = await prisma.ticket.count({ where: { boardId, aiStatus: "PENDING" } });
    if (pending === 0) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("enrichment never settled");
}

describe("ticket aiStatus", () => {
  it("is null when no AI service is configured, so the UI promises nothing", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);
    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ columnId: board.columns[0].id, title: "No AI here" });
    expect(res.body.ticket.aiStatus).toBeNull();
  });

  it("starts PENDING in the create response and reaches DONE", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);
    config.AI_SERVICE_URL = fakeAi.url;

    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ columnId: board.columns[0].id, title: "Login returns 500" });
    // The status is in the response body, so the card renders "triaging…" immediately.
    expect(res.body.ticket.aiStatus).toBe("PENDING");

    await settled(board.id);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.ticket.id } });
    expect(ticket.aiStatus).toBe("DONE");
  });

  it("ends FAILED when the AI service is unreachable", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);
    config.AI_SERVICE_URL = "http://127.0.0.1:1"; // nothing listening

    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ columnId: board.columns[0].id, title: "Nobody home" });
    expect(res.status).toBe(201); // creation never depends on the AI service

    await settled(board.id);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.ticket.id } });
    expect(ticket.aiStatus).toBe("FAILED");
  });

  // Regression, 2026-10-05: a guest's demo board was enriched while ai-service was still
  // waking up. The single batched embed failed once and all nine tickets ended FAILED.
  it("rides out a cold start: retries a 503 instead of failing the seeded board", async () => {
    const user = await registerUser();
    config.AI_SERVICE_URL = fakeAi.url;
    const board = await seedDemoBoard(user.id);
    fakeAi.state.unavailable = 2; // the first two requests reach a service that isn't up yet

    await enrichSeededBoard(board.id);

    const tickets = await prisma.ticket.findMany({ where: { boardId: board.id } });
    expect(tickets.every((t) => t.aiStatus === "DONE")).toBe(true);
  });

  it("does not retry a non-transient error", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);
    config.AI_SERVICE_URL = fakeAi.url;
    triageWorks = false; // the fake answers 500

    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ columnId: board.columns[0].id, title: "Broken provider" });
    await settled(board.id);

    expect(fakeAi.calls.triage).toBe(1);
    const ticket = await prisma.ticket.findUniqueOrThrow({ where: { id: res.body.ticket.id } });
    expect(ticket.aiStatus).toBe("FAILED");
  });

  it("marks only the ticket whose triage failed, not the whole seeded board", async () => {
    const user = await registerUser();
    config.AI_SERVICE_URL = fakeAi.url;
    const board = await seedDemoBoard(user.id);
    triageWorks = false; // embeddings still succeed; every triage call fails

    await enrichSeededBoard(board.id);

    const tickets = await prisma.ticket.findMany({ where: { boardId: board.id } });
    // Only the tickets the seed left unlabelled are triaged, so only those can fail.
    const failed = tickets.filter((t) => t.aiStatus === "FAILED");
    const done = tickets.filter((t) => t.aiStatus === "DONE");
    expect(failed.length).toBeGreaterThan(0);
    expect(done.length).toBeGreaterThan(0);
    expect(failed.length + done.length).toBe(tickets.length);
    // A failing triage must not cost the board its embeddings.
    const embedded = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM "Ticket" WHERE "boardId" = ${board.id} AND embedding IS NOT NULL
    `;
    expect(Number(embedded[0]?.n)).toBe(tickets.length);
  });

  // The AI service sleeps when idle on a free host, so one round-trip per ticket would
  // mean paying the wake-up cost once per ticket.
  it("embeds a whole seeded board in a single call, and triages only the blanks", async () => {
    const user = await registerUser();
    config.AI_SERVICE_URL = fakeAi.url;
    const board = await seedDemoBoard(user.id);

    await enrichSeededBoard(board.id);

    const tickets = await prisma.ticket.findMany({ where: { boardId: board.id } });
    expect(tickets.every((t) => t.aiStatus === "DONE")).toBe(true);
    expect(fakeAi.calls.embed).toBe(1);
    expect(fakeAi.calls.triage).toBe(tickets.filter((t) => t.aiTriage !== null).length);
    expect(fakeAi.calls.triage).toBeLessThan(tickets.length);
  });
});
