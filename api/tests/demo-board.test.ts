import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db.js";
import { DEMO_BOARD_NAME, seedDemoBoard } from "../src/services/demoBoard.js";
import { app, registerUser, resetDb } from "./helpers.js";

// SEED_DEMO_BOARD is "off" for the suite (see vitest.config.ts), so registration
// itself stays empty and the other tests can assert on exact board lists. The seed
// is exercised directly here instead.
describe("demo board seed", () => {
  beforeEach(resetDb);

  it("is not seeded on register while the flag is off", async () => {
    const user = await registerUser();
    const res = await request(app).get("/boards").set("Authorization", user.auth);
    expect(res.body.boards).toEqual([]);
  });

  it("creates a board the new user owns, with columns and tickets", async () => {
    const user = await registerUser();
    await seedDemoBoard(user.id);

    const res = await request(app).get("/boards").set("Authorization", user.auth);
    expect(res.body.boards).toHaveLength(1);
    expect(res.body.boards[0].name).toBe(DEMO_BOARD_NAME);

    const board = await request(app).get(`/boards/${res.body.boards[0].id}`).set("Authorization", user.auth);
    const columns = board.body.board.columns;
    expect(columns.map((c: { name: string }) => c.name)).toEqual(["To Do", "In Progress", "Done"]);
    // Every column has cards, so the board is never half-empty on first load.
    for (const column of columns) expect(column.tickets.length).toBeGreaterThan(0);
    expect(board.body.board.members).toHaveLength(1);
  });

  it("leaves some tickets unlabelled for AI triage and positions them from 1", async () => {
    const user = await registerUser();
    const board = await seedDemoBoard(user.id);

    const tickets = await prisma.ticket.findMany({ where: { boardId: board.id } });
    expect(tickets.some((t) => t.labels.length === 0)).toBe(true); // triage has blanks to fill
    expect(tickets.some((t) => t.labels.length > 0)).toBe(true); // and human-set values to leave alone
    expect(tickets.every((t) => t.position >= 1)).toBe(true);
    // Every ticket carries its board id, not just its column id.
    expect(tickets.every((t) => t.boardId === board.id)).toBe(true);
  });

  it("rolls back entirely if the owner does not exist", async () => {
    await expect(seedDemoBoard("00000000-0000-0000-0000-000000000000")).rejects.toThrow();
    expect(await prisma.board.count()).toBe(0);
  });
});
