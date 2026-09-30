import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive a real browser against the real stack: the Vite web app, the
// Express API, Postgres and Redis. Nothing is mocked — that's the point. Unit tests prove
// each piece; these prove the pieces work together, the way a user experiences them.
//
// The suite runs on its own ports and its own database, so it never touches dev data or the
// unit-test database:
//   web  :5174 (Vite, proxying /api and /socket.io to the API below)
//   api  :3100, Postgres database ticketboard_e2e, Redis logical DB 2
// Postgres and Redis come from `docker compose up -d` locally, and service containers in CI.

const DATABASE_URL = process.env["E2E_DATABASE_URL"] ?? "postgresql://ticket:ticket@localhost:5433/ticketboard_e2e";
const REDIS_URL = process.env["E2E_REDIS_URL"] ?? "redis://localhost:6379/2";
const API_PORT = 3100;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Tests share one database. Each creates its own users, so they don't collide, but running
  // them one at a time keeps failures easy to read.
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure", // a step-by-step replay of any failed test, for debugging
  },
  webServer: [
    {
      // Plain tsx, not `npm run dev`: no file watcher to outlive the run.
      command: "npx tsx src/index.ts",
      cwd: "../api",
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        // "test" turns off the login/guest rate limits, which would otherwise trip on
        // the dozens of accounts this suite creates from one IP.
        NODE_ENV: "test",
        PORT: String(API_PORT),
        DATABASE_URL,
        REDIS_URL,
        JWT_SECRET: "e2e-secret-at-least-16-chars",
        CORS_ORIGIN: `http://localhost:${WEB_PORT}`,
        AI_SERVICE_URL: "", // AI off: tests assert on UI behaviour, not model output
        SEED_DEMO_BOARD: "on",
        TRUST_PROXY: "1",
      },
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      cwd: "../web",
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});

export { DATABASE_URL };
