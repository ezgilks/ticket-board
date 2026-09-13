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

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.AI_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ai-service ${path} responded ${res.status}`);
  return (await res.json()) as T;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await post<{ vectors: number[][] }>("/embed", { texts });
  return res.vectors;
}

export function triage(title: string, description: string | null): Promise<TriageSuggestion> {
  return post<TriageSuggestion>("/triage", { title, description });
}
