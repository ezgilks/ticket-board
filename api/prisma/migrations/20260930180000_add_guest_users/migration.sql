-- Temporary demo accounts ("Try it without signing up"). Guests have no usable password,
-- sign in only with the token they were issued, and are deleted after 24 hours along with
-- the boards they own. The index serves that cleanup query.
--
-- Hand-written, not generated: `migrate dev --create-only` can't replay the RLS migration
-- into its shadow database. See CLAUDE.md.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isGuest" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "User_isGuest_createdAt_idx" ON "User"("isGuest", "createdAt");
