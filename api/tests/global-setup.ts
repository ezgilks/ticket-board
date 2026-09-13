import { execSync } from "node:child_process";

// Runs once before the whole suite: bring the test database's schema up to date
// by applying every committed migration — the same way production gets migrated.
export default function setup() {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL:
        process.env["TEST_DATABASE_URL"] ?? "postgresql://ticket:ticket@localhost:5433/ticketboard_test",
    },
  });
}
