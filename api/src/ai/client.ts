import { config } from "../config.js";

// HTTP client for ai-service. The API never imports ML code; it just makes requests.

// Generous timeout: on a free host, ai-service sleeps when idle and takes a while to wake.
const TIMEOUT_MS = 60_000;

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export interface TriageSuggestion {
  labels: string[];
  priority: Priority;
  provider: string;
}

export function aiEnabled() {
  return Boolean(config.AI_SERVICE_URL);
}

// A cold start (container boot + model load on a slow free-tier CPU) can outlast one
// timeout. Both endpoints are pure functions of their input, so retrying is safe.
const ATTEMPTS = 3;

/** Failures a wake-up explains: no connection, timeout, or the host's proxy saying "not ready". */
class RetryableError extends Error {}
const RETRYABLE_STATUS = new Set([502, 503, 504]);

async function postOnce<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.AI_SERVICE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.AI_SERVICE_TOKEN ? { "X-Service-Token": config.AI_SERVICE_TOKEN } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // fetch throws only for network errors and the timeout abort.
    throw new RetryableError(`ai-service ${path}: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) {
    const message = `ai-service ${path} responded ${res.status}`;
    // A 4xx (bad token, bad input) or a 500 (a real bug) will fail the same way again.
    throw RETRYABLE_STATUS.has(res.status) ? new RetryableError(message) : new Error(message);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await postOnce<T>(path, body);
    } catch (err) {
      if (!(err instanceof RetryableError) || attempt === ATTEMPTS) throw err;
      console.warn(`[ai] ${err.message} — retry ${attempt}/${ATTEMPTS - 1}`);
      // Exponential backoff: 5s, then 10s — gives a booting service room instead of hammering it.
      await new Promise((r) => setTimeout(r, config.AI_RETRY_DELAY_MS * 2 ** (attempt - 1)));
    }
  }
}

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await post<{ vectors: number[][] }>("/embed", { texts });
  return res.vectors;
}

export function triage(title: string, description: string | null): Promise<TriageSuggestion> {
  return post<TriageSuggestion>("/triage", { title, description });
}
