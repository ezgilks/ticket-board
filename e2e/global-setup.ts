import { execSync } from "node:child_process";
import { DATABASE_URL } from "./playwright.config";

// Once per run: bring the e2e database up to date the way production is (migrate deploy,
// which also creates the database the first time), then empty it so every run starts clean.
export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL };
  execSync("npx prisma migrate deploy", { cwd: "../api", env, stdio: "inherit" });
  execSync("npx prisma db execute --stdin", {
    cwd: "../api",
    env,
    input: 'TRUNCATE "Ticket", "Column", "BoardInvite", "BoardMember", "Board", "User" RESTART IDENTITY CASCADE;',
    stdio: ["pipe", "inherit", "inherit"],
  });
}
