import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function setup() {
  const user = await registerUser();
  const board = await createBoard(user.auth);
  const [todo, doing] = board.columns;
  const create = async (title: string, columnId = todo.id) =>
    (
      await request(app)
        .post(`/boards/${board.id}/tickets`)
        .set("Authorization", user.auth)
        .send({ title, columnId })
    ).body.ticket;
  const titlesIn = async (columnId: string) => {
    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", user.auth);
    const col = res.body.board.columns.find((c: { id: string }) => c.id === columnId);
    return col.tickets.map((t: { title: string }) => t.title);
  };
  return { user, board, todo, doing, create, titlesIn };
}

describe("tickets", () => {
  it("creates tickets at the bottom of the column with defaults", async () => {
    const { create, todo, titlesIn } = await setup();
    const a = await create("A");
    await create("B");

    expect(a.priority).toBe("MEDIUM");
    expect(a.labels).toEqual([]);
    expect(await titlesIn(todo.id)).toEqual(["A", "B"]);
  });

  it("rejects a column from a different board", async () => {
    const { user, board } = await setup();
    const other = await createBoard(user.auth, "Other");
    const res = await request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ title: "X", columnId: other.columns[0].id });
    expect(res.status).toBe(400);
  });

  it("updates fields partially", async () => {
    const { user, create } = await setup();
    const t = await create("Old");
    const res = await request(app)
      .patch(`/tickets/${t.id}`)
      .set("Authorization", user.auth)
      .send({ priority: "URGENT", labels: ["bug"] });

    expect(res.body.ticket.title).toBe("Old");
    expect(res.body.ticket.priority).toBe("URGENT");
    expect(res.body.ticket.labels).toEqual(["bug"]);
  });

  it("moves a ticket between two others using a fractional position", async () => {
    const { user, todo, create, titlesIn } = await setup();
    await create("A");
    await create("B");
    const c = await create("C");

    const res = await request(app)
      .post(`/tickets/${c.id}/move`)
      .set("Authorization", user.auth)
      .send({ columnId: todo.id, index: 1 });

    expect(res.body.ticket.position).toBe(1.5);
    expect(res.body.rebalanced).toBe(false);
    expect(await titlesIn(todo.id)).toEqual(["A", "C", "B"]);
  });

  it("moves a ticket across columns", async () => {
    const { user, todo, doing, create, titlesIn } = await setup();
    const a = await create("A");
    await create("X", doing.id);

    await request(app)
      .post(`/tickets/${a.id}/move`)
      .set("Authorization", user.auth)
      .send({ columnId: doing.id, index: 0 });

    expect(await titlesIn(todo.id)).toEqual([]);
    expect(await titlesIn(doing.id)).toEqual(["A", "X"]);
  });

  it("keeps order correct after many moves into the same gap (rebalancing)", async () => {
    const { user, todo, create, titlesIn } = await setup();
    await create("first");
    const last = await create("last");

    // Repeatedly insert directly after "first" — each insert halves the gap.
    for (let i = 0; i < 30; i++) {
      const t = await create(`n${i}`);
      await request(app)
        .post(`/tickets/${t.id}/move`)
        .set("Authorization", user.auth)
        .send({ columnId: todo.id, index: 1 });
    }

    const titles = await titlesIn(todo.id);
    expect(titles[0]).toBe("first");
    expect(titles[1]).toBe("n29");
    expect(titles.at(-1)).toBe(last.title);
    expect(titles).toHaveLength(32);
  });

  it("blocks non-members from editing tickets", async () => {
    const { create } = await setup();
    const t = await create("Secret");
    const stranger = await registerUser("Stranger");
    const res = await request(app).delete(`/tickets/${t.id}`).set("Authorization", stranger.auth);
    expect(res.status).toBe(404);
  });
});
