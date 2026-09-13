import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db.js";
import { app, createBoard, registerUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

const gql = (auth: string | null, query: string, variables: Record<string, unknown> = {}) => {
  const req = request(app).post("/graphql").send({ query, variables });
  return auth ? req.set("Authorization", auth) : req;
};

const BOARD_QUERY = /* GraphQL */ `
  query Board($id: ID!, $priority: Priority) {
    board(id: $id) {
      name
      owner { name }
      columns {
        name
        tickets(priority: $priority) { title priority }
      }
    }
  }
`;

async function seed() {
  const user = await registerUser("Ada");
  const board = await createBoard(user.auth, "Roadmap");
  const add = (title: string, columnIndex: number, priority = "MEDIUM", labels: string[] = []) =>
    request(app)
      .post(`/boards/${board.id}/tickets`)
      .set("Authorization", user.auth)
      .send({ title, columnId: board.columns[columnIndex].id, priority, labels });
  await add("Login bug", 0, "URGENT", ["bug", "auth"]);
  await add("Dark mode", 0, "LOW", ["ux"]);
  await add("Deploy", 1, "HIGH", ["infra", "bug"]);
  return { user, board };
}

describe("GraphQL", () => {
  it("returns a nested board in one request", async () => {
    const { user, board } = await seed();
    const res = await gql(user.auth, BOARD_QUERY, { id: board.id });

    expect(res.body.errors).toBeUndefined();
    expect(res.body.data.board.owner.name).toBe("Ada");
    expect(res.body.data.board.columns.map((c: { name: string }) => c.name)).toEqual(["To Do", "In Progress", "Done"]);
    expect(res.body.data.board.columns[0].tickets).toEqual([
      { title: "Login bug", priority: "URGENT" },
      { title: "Dark mode", priority: "LOW" },
    ]);
  });

  it("filters tickets with field arguments", async () => {
    const { user, board } = await seed();
    const res = await gql(user.auth, BOARD_QUERY, { id: board.id, priority: "URGENT" });
    const titles = res.body.data.board.columns.flatMap((c: { tickets: { title: string }[] }) =>
      c.tickets.map((t) => t.title),
    );
    expect(titles).toEqual(["Login bug"]);
  });

  it("batches ticket loading: one query for all columns, not one per column (N+1)", async () => {
    const { user, board } = await seed();
    const spy = vi.spyOn(prisma.ticket, "findMany");

    await gql(user.auth, BOARD_QUERY, { id: board.id });

    expect(spy).toHaveBeenCalledTimes(1); // 3 columns, 1 query
  });

  it("requires authentication", async () => {
    const res = await gql(null, "{ me { name } }");
    expect(res.body.errors[0].extensions.code).toBe("UNAUTHENTICATED");
  });

  it("returns null for boards the user isn't a member of", async () => {
    const { board } = await seed();
    const stranger = await registerUser("Stranger");
    const res = await gql(stranger.auth, BOARD_QUERY, { id: board.id });
    expect(res.body.data.board).toBeNull();
  });
});

describe("board analytics (raw SQL)", () => {
  it("aggregates by column, priority, label and day", async () => {
    const { user, board } = await seed();
    const res = await request(app).get(`/boards/${board.id}/analytics`).set("Authorization", user.auth);
    const a = res.body.analytics;

    expect(a.byColumn.map((c: { name: string; count: number }) => [c.name, c.count])).toEqual([
      ["To Do", 2],
      ["In Progress", 1],
      ["Done", 0], // empty column still present thanks to LEFT JOIN
    ]);
    expect(a.byPriority.map((p: { priority: string }) => p.priority)).toEqual(["URGENT", "HIGH", "LOW"]);
    expect(a.topLabels[0]).toEqual({ label: "bug", count: 2 });
    expect(a.createdPerDay).toHaveLength(14); // zero-filled by generate_series
    expect(a.createdPerDay.at(-1).count).toBe(3);
    expect(a.aiTriaged).toEqual({ triaged: 0, total: 3 });
  });

  it("is available through GraphQL too", async () => {
    const { user, board } = await seed();
    const res = await gql(user.auth, `query($id: ID!) { board(id: $id) { analytics { topLabels { label count } } } }`, {
      id: board.id,
    });
    expect(res.body.data.board.analytics.topLabels[0]).toEqual({ label: "bug", count: 2 });
  });
});
