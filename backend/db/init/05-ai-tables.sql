-- 05-ai-tables.sql
-- AI Features: Memory + Credits Foundation
-- Phase 1: Foundation (Memory + Credits)

-- NOTA: pgvector no está disponible en el contenedor actual
-- Usamos FLOAT[] como workaround temporal hasta instalar pgvector
-- La tabla usa embedding como array de 1536 floats (compatible con text-embedding-3-small)

-- 2. AI Embeddings Table (for semantic search) - usando FLOAT[] en lugar de vector
CREATE TABLE IF NOT EXISTS ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard')),
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding FLOAT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_type, source_id)
);

-- 3. AI Credits Table (user balance)
CREATE TABLE IF NOT EXISTS ai_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- 4. AI Credit Transactions Table (history)
CREATE TABLE IF NOT EXISTS ai_credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('purchase', 'usage', 'refund', 'bonus')),
    description TEXT,
    reference_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. AI Credit Packages Table (available packages)
CREATE TABLE IF NOT EXISTS ai_credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    credits INT NOT NULL,
    price_usd DECIMAL(18,8) NOT NULL,
    price_ars DECIMAL(18,8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default credit packages
INSERT INTO ai_credit_packages (name, credits, price_usd, price_ars) VALUES 
    ('Starter', 500, 2.00, 2000.00),
    ('Professional', 2000, 7.00, 7000.00),
    ('Enterprise', 5000, 15.00, 15000.00)
ON CONFLICT DO NOTHING;
