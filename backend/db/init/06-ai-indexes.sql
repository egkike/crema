-- 06-ai-indexes.sql
-- AI Features Indexes
-- Phase 1: Foundation (Memory + Credits)

-- Indexes for ai_embeddings
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_source ON ai_embeddings(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user ON ai_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_created ON ai_embeddings(created_at DESC);

-- Vector index for cosine similarity search (ivfflat for better performance with large datasets)
-- Note: This requires pgvector extension
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        CREATE INDEX IF NOT EXISTS idx_ai_embeddings_vector ON ai_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    END IF;
END $$;

-- Indexes for ai_credits
CREATE INDEX IF NOT EXISTS idx_ai_credits_user ON ai_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_credits_expires ON ai_credits(expires_at);

-- Indexes for ai_credit_transactions
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_user ON ai_credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_date ON ai_credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_type ON ai_credit_transactions(type);

-- Indexes for ai_credit_packages
CREATE INDEX IF NOT EXISTS idx_ai_credit_packages_active ON ai_credit_packages(is_active);
