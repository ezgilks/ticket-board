import { describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";

// Supabase exposes every table in the public schema through a REST API reachable with a
// publishable key. Row Level Security with no policies is what makes that API return
// nothing. The first RLS migration covered the tables that existed at the time; this test
// catches the next table that's added without it.
describe("row level security", () => {
  it("is enabled on every table in the public schema", async () => {
    const rows = await prisma.$queryRaw<{ table: string; rls: boolean }[]>`
      SELECT c.relname AS table, c.relrowsecurity AS rls
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.rls).map((r) => r.table)).toEqual([]);
  });
});
