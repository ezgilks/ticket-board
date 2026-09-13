-- pgvector adds a `vector` column type and distance operators (<=> is cosine distance).
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "embedding" vector(384);

-- HNSW: an approximate-nearest-neighbour graph index. Without it, "find the closest
-- vectors" compares against every row; with it, the search visits a small neighbourhood.
-- vector_cosine_ops makes the index serve ORDER BY embedding <=> $query.
CREATE INDEX "Ticket_embedding_hnsw_idx" ON "Ticket" USING hnsw ("embedding" vector_cosine_ops);
