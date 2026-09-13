-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "aiTriage" JSONB;

-- NOTE: Prisma generated `DROP INDEX "Ticket_embedding_hnsw_idx"` here because it can't
-- represent HNSW indexes in schema.prisma. Removed by hand — see CLAUDE.md.
