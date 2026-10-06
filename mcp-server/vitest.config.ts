import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Starts the real API (and a fake ai-service) once, for tests/integration.test.ts.
    // Needs Postgres + Redis: `docker compose up -d` locally, service containers in CI.
    globalSetup: ["./tests/global-setup.ts"],
    // Spawning the MCP server and waiting for background AI enrichment takes a few seconds.
    testTimeout: 30_000,
  },
});
