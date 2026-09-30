import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

// Optimistic concurrency: two people open the same ticket, both edit, both save.
// Without versions the second save silently erases the first. With them, it's a 409.

beforeEach(resetDb);

async function setup() {
  const alice = await registerUser("Alice");
  const board = await createBoard(alice.auth);
  const res = await request(app)
    .post(`/boards/${board.id}/tickets`)
    .set("Authorization", alice.auth)
    .send({ title: "Original", columnId: board.columns[0].id });
  const patch = (body: Record<string, unknown>) =>
    request(app).patch(`/tickets/${res.body.ticket.id}`).set("Authorization", alice.auth).send(body);
  return { board, alice, ticket: res.body.ticket, patch };
}

describe("ticket versions", () => {
  it("starts at 1 and goes up by one on each edit", async () => {
    const { ticket, patch } = await setup();
    expect(ticket.version).toBe(1);

    const first = await patch({ title: "Edited", version: 1 });
    expect(first.status).toBe(200);
    expect(first.body.ticket.version).toBe(2);
    expect((await patch({ priority: "HIGH", version: 2 })).body.ticket.version).toBe(3);
  });

  it("rejects a save based on a stale version with 409 and the current ticket", async () => {
    const { patch } = await setup();
    // Both "tabs" opened the ticket at version 1. The first save wins...
    await patch({ title: "Alice's title", version: 1 });

    // ...and the second, still based on version 1, must not overwrite it.
    const stale = await patch({ title: "Bob's title", version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.ticket).toMatchObject({ title: "Alice's title", version: 2 });

    // Retrying against the version it was just shown succeeds: that's "overwrite with mine".
    const retry = await patch({ title: "Bob's title", version: 2 });
    expect(retry.status).toBe(200);
    expect(retry.body.ticket).toMatchObject({ title: "Bob's title", version: 3 });
  });

  it("lets exactly one of two simultaneous saves win", async () => {
    const { patch } = await setup();
    const results = await Promise.all([patch({ title: "A", version: 1 }), patch({ title: "B", version: 1 })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("does not bump the version on a move, so dragging never conflicts with an edit", async () => {
    const { alice, board, ticket, patch } = await setup();
    await request(app)
      .post(`/tickets/${ticket.id}/move`)
      .set("Authorization", alice.auth)
      .send({ columnId: board.columns[1].id, index: 0 });

    expect((await patch({ title: "Edited after a move", version: 1 })).status).toBe(200);
  });

  it("still accepts a save without a version (last write wins)", async () => {
    const { patch } = await setup();
    await patch({ title: "One", version: 1 });
    const res = await patch({ title: "Two" });
    expect(res.status).toBe(200);
    expect(res.body.ticket.version).toBe(3);
  });

  it("returns 404, not 409, when the ticket was deleted", async () => {
    const { alice, ticket, patch } = await setup();
    await request(app).delete(`/tickets/${ticket.id}`).set("Authorization", alice.auth);
    expect((await patch({ title: "Too late", version: 1 })).status).toBe(404);
  });
});
