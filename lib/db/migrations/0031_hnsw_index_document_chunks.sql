-- PERF-3: Add HNSW index on document_chunks.embedding for fast vector similarity search.
-- Without this index, every semantic search does a sequential scan of the full table.
-- m=16 / ef_construction=64 are safe defaults for typical embedding dimensions (1536).
CREATE INDEX IF NOT EXISTS "idx_document_chunks_embedding_hnsw"
  ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
