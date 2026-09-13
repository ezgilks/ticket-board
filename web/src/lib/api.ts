import { currentSocketId } from "./socket";
import { tokenStore } from "./token";

export { tokenStore };

// Thin wrapper around fetch: adds the base URL, JSON headers and the auth token,
// and turns non-2xx responses into thrown ApiErrors.

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}
