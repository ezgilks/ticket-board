import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { enrichTicket } from "../src/ai/enrich.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";
import { startFakeAi } from "./fake-ai.js";

let fakeAi: Awaited<ReturnType<typeof startFakeAi>>;
let triageStatus = 200;

beforeAll(async () => {
  fakeAi = await startFakeAi(() => {
    if (triageStatus !== 200) throw new Error("boom");
    return { labels: ["bug", "auth"], priority: "URGENT", provider: "fake" };
  });
});
afterAll(async () => {
  config.AI_SERVICE_URL = "";
  await fakeAi.close();
});
beforeEach(async () => {
  await resetDb();
  triageStatus = 200;
  // Tickets are created with AI off (so no background job races the test), then
  // enrichTicket is awaited directly with AI on.
  config.AI_SERVICE_URL = "";
});

async function newTicket(body: Record<string, unknown>) {
  const user = await registerUser();
  const board = await createBoard(user.auth);
  const res = await request(app)
    .post(`/boards/${board.id}/tickets`)
    .set("Authorization", user.auth)
    .send({ columnId: board.columns[0].id, ...body });
  config.AI_SERVICE_URL = fakeAi.url;
  return res.body.ticket;
}

describe("AI triage", () => {
  it("fills in priority and labels the user left blank", async () => {
    const t = await newTicket({ title: "Login returns 500" });
    await enrichTicket(t.id, { triage: true, applyPriority: true, applyLabels: true });

    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(updated.priority).toBe("URGENT");
    expect(updated.labels).toEqual(["bug", "auth"]);
    expect(updated.aiTriage).toMatchObject({ provider: "fake", applied: ["priority", "labels"] });
  });

  it("never overrides a priority the user chose, but still records the suggestion", async () => {
    const t = await newTicket({ title: "Login returns 500", priority: "LOW" });
    await enrichTicket(t.id, { triage: true, applyPriority: false, applyLabels: true });

    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(updated.priority).toBe("LOW");
    expect(updated.aiTriage).toMatchObject({ priority: "URGENT", applied: ["labels"] });
  });

  it("leaves the ticket untouched when the AI service errors", async () => {
    const t = await newTicket({ title: "Anything" });
    triageStatus = 500;
    await enrichTicket(t.id, { triage: true, applyPriority: true, applyLabels: true });

    const updated = await prisma.ticket.findUniqueOrThrow({ where: { id: t.id } });
    expect(updated.priority).toBe("MEDIUM");
    expect(updated.aiTriage).toBeNull();
  });
});
