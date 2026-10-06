// A small typed client for the Ticket Board REST API. The MCP server never touches the
// database: going through the API keeps authorization, validation, the cache and the
// real-time Socket.io broadcasts exactly as they are for the web app. A ticket an
// assistant moves slides across every open browser tab, like anyone else's drag.

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type AiStatus = "PENDING" | "DONE" | "FAILED" | null;

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface AiTriage {
  labels: string[];
  priority: Priority;
  provider: string;
  applied?: string[];
}

export interface Ticket {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  labels: string[];
  position: number;
  boardId: string;
  columnId: string;
  assigneeId: string | null;
  assignee: UserSummary | null;
  aiTriage: AiTriage | null;
  aiStatus: AiStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends Ticket {
  column: { id: string; name: string };
}

export interface BoardSummary {
  id: string;
  name: string;
  createdAt: string;
  _count: { tickets: number; members: number };
}

export interface Board {
  id: string;
  name: string;
  columns: { id: string; name: string; position: number; tickets: Ticket[] }[];
  members: { role: "OWNER" | "MEMBER"; user: UserSummary }[];
}

export interface SimilarTicket {
  id: string;
  title: string;
  columnName: string;
  similarity: number;
}

export interface TicketInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  labels?: string[];
  assigneeId?: string | null;
}

/** The API answered with an error status. `body` is its JSON, e.g. the current ticket on a 409. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export type Credentials = { token: string } | { email: string; password: string };

// The free-tier API sleeps when idle, and AI-backed calls retry a cold ai-service for up
// to ~75s on the server side. Anything shorter would give up on a request that's working.
const TIMEOUT_MS = 120_000;

export class TicketBoardApi {
  private readonly baseUrl: string;
  private token: string | undefined;

  constructor(
    baseUrl: string,
    private readonly credentials: Credentials,
    // Injectable so unit tests can answer requests without a network.
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if ("token" in credentials) this.token = credentials.token;
  }

  listBoards() {
    return this.request<{ boards: BoardSummary[] }>("GET", "/boards").then((r) => r.boards);
  }

  getBoard(boardId: string) {
    return this.request<{ board: Board }>("GET", `/boards/${seg(boardId)}`).then((r) => r.board);
  }

  getTicket(ticketId: string) {
    return this.request<{ ticket: TicketDetail }>("GET", `/tickets/${seg(ticketId)}`).then((r) => r.ticket);
  }

  createTicket(boardId: string, input: TicketInput & { title: string; columnId: string }) {
    return this.request<{ ticket: Ticket }>("POST", `/boards/${seg(boardId)}/tickets`, input).then((r) => r.ticket);
  }

  updateTicket(ticketId: string, input: TicketInput & { version?: number }) {
    return this.request<{ ticket: Ticket }>("PATCH", `/tickets/${seg(ticketId)}`, input).then((r) => r.ticket);
  }

  moveTicket(ticketId: string, input: { columnId: string; index: number }) {
    return this.request<{ ticket: Ticket; rebalanced: boolean }>("POST", `/tickets/${seg(ticketId)}/move`, input);
  }

  similarTickets(ticketId: string) {
    return this.request<{ similar: SimilarTicket[] }>("GET", `/tickets/${seg(ticketId)}/similar`).then(
      (r) => r.similar,
    );
  }

  searchTickets(boardId: string, query: string, limit?: number) {
    const body = limit === undefined ? { query } : { query, limit };
    return this.request<{ results: SimilarTicket[] }>("POST", `/boards/${seg(boardId)}/search`, body).then(
      (r) => r.results,
    );
  }

  suggestTriage(ticketId: string) {
    return this.request<{ suggestion: AiTriage }>("POST", `/tickets/${seg(ticketId)}/triage`).then(
      (r) => r.suggestion,
    );
  }

  /**
   * Every call goes through here. With email + password, the first call logs in, and a 401
   * later (the 7-day token expired) logs in again once and retries. A pasted token can't be
   * renewed, so its 401 is reported as-is.
   */
  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    if (!this.token) this.token = await this.login();
    const res = await this.send(method, path, body, this.token);
    if (res.status === 401 && !retried && "password" in this.credentials) {
      this.token = undefined;
      return this.request<T>(method, path, body, true);
    }
    return this.parse<T>(res, method, path);
  }

  private async login(): Promise<string> {
    if (!("password" in this.credentials)) throw new Error("unreachable: token credentials always have a token");
    const { email, password } = this.credentials;
    const res = await this.send("POST", "/auth/login", { email, password });
    return (await this.parse<{ token: string }>(res, "POST", "/auth/login")).token;
  }

  private async send(method: string, path: string, body: unknown, token?: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Couldn't reach the Ticket Board API at ${this.baseUrl} (${reason}).`);
    }
  }

  private async parse<T>(res: Response, method: string, path: string): Promise<T> {
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      // A proxy's HTML error page, say. Fall through with the status.
    }
    if (!res.ok) {
      const message = typeof json["error"] === "string" ? json["error"] : `${method} ${path} failed`;
      throw new ApiError(res.status, message, json);
    }
    return json as T;
  }
}

/** Ids go into URL paths; never let one smuggle in a `/` or `?`. */
function seg(id: string) {
  return encodeURIComponent(id);
}
