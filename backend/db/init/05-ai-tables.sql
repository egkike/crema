-- 05-ai-tables.sql
-- AI Features: Memory + Credits Foundation
-- Phase 1: Foundation (Memory + Credits)

-- IMPORTANTE: Asegurarse de que pgvector esté instalado:
-- CREATE EXTENSION IF NOT EXISTS vector;

-- 2. AI Embeddings Table (for semantic search) - usando vector(1536) de pgvector
CREATE TABLE IF NOT EXISTS ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard')),
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
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

-- Insert default credit packages (from PRD v1.2)
INSERT INTO ai_credit_packages (name, credits, price_usd, price_ars) VALUES 
    ('Básico', 500, 2.00, 4000.00),
    ('Standard', 2000, 7.00, 14000.00),
    ('Pro', 5000, 15.00, 30000.00)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Phase 2: Q&A System Tables
-- =============================================================================

-- 2.1 Product Questions Table
CREATE TABLE IF NOT EXISTS product_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    answered_by UUID REFERENCES users(id) ON DELETE SET NULL,
    answered_at TIMESTAMP WITH TIME ZONE,
    is_published BOOLEAN DEFAULT TRUE,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2.2 Question Votes Table
CREATE TABLE IF NOT EXISTS question_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('helpful', 'not_helpful')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(question_id, user_id)
);

-- 2.3 Product FAQs Table (managed by creators)
CREATE TABLE IF NOT EXISTS product_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    question VARCHAR(500) NOT NULL,
    answer TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, question)
);

-- =============================================================================
-- Phase 3: Reviews/Ratings Tables
-- =============================================================================

-- 3.1 Product Reviews Table
CREATE TABLE IF NOT EXISTS product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    content TEXT NOT NULL,
    is_verified_purchase BOOLEAN DEFAULT FALSE,
    is_published BOOLEAN DEFAULT TRUE,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
);

-- 3.2 Review Votes Table
CREATE TABLE IF NOT EXISTS review_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote_type VARCHAR(10) NOT NULL CHECK (vote_type IN ('helpful', 'not_helpful')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(review_id, user_id)
);

-- 3.3 Product Review Settings Table (creator config)
CREATE TABLE IF NOT EXISTS product_review_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    allow_reviews BOOLEAN DEFAULT TRUE,
    require_verified_purchase BOOLEAN DEFAULT FALSE,
    auto_publish BOOLEAN DEFAULT FALSE,
    min_rating INT DEFAULT 1 CHECK (min_rating >= 1 AND min_rating <= 5),
    max_rating INT DEFAULT 5 CHECK (max_rating >= 1 AND max_rating <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- =============================================================================
-- Phase 4: Denunciations Tables
-- =============================================================================

-- 4.1 Reports Table (main report entity)
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'review', 'question', 'answer', 'faq', 'user')),
    content_id UUID NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'rejected')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.2 Report Reasons Table (catalog of valid reasons)
CREATE TABLE IF NOT EXISTS report_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'review', 'question', 'answer', 'faq', 'user')),
    code VARCHAR(50) NOT NULL,
    label_es VARCHAR(100) NOT NULL,
    label_en VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(content_type, code)
);

-- 4.3 Report Actions Table (actions taken on reports)
CREATE TABLE IF NOT EXISTS report_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('warning', 'suspend', 'ban', 'delete_content', 'hide_content', 'no_action')),
    performed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4.4 Content Policies Table (visible to users)
CREATE TABLE IF NOT EXISTS content_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_es VARCHAR(200) NOT NULL,
    title_en VARCHAR(200) NOT NULL,
    content_es TEXT NOT NULL,
    content_en TEXT NOT NULL,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'review', 'question', 'faq', 'general')),
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default report reasons
INSERT INTO report_reasons (content_type, code, label_es, label_en, severity) VALUES
    ('product', 'inappropriate', 'Contenido inapropiado', 'Inappropriate content', 'high'),
    ('product', 'fake', 'Producto falso o engañoso', 'Fake or misleading product', 'critical'),
    ('product', 'scam', 'Estafa o fraude', 'Scam or fraud', 'critical'),
    ('product', 'copyright', 'Violación de derechos de autor', 'Copyright violation', 'high'),
    ('review', 'fake', 'Review falsa o financiada', 'Fake or paid review', 'high'),
    ('review', 'inappropriate', 'Review inapropiada', 'Inappropriate review', 'medium'),
    ('review', 'spam', 'Spam o contenido promocional', 'Spam or promotional content', 'medium'),
    ('question', 'spam', 'Spam o contenido promocional', 'Spam or promotional content', 'low'),
    ('question', 'inappropriate', 'Pregunta inapropiada', 'Inappropriate question', 'medium'),
    ('user', 'harassment', 'Acoso o bullying', 'Harassment or bullying', 'critical'),
    ('user', 'fake', 'Cuenta falsa o usurapación de identidad', 'Fake account or identity theft', 'high')
ON CONFLICT DO NOTHING;

-- Insert default content policies
INSERT INTO content_policies (title_es, title_en, content_es, content_en, content_type) VALUES
    ('Política de contenido apropiado', 'Appropriate content policy', 
     'Todo el contenido publicado en Crema debe ser apropiado y respetar las normas de la comunidad.',
     'All content published on Crema must be appropriate and respect community guidelines.',
     'general'),
    ('Política de reviews', 'Reviews policy',
     'Las reviews deben ser opiniones genuinas de compradores reales. Está prohibido publicar reviews falsas o pagadas.',
     'Reviews must be genuine opinions from real buyers. Fake or paid reviews are prohibited.',
     'review')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- Phase 5: AI Agents Tables
-- =============================================================================

-- 5.1 Product Q&A Agent Config Table
CREATE TABLE IF NOT EXISTS product_qa_agent_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    model VARCHAR(50) DEFAULT 'gpt-4',
    system_prompt TEXT,
    temperature FLOAT DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INT DEFAULT 1000,
    use_memory BOOLEAN DEFAULT TRUE,
    use_faqs BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- 5.2 Agent Conversations Table
CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN ('qa', 'tutor', 'insights')),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5.3 Agent Messages Table
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES agent_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tokens_used INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Phase 6: Analytics Dashboard Tables
-- =============================================================================

-- 6.1 Creator Daily Metrics Table
CREATE TABLE IF NOT EXISTS creator_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_sales INT DEFAULT 0,
    total_revenue DECIMAL(18,8) DEFAULT 0,
    total_commissions DECIMAL(18,8) DEFAULT 0,
    new_customers INT DEFAULT 0,
    active_customers INT DEFAULT 0,
    product_views INT DEFAULT 0,
    conversion_rate FLOAT DEFAULT 0,
    ai_credits_used INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, date)
);

-- =============================================================================
-- Phase 7: Advanced AI Tables (Tutor + Insights)
-- =============================================================================

-- 7.1 Product Tutor Config Table
CREATE TABLE IF NOT EXISTS product_tutor_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    model VARCHAR(50) DEFAULT 'gpt-4',
    system_prompt TEXT,
    temperature FLOAT DEFAULT 0.7 CHECK (temperature >= 0 AND temperature <= 2),
    max_tokens INT DEFAULT 1500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id)
);

-- 7.2 Tutor Insights Table
CREATE TABLE IF NOT EXISTS tutor_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL CHECK (insight_type IN ('progress', 'recommendation', 'summary', 'weakness', 'strength')),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7.3 Creator Dashboards Table
CREATE TABLE IF NOT EXISTS creator_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, name)
);

-- 7.4 Insights History Table
CREATE TABLE IF NOT EXISTS insights_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    sql_generated TEXT,
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- Phase 7.4b: insights_history schema fix
-- ADD missing columns referenced by existing code in agents.service.ts
-- These columns were already used in INSERT statements but never added to the table
-- =============================================================================

ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS is_successful BOOLEAN DEFAULT TRUE;
ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS error_message TEXT;
