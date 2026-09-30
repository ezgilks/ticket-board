-- Pending invitations for people who don't have an account yet.
--
-- The invite link carries a random token; only its SHA-256 hash is stored here. Someone
-- who reads this table (a leaked backup, a misconfigured API) can't turn a row back into a
-- working link — the same reason passwords are stored hashed.
--
-- Hand-written, not generated: `migrate dev --create-only` can't replay the RLS migration
-- into its shadow database. See CLAUDE.md.

-- CreateTable
CREATE TABLE "BoardInvite" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardInvite_tokenHash_key" ON "BoardInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "BoardInvite_boardId_email_key" ON "BoardInvite"("boardId", "email");

-- AddForeignKey
ALTER TABLE "BoardInvite" ADD CONSTRAINT "BoardInvite_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardInvite" ADD CONSTRAINT "BoardInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every table gets Row Level Security, like the ones in 20260913230000_enable_row_level_security.
-- That migration only covered the tables that existed then; tests/rls.test.ts now fails if a
-- table is ever added without it.
ALTER TABLE "BoardInvite" ENABLE ROW LEVEL SECURITY;
