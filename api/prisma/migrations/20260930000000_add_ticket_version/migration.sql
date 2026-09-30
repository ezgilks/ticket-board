-- Optimistic concurrency for ticket edits. Every content edit bumps the version, and a save
-- only applies if the version the client started from is still current:
--   UPDATE "Ticket" SET ..., version = version + 1 WHERE id = $1 AND version = $2
-- Zero rows updated means someone else saved first, and the API answers 409.
--
-- Existing rows start at 1. Adding a NOT NULL column with a constant default is a
-- metadata-only change in Postgres 11+, so this doesn't rewrite the table.
--
-- Hand-written, not generated: `migrate dev --create-only` can't replay the RLS migration
-- into its shadow database. See CLAUDE.md.

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
