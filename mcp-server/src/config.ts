import { z } from "zod";
import type { Credentials } from "./api.js";

// Read once at startup. A missing credential should stop the server with a message the
// person configuring Claude Desktop can act on — not surface as a 401 on the first tool call.
const Env = z.object({
  // The API's base URL. Local `npm run dev`: http://localhost:3000.
  // `docker compose --profile app up`: http://localhost:8080/api (through nginx).
  // http(s) only: "localhost:3000" is a valid URL whose scheme is "localhost:".
  TICKETBOARD_API_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
  // Either a token (a JWT, e.g. copied from a guest session) ...
  TICKETBOARD_TOKEN: z.string().min(1).optional(),
  // ... or an account's email and password, which survive the token's 7-day expiry.
  TICKETBOARD_EMAIL: z.string().min(1).optional(),
  TICKETBOARD_PASSWORD: z.string().min(1).optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): { apiUrl: string; credentials: Credentials } {
  const parsed = Env.safeParse(env);
  if (!parsed.success) throw new Error(`Invalid configuration: ${z.prettifyError(parsed.error)}`);
  const e = parsed.data;

  if (e.TICKETBOARD_EMAIL && e.TICKETBOARD_PASSWORD) {
    return { apiUrl: e.TICKETBOARD_API_URL, credentials: { email: e.TICKETBOARD_EMAIL, password: e.TICKETBOARD_PASSWORD } };
  }
  if (e.TICKETBOARD_TOKEN) return { apiUrl: e.TICKETBOARD_API_URL, credentials: { token: e.TICKETBOARD_TOKEN } };
  throw new Error("Set TICKETBOARD_TOKEN, or both TICKETBOARD_EMAIL and TICKETBOARD_PASSWORD.");
}
