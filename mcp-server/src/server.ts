import { McpServer, ResourceNotFoundError, ResourceTemplate } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ApiError, type Board, type Ticket, type TicketBoardApi } from "./api.js";

// What the tools need from the API. A type rather than the class, so unit tests can pass
// an in-memory fake and drive every handler without a network.
export type BoardApi = Pick<
  TicketBoardApi,
  | "listBoards"
  | "getBoard"
  | "getTicket"
  | "createTicket"
  | "updateTicket"
  | "moveTicket"
  | "similarTickets"
  | "searchTickets"
  | "suggestTriage"
>;

const Priority = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const boardId = z.uuid().describe("Board id, from list_boards");
const ticketId = z.uuid().describe("Ticket id, from list_tickets or search_similar_tickets");
const columnRef = z.string().min(1).describe('Column name (e.g. "In Progress", case-insensitive) or column id');
const assigneeRef = z.string().min(1).describe("Board member's name, email, or user id");

/**
 * A factory, not a singleton: the SDK's serveStdio (and an HTTP handler, if one is ever
 * added) calls it to build the instance that serves a connection.
 */
export function createServer(api: BoardApi) {
  const server = new McpServer(
    { name: "ticketboard", version: "1.0.0" },
    {
      instructions:
        "Ticket Board is a kanban board. Start with list_boards, then list_tickets. Columns and " +
        "assignees can be given by name. New tickets are triaged by the board's own AI in the " +
        "background; triage_ticket asks for a fresh suggestion but never applies it.",
    },
  );

  // ---------- Reads ----------

  server.registerTool(
    "list_boards",
    {
      title: "List boards",
      description: "List the boards the signed-in user is a member of, with ticket and member counts.",
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const boards = await api.listBoards();
        return boards.map((b) => ({
          id: b.id,
          name: b.name,
          tickets: b._count.tickets,
          members: b._count.members,
        }));
      }),
  );

  server.registerTool(
    "list_tickets",
    {
      title: "List tickets",
      description:
        "List a board's tickets in board order, optionally filtered. Also returns the board's columns " +
        "and members, which create_ticket, update_ticket and move_ticket accept by name.",
      inputSchema: z.object({
        boardId,
        column: columnRef.optional(),
        label: z.string().min(1).optional().describe("Only tickets with this label (case-insensitive)"),
        assignee: z
          .string()
          .min(1)
          .optional()
          .describe('Board member\'s name, email, or user id; "unassigned" for tickets with no assignee'),
        priority: Priority.optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        const board = await api.getBoard(args.boardId);
        const column = args.column ? findColumn(board, args.column) : undefined;
        const assigneeId =
          args.assignee === undefined
            ? undefined
            : args.assignee.toLowerCase() === "unassigned"
              ? null
              : findMember(board, args.assignee).id;
        const label = args.label?.toLowerCase();

        const tickets = board.columns
          .filter((c) => !column || c.id === column.id)
          .flatMap((c) => c.tickets.map((t) => summarize(t, c.name)))
          .filter((t) => assigneeId === undefined || t.assigneeId === assigneeId)
          .filter((t) => !label || t.labels.some((l) => l.toLowerCase() === label))
          .filter((t) => !args.priority || t.priority === args.priority);

        return {
          board: { id: board.id, name: board.name },
          columns: board.columns.map((c) => ({ id: c.id, name: c.name, tickets: c.tickets.length })),
          members: board.members.map((m) => ({ ...m.user, role: m.role })),
          tickets,
        };
      }),
  );

  server.registerTool(
    "get_ticket",
    {
      title: "Get ticket",
      description: "Read one ticket in full: description, column, assignee, version, and the AI's triage suggestion.",
      inputSchema: z.object({ ticketId }),
      annotations: { readOnlyHint: true },
    },
    ({ ticketId }) => run(() => api.getTicket(ticketId)),
  );

  server.registerTool(
    "search_similar_tickets",
    {
      title: "Search similar tickets",
      description:
        "Semantic search by meaning, not keywords (sentence embeddings + pgvector). Pass boardId + query " +
        "to search a board by free text, or ticketId to find tickets similar to an existing one (useful " +
        "for spotting duplicates). Tickets created in the last few seconds may not be indexed yet.",
      inputSchema: z.object({
        boardId: boardId.optional(),
        query: z.string().min(1).max(500).optional().describe("Free text to search for; needs boardId"),
        ticketId: ticketId.optional(),
        limit: z.number().int().min(1).max(20).optional().describe("Max results for a query search (default 5)"),
      }),
      annotations: { readOnlyHint: true },
    },
    (args) =>
      run(async () => {
        if (args.ticketId && !args.query) return api.similarTickets(args.ticketId);
        if (args.query && args.boardId && !args.ticketId) {
          return api.searchTickets(args.boardId, args.query, args.limit);
        }
        throw new Error("Pass either ticketId, or boardId together with query — not both.");
      }),
  );

  // ---------- Writes ----------
  // Each goes through the same REST route the web app uses, so it's validated, authorized,
  // and broadcast to every open tab of the board.

  server.registerTool(
    "create_ticket",
    {
      title: "Create ticket",
      description:
        "Create a ticket at the bottom of a column (the board's first column if none is given). " +
        "Priority and labels left out are filled in by the board's AI triage a few seconds later.",
      inputSchema: z.object({
        boardId,
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).optional(),
        column: columnRef.optional(),
        priority: Priority.optional(),
        labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
        assignee: assigneeRef.optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    (args) =>
      run(async () => {
        const board = await api.getBoard(args.boardId);
        const column = args.column ? findColumn(board, args.column) : board.columns[0];
        if (!column) throw new Error("This board has no columns to put a ticket in.");
        const ticket = await api.createTicket(args.boardId, {
          title: args.title,
          columnId: column.id,
          ...(args.description !== undefined && { description: args.description }),
          ...(args.priority !== undefined && { priority: args.priority }),
          ...(args.labels !== undefined && { labels: args.labels }),
          ...(args.assignee !== undefined && { assigneeId: findMember(board, args.assignee).id }),
        });
        return {
          ticket: summarize(ticket, column.name),
          ...(ticket.aiStatus === "PENDING" && {
            note: "AI triage is running in the background; get_ticket shows its result once aiStatus is DONE.",
          }),
        };
      }),
  );

  server.registerTool(
    "update_ticket",
    {
      title: "Update ticket",
      description:
        "Change a ticket's title, description, priority, labels or assignee. Only the fields given change; " +
        "labels replaces the whole list. Pass the version from get_ticket to fail instead of overwriting " +
        "if someone else edited the ticket since you read it. To change column, use move_ticket.",
      inputSchema: z.object({
        ticketId,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(5000).nullable().optional().describe("null clears it"),
        priority: Priority.optional(),
        labels: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
        assignee: assigneeRef.nullable().optional().describe("Board member's name, email, or id; null unassigns"),
        version: z.number().int().min(1).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    (args) =>
      run(async () => {
        const current = await api.getTicket(args.ticketId);
        let assigneeId: string | null | undefined;
        if (args.assignee === null) assigneeId = null;
        else if (args.assignee !== undefined) {
          assigneeId = findMember(await api.getBoard(current.boardId), args.assignee).id;
        }
        const ticket = await api.updateTicket(args.ticketId, {
          ...(args.title !== undefined && { title: args.title }),
          ...(args.description !== undefined && { description: args.description }),
          ...(args.priority !== undefined && { priority: args.priority }),
          ...(args.labels !== undefined && { labels: args.labels }),
          ...(assigneeId !== undefined && { assigneeId }),
          ...(args.version !== undefined && { version: args.version }),
        });
        return { ticket: { ...summarize(ticket, current.column.name), description: ticket.description } };
      }),
  );

  server.registerTool(
    "move_ticket",
    {
      title: "Move ticket",
      description:
        "Move a ticket to a column (e.g. \"Done\"), at the bottom unless position is given. Everyone " +
        "with the board open sees it move.",
      inputSchema: z.object({
        ticketId,
        column: columnRef,
        position: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("0-based index among the column's other tickets; 0 = top. Default: bottom"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    (args) =>
      run(async () => {
        const current = await api.getTicket(args.ticketId);
        const column = findColumn(await api.getBoard(current.boardId), args.column);
        // The API clamps the index to the column's length, so "very large" means "the bottom".
        const index = args.position ?? Number.MAX_SAFE_INTEGER;
        const { ticket } = await api.moveTicket(args.ticketId, { columnId: column.id, index });
        return { ticket: summarize(ticket, column.name), from: current.column.name, to: column.name };
      }),
  );

  server.registerTool(
    "triage_ticket",
    {
      title: "Triage ticket",
      description:
        "Ask the board's AI triage for a fresh priority and labels for a ticket. Returns the suggestion " +
        "next to the current values and changes nothing; apply it with update_ticket if it's right.",
      inputSchema: z.object({ ticketId }),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ ticketId }) =>
      run(async () => {
        const [ticket, suggestion] = await Promise.all([api.getTicket(ticketId), api.suggestTriage(ticketId)]);
        return {
          ticket: { id: ticket.id, title: ticket.title, version: ticket.version },
          current: { priority: ticket.priority, labels: ticket.labels },
          suggestion,
          applied: false,
        };
      }),
  );

  // ---------- Resources: context a person (not the model) attaches ----------

  server.registerResource(
    "board",
    new ResourceTemplate("ticketboard://boards/{boardId}", {
      list: async () => ({
        resources: (await api.listBoards()).map((b) => ({
          uri: `ticketboard://boards/${b.id}`,
          name: b.name,
          mimeType: "text/markdown",
        })),
      }),
    }),
    { title: "Board", description: "A board's columns and tickets, as Markdown", mimeType: "text/markdown" },
    async (uri, { boardId }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: boardMarkdown(await orNotFound(uri, api.getBoard(String(boardId)))),
        },
      ],
    }),
  );

  server.registerResource(
    "ticket",
    new ResourceTemplate("ticketboard://tickets/{ticketId}", { list: undefined }),
    { title: "Ticket", description: "One ticket in full, as JSON", mimeType: "application/json" },
    async (uri, { ticketId }) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await orNotFound(uri, api.getTicket(String(ticketId))), null, 2),
        },
      ],
    }),
  );

  // ---------- Prompt: a ready-made workflow a person picks from a menu ----------

  server.registerPrompt(
    "triage_backlog",
    {
      title: "Triage my backlog",
      description: "Review a board's backlog column and propose priorities, labels and duplicates to fix.",
      argsSchema: z.object({
        boardId: z.string().describe("Board id, from list_boards"),
        column: z.string().optional().describe('Column to triage (default: the first column, e.g. "To Do")'),
      }),
    },
    ({ boardId, column }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Triage the backlog of Ticket Board board ${boardId}${column ? `, column "${column}"` : " (its first column)"}.`,
              "",
              "1. Call list_tickets for that column.",
              "2. For tickets with no labels, a FAILED aiStatus, or a priority that looks wrong, call triage_ticket.",
              "3. For each ticket, call search_similar_tickets with its ticketId to spot likely duplicates.",
              "4. Show me one table: ticket, current priority/labels, proposed priority/labels, possible duplicates.",
              "5. Ask me before changing anything. Apply only what I approve, with update_ticket, passing each ticket's version.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  return server;
}

// ---------- Helpers ----------

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/**
 * Runs a handler and turns its result, or its failure, into a tool result. Failures come
 * back as `isError` results with a message written for the model to act on, rather than
 * as thrown errors — the model can read and recover from the former.
 */
async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: describeError(err) }], isError: true };
  }
}

export function describeError(err: unknown): string {
  if (!(err instanceof ApiError)) return err instanceof Error ? err.message : String(err);
  switch (err.status) {
    case 401:
      return "Not signed in: the Ticket Board token is missing or expired. Set a fresh TICKETBOARD_TOKEN, or use TICKETBOARD_EMAIL and TICKETBOARD_PASSWORD.";
    case 404:
      return `${err.message}. It doesn't exist, or this account isn't a member of its board.`;
    case 409:
      return `${err.message}. Current ticket (read it, then retry with its version):\n${JSON.stringify(err.body["ticket"], null, 2)}`;
    case 400:
      return `The API rejected the request: ${err.message}${err.body["issues"] ? `\n${JSON.stringify(err.body["issues"])}` : ""}`;
    case 429:
      return `Rate limited: ${err.message}`;
    case 503:
      return err.message;
    default:
      return `The API failed (${err.status}): ${err.message}`;
  }
}

/** A resource read that 404s is the protocol's "resource not found", not an internal error. */
async function orNotFound<T>(uri: URL, p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw new ResourceNotFoundError(uri.href);
    throw err;
  }
}

function findColumn(board: Board, ref: string) {
  const wanted = ref.trim().toLowerCase();
  const column = board.columns.find((c) => c.id === ref || c.name.toLowerCase() === wanted);
  if (!column) {
    throw new Error(`No column "${ref}" on this board. Columns: ${board.columns.map((c) => `"${c.name}"`).join(", ")}`);
  }
  return column;
}

function findMember(board: Board, ref: string) {
  const wanted = ref.trim().toLowerCase();
  const matches = board.members
    .map((m) => m.user)
    .filter((u) => u.id === ref || u.email.toLowerCase() === wanted || u.name.toLowerCase() === wanted);
  const names = board.members.map((m) => `${m.user.name} <${m.user.email}>`).join(", ");
  if (matches.length === 0) throw new Error(`No board member matches "${ref}". Members: ${names}`);
  if (matches.length > 1) throw new Error(`"${ref}" matches more than one member; use their email. Members: ${names}`);
  return matches[0]!;
}

/** The fields a model needs to reason about a ticket, without position floats and timestamps. */
function summarize(t: Ticket, column: string) {
  return {
    id: t.id,
    title: t.title,
    column,
    priority: t.priority,
    labels: t.labels,
    assignee: t.assignee?.name ?? null,
    assigneeId: t.assigneeId,
    aiStatus: t.aiStatus,
    version: t.version,
  };
}

function boardMarkdown(board: Board) {
  const lines = [`# ${board.name}`, "", `Members: ${board.members.map((m) => m.user.name).join(", ")}`];
  for (const c of board.columns) {
    lines.push("", `## ${c.name} (${c.tickets.length})`);
    for (const t of c.tickets) {
      const labels = t.labels.length ? ` [${t.labels.join(", ")}]` : "";
      const who = t.assignee ? ` — ${t.assignee.name}` : "";
      lines.push(`- **${t.title}** · ${t.priority}${labels}${who} · \`${t.id}\``);
    }
  }
  return lines.join("\n");
}
