import { defineConfig } from "vitest/config";

// Tests run against a real Postgres database (ticketboard_test), not mocks —
// mocks would hide exactly the bugs worth catching (constraints, cascades, SQL).
const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ?? "postgresql://ticket:ticket@localhost:5433/ticketboard_test";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    // All test files share one database, so run them one at a time.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: "test-secret-at-least-16-chars",
      // Blank = disabled. Tests don't need Redis or the AI service.
      REDIS_URL: "",
      AI_SERVICE_URL: "",
    },
  },
});
