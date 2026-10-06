import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { fakeApi } from "./fake-api.js";

// Every tool is driven through a real MCP Client, so these cover the SDK's argument
// validation and result encoding too — not just the handler functions.
//
// The in-process handler speaks the current protocol revision (2026-07-28). Clients in
// the wild still use the 2025 handshake, so one test below covers that path as well.

let fake: ReturnType<typeof fakeApi>;
let client: Client;
let handler: ReturnType<typeof createMcpHandler>;

beforeEach(async () => {
  fake = fakeApi();
  handler = createMcpHandler(() => createServer(fake.api));
  client = new Client({ name: "test", version: "1.0.0" }, { versionNegotiation: { mode: "auto" } });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
});
afterEach(async () => {
  await client.close();
  await handler.close();
});

/** Call a tool and parse its JSON text, failing loudly if the tool reported an error. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as { type: string; text: string }[])[0]!.text;
  if (result.isError) throw new Error(`tool error: ${text}`);
  return JSON.parse(text);
}

async function callError(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  expect(result.isError).toBe(true);
  return (result.content as { type: string; text: string }[])[0]!.text;
}

describe("discovery", () => {
  it("advertises the eight tools, two resource templates and the prompt", async () => {
    expect(client.getProtocolEra()).toBe("modern");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "create_ticket",
      "get_ticket",
      "list_boards",
      "list_tickets",
      "move_ticket",
      "search_similar_tickets",
      "triage_ticket",
      "update_ticket",
    ]);
    const reads = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(reads.sort()).toEqual(["get_ticket", "list_boards", "list_tickets", "search_similar_tickets", "triage_ticket"]);

    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((r) => r.uriTemplate).sort()).toEqual([
      "ticketboard://boards/{boardId}",
      "ticketboard://tickets/{ticketId}",
    ]);
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["triage_backlog"]);
  });

  it("also serves clients on the 2025 initialize handshake", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(fake.api).connect(serverSide);
    const legacy = new Client({ name: "legacy", version: "1.0.0" });
    await legacy.connect(clientSide);

    expect(legacy.getProtocolEra()).toBe("legacy");
    const result = await legacy.callTool({ name: "list_boards", arguments: {} });
    expect(result.isError).toBeFalsy();
    await legacy.close();
  });
});

describe("reads", () => {
  it("list_boards returns counts", async () => {
    fake.ticket("One", 0);
    expect(await call("list_boards")).toEqual([{ id: fake.board.id, name: "Demo", tickets: 1, members: 2 }]);
  });

  it("list_tickets filters by column name, label, assignee and priority", async () => {
    fake.ticket("Login bug", 0, { labels: ["Bug"], priority: "HIGH", assigneeId: fake.bob.id, assignee: fake.bob });
    fake.ticket("Docs", 0, { labels: ["docs"] });
    fake.ticket("Shipped", 2, { labels: ["bug"] });

    const all = await call("list_tickets", { boardId: fake.board.id });
    expect(all.tickets.map((t: { title: string }) => t.title)).toEqual(["Login bug", "Docs", "Shipped"]);
    expect(all.columns.map((c: { name: string }) => c.name)).toEqual(["To Do", "In Progress", "Done"]);

    const titles = async (args: Record<string, unknown>) =>
      (await call("list_tickets", { boardId: fake.board.id, ...args })).tickets.map((t: { title: string }) => t.title);
    expect(await titles({ column: "to do" })).toEqual(["Login bug", "Docs"]);
    expect(await titles({ label: "BUG" })).toEqual(["Login bug", "Shipped"]);
    expect(await titles({ assignee: "bob@example.com" })).toEqual(["Login bug"]);
    expect(await titles({ assignee: "unassigned" })).toEqual(["Docs", "Shipped"]);
    expect(await titles({ priority: "HIGH" })).toEqual(["Login bug"]);
  });

  it("names the real columns when a column doesn't exist", async () => {
    const text = await callError("list_tickets", { boardId: fake.board.id, column: "Backlog" });
    expect(text).toBe('No column "Backlog" on this board. Columns: "To Do", "In Progress", "Done"');
  });

  it("get_ticket explains a 404", async () => {
    const text = await callError("get_ticket", { ticketId: crypto.randomUUID() });
    expect(text).toMatch(/Ticket not found\. It doesn't exist, or this account isn't a member/);
  });

  it("rejects a malformed id before calling the API", async () => {
    const text = await callError("get_ticket", { ticketId: "nope" });
    expect(text).toMatch(/ticketId/);
  });

  it("search_similar_tickets takes a query or a ticket, not both", async () => {
    const t = fake.ticket("Login bug", 0);
    expect((await call("search_similar_tickets", { boardId: fake.board.id, query: "sign in" }))[0].title).toBe(
      "Match for sign in",
    );
    expect((await call("search_similar_tickets", { ticketId: t.id }))[0].title).toBe("A lookalike");
    expect(await callError("search_similar_tickets", { query: "no board" })).toMatch(/Pass either ticketId/);
    expect(await callError("search_similar_tickets", { boardId: fake.board.id, query: "x", ticketId: t.id })).toMatch(
      /not both/,
    );
  });
});

describe("writes", () => {
  it("create_ticket resolves column and assignee names into ids", async () => {
    const res = await call("create_ticket", {
      boardId: fake.board.id,
      title: "Export to CSV",
      column: "In Progress",
      assignee: "alice",
    });
    expect(fake.writes).toEqual([
      {
        op: "create",
        id: fake.board.id,
        body: { title: "Export to CSV", columnId: fake.board.columns[1]!.id, assigneeId: fake.alice.id },
      },
    ]);
    expect(res.ticket).toMatchObject({ title: "Export to CSV", column: "In Progress", assignee: "Alice" });
    expect(res.note).toMatch(/AI triage is running/);
  });

  it("create_ticket defaults to the first column", async () => {
    const res = await call("create_ticket", { boardId: fake.board.id, title: "Anything" });
    expect(res.ticket.column).toBe("To Do");
  });

  it("update_ticket sends only the fields given, and null unassigns", async () => {
    const t = fake.ticket("Old", 0, { assigneeId: fake.bob.id, assignee: fake.bob });
    const res = await call("update_ticket", { ticketId: t.id, priority: "URGENT", assignee: null });
    expect(fake.writes.at(-1)?.body).toEqual({ priority: "URGENT", assigneeId: null });
    expect(res.ticket).toMatchObject({ priority: "URGENT", assignee: null, version: 2 });
  });

  it("update_ticket reports a version conflict with the current ticket", async () => {
    const t = fake.ticket("Contested", 0, { version: 3 });
    const text = await callError("update_ticket", { ticketId: t.id, title: "Mine", version: 2 });
    expect(text).toMatch(/changed by someone else/);
    expect(text).toContain('"version": 3');
  });

  it("move_ticket goes to the bottom by default, or to a given position", async () => {
    fake.ticket("Already done", 2);
    const t = fake.ticket("Finish me", 0);

    const res = await call("move_ticket", { ticketId: t.id, column: "done" });
    expect(res).toMatchObject({ from: "To Do", to: "Done" });
    expect(fake.board.columns[2]!.tickets.map((x) => x.title)).toEqual(["Already done", "Finish me"]);

    await call("move_ticket", { ticketId: t.id, column: "Done", position: 0 });
    expect(fake.board.columns[2]!.tickets.map((x) => x.title)).toEqual(["Finish me", "Already done"]);
  });

  it("triage_ticket returns a suggestion and writes nothing", async () => {
    const t = fake.ticket("Login returns 500", 0);
    const res = await call("triage_ticket", { ticketId: t.id });
    expect(res).toMatchObject({
      current: { priority: "MEDIUM", labels: [] },
      suggestion: { priority: "HIGH", labels: ["bug"] },
      applied: false,
    });
    expect(fake.writes).toEqual([]);
  });
});

describe("resources and prompt", () => {
  it("lists boards as resources and renders one as Markdown", async () => {
    fake.ticket("Login bug", 0, { labels: ["bug"], assignee: fake.bob, assigneeId: fake.bob.id });
    const { resources } = await client.listResources();
    expect(resources).toEqual([
      expect.objectContaining({ uri: `ticketboard://boards/${fake.board.id}`, name: "Demo" }),
    ]);

    const { contents } = await client.readResource({ uri: `ticketboard://boards/${fake.board.id}` });
    const text = (contents[0] as { text: string }).text;
    expect(text).toContain("# Demo");
    expect(text).toContain("## To Do (1)");
    expect(text).toContain("- **Login bug** · MEDIUM [bug] — Bob");
  });

  it("reads a ticket resource as JSON", async () => {
    const t = fake.ticket("Login bug", 0);
    const { contents } = await client.readResource({ uri: `ticketboard://tickets/${t.id}` });
    expect(JSON.parse((contents[0] as { text: string }).text)).toMatchObject({ id: t.id, column: { name: "To Do" } });
  });

  it("a missing ticket is the protocol's resource-not-found, not an internal error", async () => {
    const uri = `ticketboard://tickets/${crypto.randomUUID()}`;
    await expect(client.readResource({ uri })).rejects.toMatchObject({ code: -32602, data: { uri } });
  });

  it("triage_backlog names the board and column", async () => {
    const { messages } = await client.getPrompt({
      name: "triage_backlog",
      arguments: { boardId: fake.board.id, column: "To Do" },
    });
    const text = (messages[0]!.content as { text: string }).text;
    expect(text).toContain(`board ${fake.board.id}, column "To Do"`);
    expect(text).toMatch(/Ask me before changing anything/);
  });
});
