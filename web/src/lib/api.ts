import { trackRequest } from "./slowRequests";
import { currentSocketId } from "./socket";
import { tokenStore } from "./token";

export { tokenStore };

// Thin wrapper around fetch: adds the base URL, JSON headers and the auth token,
// and turns non-2xx responses into thrown ApiErrors.

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  /** The full JSON error body, for errors that carry data (a 409 includes the current ticket). */
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * One sentence a user can act on, for anything a request can throw.
 *
 * 4xx messages come from our own API and are already written for people ("No user with
 * that email"). Everything else is translated: a 502 from Render's proxy or fetch's
 * "Failed to fetch" means nothing to someone clicking a demo.
 */
export function describeError(err: unknown): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return "You're offline. Check your connection and try again.";
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return "Too many attempts. Wait a few minutes and try again.";
    if (err.status >= 500) return "The server isn't responding right now. Try again in a moment.";
    return err.message.endsWith(".") ? err.message : `${err.message}.`;
  }
  // fetch rejects with a TypeError when the request never got a response: server down,
  // DNS, or a CORS failure (which is also what a crashed API behind a proxy looks like).
  if (err instanceof TypeError) return "Can't reach the server. Try again in a moment.";
  return "Something went wrong. Try again.";
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  // Lets the server skip echoing this change back to us over the socket.
  const socketId = currentSocketId();
  if (socketId) headers["X-Socket-Id"] = socketId;

  const done = trackRequest(); // drives the "waking up the server" banner
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
    });

    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
    return data as T;
  } finally {
    done();
  }
}
