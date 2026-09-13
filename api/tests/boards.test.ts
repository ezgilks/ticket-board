import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("boards", () => {
  it("creates a board with default columns in order", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth, "Launch");

    expect(board.name).toBe("Launch");
    expect(board.columns.map((c: { name: string }) => c.name)).toEqual(["To Do", "In Progress", "Done"]);
    expect(board.members).toHaveLength(1);
    expect(board.members[0].role).toBe("OWNER");
  });

  it("lists only boards the user belongs to", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    await createBoard(alice.auth, "Alice's");

    const res = await request(app).get("/boards").set("Authorization", bob.auth);
    expect(res.body.boards).toEqual([]);
  });

  it("hides boards from non-members with a 404", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    const board = await createBoard(alice.auth);

    const res = await request(app).get(`/boards/${board.id}`).set("Authorization", bob.auth);
    expect(res.status).toBe(404);
  });

  it("lets the owner add members, who can then see the board but not delete it", async () => {
    const alice = await registerUser("Alice");
    const bob = await registerUser("Bob");
    const board = await createBoard(alice.auth);

    const add = await request(app)
      .post(`/boards/${board.id}/members`)
      .set("Authorization", alice.auth)
      .send({ email: bob.email });
    expect(add.status).toBe(201);

    expect((await request(app).get(`/boards/${board.id}`).set("Authorization", bob.auth)).status).toBe(200);
    expect((await request(app).delete(`/boards/${board.id}`).set("Authorization", bob.auth)).status).toBe(403);
    expect((await request(app).delete(`/boards/${board.id}`).set("Authorization", alice.auth)).status).toBe(204);
  });

  it("adds and deletes columns", async () => {
    const user = await registerUser();
    const board = await createBoard(user.auth);

    const created = await request(app)
      .post(`/boards/${board.id}/columns`)
      .set("Authorization", user.auth)
      .send({ name: "Review" });
    expect(created.status).toBe(201);
    expect(created.body.column.position).toBe(3);

    const del = await request(app).delete(`/columns/${created.body.column.id}`).set("Authorization", user.auth);
    expect(del.status).toBe(204);
  });
});
