import { type ChildProcess, execSync, spawn } from "node:child_process";
import type { TestProject } from "vitest/node";
// Reused from the API's own tests: a real HTTP server with a bag-of-words "embedding",
// so semantic search is testable without loading an ML model.
import { startFakeAi } from "../../api/tests/fake-ai.js";

// Like e2e/, the integration test gets its own API process, port and database, so it never
// touches dev data or the API unit-test database:
//   api :3200, Postgres database ticketboard_mcp, Redis logical DB 3
const DATABASE_URL = process.env["MCP_DATABASE_URL"] ?? "postgresql://ticket:ticket@localhost:5433/ticketboard_mcp";
const REDIS_URL = process.env["MCP_REDIS_URL"] ?? "redis://localhost:6379/3";
const PORT = 3200;

declare module "vitest" {
  export interface ProvidedContext {
    apiUrl: string;
  }
}

let api: ChildProcess | undefined;
let fakeAi: Awaited<ReturnType<typeof startFakeAi>> | undefined;

export async function setup(project: TestProject) {
  const env = { ...process.env, DATABASE_URL };
  // migrate deploy also creates the database the first time.
  execSync("npx prisma migrate deploy", { cwd: "../api", env, stdio: "ignore" });
  execSync("npx prisma db execute --stdin", {
    cwd: "../api",
    env,
    input: 'TRUNCATE "Ticket", "Column", "BoardInvite", "BoardMember", "Board", "User" RESTART IDENTITY CASCADE;',
    stdio: ["pipe", "ignore", "inherit"],
  });

  fakeAi = await startFakeAi(() => ({ labels: ["bug"], priority: "HIGH", provider: "fake" }));

  // Plain tsx, not `npm run dev`: no file watcher to outlive the run.
  api = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: "../api",
    env: {
      ...process.env,
      NODE_ENV: "test", // turns off the login rate limit
      PORT: String(PORT),
      DATABASE_URL,
      REDIS_URL,
      JWT_SECRET: "mcp-test-secret-at-least-16-chars",
      AI_SERVICE_URL: fakeAi.url,
      AI_RETRY_DELAY_MS: "0",
      SEED_DEMO_BOARD: "off",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });

  const apiUrl = `http://localhost:${PORT}`;
  await waitFor(`${apiUrl}/health`);
  project.provide("apiUrl", apiUrl);
}

export async function teardown() {
  api?.kill("SIGTERM");
  await fakeAi?.close();
}

async function waitFor(url: string, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (api?.exitCode !== null) throw new Error(`API exited early with code ${api?.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`API didn't become healthy at ${url}`);
}
