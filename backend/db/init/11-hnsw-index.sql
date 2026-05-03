-- 11-hnsw-index.sql
-- Memory Enhancement: Replace IVFFlat with HNSW index
-- Phase 3: HNSW Index (from SDD memory-enhancement Task 3)

-- =============================================================================
-- Step 1: Create HNSW index CONCURRENTLY (non-blocking)
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_embeddings_hnsw
ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- Step 2: Verify HNSW index is working
-- =============================================================================

-- This query uses the new HNSW index for vector search
-- EXPLAIN ANALYZE SELECT * FROM ai_embeddings ORDER BY embedding <=> '[0,0,0]'::vector LIMIT 10;

-- =============================================================================
-- Step 3: Drop old IVFFlat index (only after confirming HNSW works)
-- =============================================================================

-- Note: This requires a separate migration step after verification
-- DROP INDEX IF EXISTS idx_ai_embeddings_vector;

-- =============================================================================
-- Step 4: Vacuum to reclaim space
-- =============================================================================

VACUUM ANALYZE ai_embeddings;

-- =============================================================================
-- HNSW Parameters Reference (SDD memory-enhancement design.md section 7.1)
-- ------------------------------------------------------------------------------
-- | Parameter       | Value  | Description                                    |
-- |-----------------|--------|------------------------------------------------|
-- | m               | 16     | Degree of connection (32 for >500K vectors)   |
-- | ef_construction | 64     | Build time quality/speed balance               |
-- | ef_search       | 40-100 | Runtime search accuracy (default 40)           |
-- =============================================================================