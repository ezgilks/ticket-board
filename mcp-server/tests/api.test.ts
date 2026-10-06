import { describe, expect, it } from "vitest";
import { ApiError, TicketBoardApi } from "../src/api.js";
import { loadConfig } from "../src/config.js";

/** A fetch that answers from a list of canned responses and records each request. */
function scripted(...responses: (Response | Error)[]) {
  const requests: { url: string; method: string; auth: string | null; body: unknown }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    requests.push({
      url,
      method: init.method ?? "GET",
      auth: headers.get("Authorization"),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("no more scripted responses");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, requests };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("TicketBoardApi", () => {
  it("sends a pasted token and keeps the base URL's path prefix", async () => {
    const { fetchImpl, requests } = scripted(json(200, { boards: [] }));
    const api = new TicketBoardApi("http://localhost:8080/api/", { token: "t0" }, fetchImpl);

    await api.listBoards();
    expect(requests).toEqual([{ url: "http://localhost:8080/api/boards", method: "GET", auth: "Bearer t0", body: undefined }]);
  });

  it("logs in on first use, and once more when the token expires", async () => {
    const { fetchImpl, requests } = scripted(
      json(200, { token: "first" }),
      json(200, { boards: [] }),
      json(401, { error: "Invalid or expired token" }),
      json(200, { token: "second" }),
      json(200, { boards: [] }),
    );
    const api = new TicketBoardApi("http://api", { email: "a@b.c", password: "pw" }, fetchImpl);

    await api.listBoards();
    await api.listBoards();
    expect(requests.map((r) => `${r.method} ${r.url} ${r.auth}`)).toEqual([
      "POST http://api/auth/login null",
      "GET http://api/boards Bearer first",
      "GET http://api/boards Bearer first",
      "POST http://api/auth/login null",
      "GET http://api/boards Bearer second",
    ]);
    expect(requests[0]!.body).toEqual({ email: "a@b.c", password: "pw" });
  });

  it("doesn't loop when the fresh login is rejected too", async () => {
    const { fetchImpl, requests } = scripted(
      json(200, { token: "t" }),
      json(401, { error: "Invalid or expired token" }),
      json(200, { token: "t2" }),
      json(401, { error: "Invalid or expired token" }),
    );
    const api = new TicketBoardApi("http://api", { email: "a@b.c", password: "pw" }, fetchImpl);

    await expect(api.listBoards()).rejects.toMatchObject({ status: 401 });
    expect(requests).toHaveLength(4);
  });

  it("does not retry a 401 for a pasted token", async () => {
    const { fetchImpl, requests } = scripted(json(401, { error: "Invalid or expired token" }));
    const api = new TicketBoardApi("http://api", { token: "old" }, fetchImpl);

    await expect(api.listBoards()).rejects.toBeInstanceOf(ApiError);
    expect(requests).toHaveLength(1);
  });

  it("keeps the error body, e.g. the current ticket on a 409", async () => {
    const { fetchImpl } = scripted(json(409, { error: "Changed", ticket: { version: 4 } }));
    const api = new TicketBoardApi("http://api", { token: "t" }, fetchImpl);

    const err = await api.updateTicket("id", { title: "x", version: 3 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, message: "Changed", body: { ticket: { version: 4 } } });
  });

  it("says which URL it couldn't reach", async () => {
    const { fetchImpl } = scripted(new TypeError("fetch failed"));
    const api = new TicketBoardApi("http://localhost:9", { token: "t" }, fetchImpl);

    await expect(api.listBoards()).rejects.toThrow("Couldn't reach the Ticket Board API at http://localhost:9 (fetch failed).");
  });

  it("escapes ids in paths", async () => {
    const { fetchImpl, requests } = scripted(json(200, { ticket: {} }));
    const api = new TicketBoardApi("http://api", { token: "t" }, fetchImpl);

    await api.getTicket("../boards?x=1");
    expect(requests[0]!.url).toBe("http://api/tickets/..%2Fboards%3Fx%3D1");
  });
});

describe("loadConfig", () => {
  it("prefers email + password over a token", () => {
    const c = loadConfig({ TICKETBOARD_TOKEN: "t", TICKETBOARD_EMAIL: "a@b.c", TICKETBOARD_PASSWORD: "pw" });
    expect(c).toEqual({ apiUrl: "http://localhost:3000", credentials: { email: "a@b.c", password: "pw" } });
  });

  it("accepts a token on its own", () => {
    expect(loadConfig({ TICKETBOARD_TOKEN: "t", TICKETBOARD_API_URL: "https://x.dev" }).credentials).toEqual({ token: "t" });
  });

  it("refuses to start without credentials, or with half of them", () => {
    expect(() => loadConfig({})).toThrow(/Set TICKETBOARD_TOKEN/);
    expect(() => loadConfig({ TICKETBOARD_EMAIL: "a@b.c" })).toThrow(/Set TICKETBOARD_TOKEN/);
  });

  it("rejects a malformed API URL", () => {
    expect(() => loadConfig({ TICKETBOARD_TOKEN: "t", TICKETBOARD_API_URL: "localhost:3000" })).toThrow(
      /TICKETBOARD_API_URL/,
    );
  });
});
