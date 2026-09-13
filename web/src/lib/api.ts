// Thin wrapper around fetch: adds the base URL, JSON headers and the auth token,
// and turns non-2xx responses into thrown ApiErrors.

export const API_URL = import.meta.env.VITE_API_URL ?? "/api";

const TOKEN_KEY = "ticketboard.token";

// Trade-off: localStorage is readable by any script on the page, so an XSS bug
// could steal the token. An httpOnly cookie avoids that, but needs cross-site
// cookie + CSRF handling because the frontend and API are on different domains
// in production. React escapes rendered text by default, which keeps XSS risk low.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

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
