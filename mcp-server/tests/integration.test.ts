import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

// The whole path an assistant takes: an MCP client spawns this server over stdio, exactly as
// Claude Desktop does, and the server talks to a real API process backed by Postgres + Redis
// (started in global-setup.ts). Nothing between the client and the database is faked —
// only the ai-service's model, which is swapped for a bag-of-words stand-in.

const apiUrl = inject("apiUrl");
let client: Client;
let boardId: string;

async function rest(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(init.token && { Authorization: `Bearer ${init.token}` }),
    },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  return res.json();
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  if (result.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text);
}

beforeAll(async () => {
  const email = `mcp-${Date.now()}@test.com`;
  const { token } = await rest("/auth/register", {
    method: "POST",
    body: { email, password: "password123", name: "Mcp Tester" },
  });
  ({ board: { id: boardId } } = await rest("/boards", { method: "POST", token, body: { name: "MCP board" } }));

  client = new Client({ name: "integration", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(
    new StdioClientTransport({
      command: "npx",
      args: ["tsx", "src/index.ts"],
      env: {
        PATH: process.env["PATH"] ?? "",
        TICKETBOARD_API_URL: apiUrl,
        TICKETBOARD_EMAIL: email,
        TICKETBOARD_PASSWORD: "password123",
      },
    }),
  );
}, 60_000);

afterAll(async () => {
  await client?.close();
});

describe("MCP server over stdio against the real API", () => {
  it("negotiates the current protocol revision", () => {
    expect(client.getProtocolEra()).toBe("modern");
  });

  it("lists, creates, searches, moves, triages and detects conflicts", async () => {
    const boards = await call("list_boards");
    expect(boards).toEqual([expect.objectContaining({ id: boardId, name: "MCP board", tickets: 0 })]);

    const titles = ["login button broken", "login page slow", "update footer year"];
    const created = [];
    for (const title of titles) created.push((await call("create_ticket", { boardId, title })).ticket);
    expect(created.map((t) => t.column)).toEqual(["To Do", "To Do", "To Do"]);

    // Enrichment (embedding + triage) runs in the API after it responds. Wait for it, so
    // search has vectors to compare and nothing is still writing when the test ends.
    await expect
      .poll(async () => (await call("list_tickets", { boardId })).tickets.map((t: { aiStatus: string }) => t.aiStatus), {
        timeout: 10_000,
      })
      .toEqual(["DONE", "DONE", "DONE"]);

    const results = await call("search_similar_tickets", { boardId, query: "login button" });
    expect(results.map((r: { title: string }) => r.title)).toEqual(["login button broken", "login page slow"]);

    const login = created[0];
    const moved = await call("move_ticket", { ticketId: login.id, column: "done" });
    expect(moved).toMatchObject({ from: "To Do", to: "Done" });
    const done = await call("list_tickets", { boardId, column: "Done" });
    expect(done.tickets.map((t: { title: string }) => t.title)).toEqual(["login button broken"]);

    const triage = await call("triage_ticket", { ticketId: login.id });
    expect(triage).toMatchObject({ suggestion: { priority: "HIGH", labels: ["bug"] }, applied: false });

    // AI triage applied values to the ticket, which bumped its version past 1.
    const current = await call("get_ticket", { ticketId: login.id });
    expect(current.version).toBeGreaterThan(1);
    const stale = await client.callTool({
      name: "update_ticket",
      arguments: { ticketId: login.id, title: "Mine", version: current.version - 1 },
    });
    expect(stale.isError).toBe(true);
    expect((stale.content as { text: string }[])[0]!.text).toMatch(/changed by someone else/);

    const updated = await call("update_ticket", { ticketId: login.id, title: "Login button broken on Safari", version: current.version });
    expect(updated.ticket).toMatchObject({ title: "Login button broken on Safari", version: current.version + 1 });
  });

  it("reads a board as a resource", async () => {
    const { contents } = await client.readResource({ uri: `ticketboard://boards/${boardId}` });
    expect((contents[0] as { text: string }).text).toContain("# MCP board");
  });
});
