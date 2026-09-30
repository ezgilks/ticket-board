-- Tracks whether background AI enrichment is still running for a ticket, so the UI can
-- say "working on it" instead of showing a silently unlabelled card. NULL means AI never
-- applied (the service is switched off), so no default and no backfill: existing rows
-- correctly read as "not applicable".
--
-- Hand-written rather than generated: the enable_row_level_security migration cannot be
-- replayed into Prisma's shadow database (it alters "_prisma_migrations", which Prisma
-- does not create there), so `migrate dev --create-only` fails. `migrate deploy` uses no
-- shadow database. See CLAUDE.md.

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "aiStatus" "AiStatus";
