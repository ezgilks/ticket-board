import "dotenv/config";
import { z } from "zod";

// Validate environment variables once, at startup. If something required is missing,
// the process crashes immediately with a clear message instead of failing on the
// first request that happens to need it.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  // Proxy hops in front of the API. Render = 3 (Cloudflare edge → Render load balancer →
  // in-container proxy), measured 2026-09-13. Local Vite/nginx proxy = 1.
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  // Comma-separated list of browser origins allowed to call the API.
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  // Optional: without it, caching and the Socket.io Redis adapter are disabled.
  REDIS_URL: z.string().optional(),
  // Optional: without it, tickets are created without embeddings or AI triage.
  AI_SERVICE_URL: z.string().optional(),
  // Shared secret sent to ai-service, which has a public URL in production.
  AI_SERVICE_TOKEN: z.string().optional(),
});

export const config = EnvSchema.parse(process.env);
export const corsOrigins = config.CORS_ORIGIN.split(",").map((o) => o.trim());
