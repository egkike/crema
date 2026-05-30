-- 14-ai-insights-expansion.sql
-- AI Insights Expansion: Churn Predictions + Recovery Emails + A/B Comparatives
-- SDD: ai-insights-expansion (§4.8)

-- 7.5 Churn Predictions Table
CREATE TABLE IF NOT EXISTS churn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    churn_score INTEGER NOT NULL CHECK (churn_score >= 0 AND churn_score <= 100),
    risk_factors JSONB NOT NULL DEFAULT '[]',
    narrative TEXT,
    recommended_action TEXT,
    data_snapshot JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_creator ON churn_predictions(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_predictions_product ON churn_predictions(product_id);
CREATE INDEX IF NOT EXISTS idx_churn_predictions_target ON churn_predictions(target_user_id);
CREATE INDEX IF NOT EXISTS idx_churn_predictions_product_time ON churn_predictions(product_id, created_at DESC);

-- 7.6 Recovery Emails Table
CREATE TABLE IF NOT EXISTS recovery_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    preview_text VARCHAR(150),
    tone VARCHAR(20) NOT NULL DEFAULT 'empathic' CHECK (tone IN ('empathic', 'direct', 'motivational')),
    churn_prediction_id UUID REFERENCES churn_predictions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_emails_creator ON recovery_emails(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_emails_target ON recovery_emails(target_user_id);

-- 7.7 A/B Comparatives Table
CREATE TABLE IF NOT EXISTS ab_comparatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('period', 'product')),
    entity_a_label VARCHAR(100),
    entity_b_label VARCHAR(100),
    metrics TEXT[] NOT NULL CHECK (metrics <@ ARRAY['revenue', 'sales', 'conversion', 'engagement', 'reviews']),
    entity_a_data JSONB,
    entity_b_data JSONB,
    narrative TEXT,
    deltas JSONB,
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ab_comparatives_creator ON ab_comparatives(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ab_comparatives_entity_type ON ab_comparatives(entity_type);
