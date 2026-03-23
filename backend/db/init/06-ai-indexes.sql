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

-- =============================================================================
-- Phase 2: Q&A System Indexes
-- =============================================================================

-- Indexes for product_questions
CREATE INDEX IF NOT EXISTS idx_product_questions_product ON product_questions(product_id);
CREATE INDEX IF NOT EXISTS idx_product_questions_user ON product_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_product_questions_created ON product_questions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_questions_published ON product_questions(is_published, created_at DESC);

-- Indexes for question_votes
CREATE INDEX IF NOT EXISTS idx_question_votes_question ON question_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_question_votes_user ON question_votes(user_id);

-- Indexes for product_faqs
CREATE INDEX IF NOT EXISTS idx_product_faqs_product ON product_faqs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_faqs_active ON product_faqs(is_active, sort_order);

-- =============================================================================
-- Phase 3: Reviews/Ratings Indexes
-- =============================================================================

-- Indexes for product_reviews
CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_rating ON product_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_product_reviews_created ON product_reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_reviews_published ON product_reviews(is_published, created_at DESC);

-- Indexes for review_votes
CREATE INDEX IF NOT EXISTS idx_review_votes_review ON review_votes(review_id);
CREATE INDEX IF NOT EXISTS idx_review_votes_user ON review_votes(user_id);

-- Indexes for product_review_settings
CREATE INDEX IF NOT EXISTS idx_product_review_settings_product ON product_review_settings(product_id);

-- =============================================================================
-- Phase 4: Denunciations Indexes
-- =============================================================================

-- Indexes for reports
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_content ON reports(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

-- Indexes for report_reasons
CREATE INDEX IF NOT EXISTS idx_report_reasons_content ON report_reasons(content_type);
CREATE INDEX IF NOT EXISTS idx_report_reasons_active ON report_reasons(is_active);

-- Indexes for report_actions
CREATE INDEX IF NOT EXISTS idx_report_actions_report ON report_actions(report_id);
CREATE INDEX IF NOT EXISTS idx_report_actions_performed ON report_actions(performed_by);

-- Indexes for content_policies
CREATE INDEX IF NOT EXISTS idx_content_policies_type ON content_policies(content_type);
CREATE INDEX IF NOT EXISTS idx_content_policies_active ON content_policies(is_active, sort_order);

-- =============================================================================
-- Phase 5: AI Agents Indexes
-- =============================================================================

-- Indexes for product_qa_agent_config
CREATE INDEX IF NOT EXISTS idx_product_qa_agent_config_product ON product_qa_agent_config(product_id);

-- Indexes for agent_conversations
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_product ON agent_conversations(product_id);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_type ON agent_conversations(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_created ON agent_conversations(created_at DESC);

-- Indexes for agent_messages
CREATE INDEX IF NOT EXISTS idx_agent_messages_conversation ON agent_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at DESC);

-- =============================================================================
-- Phase 6: Analytics Dashboard Indexes
-- =============================================================================

-- Indexes for creator_daily_metrics
CREATE INDEX IF NOT EXISTS idx_creator_daily_metrics_creator ON creator_daily_metrics(creator_id);
CREATE INDEX IF NOT EXISTS idx_creator_daily_metrics_date ON creator_daily_metrics(date DESC);

-- =============================================================================
-- Phase 7: Advanced AI Indexes
-- =============================================================================

-- Indexes for product_tutor_config
CREATE INDEX IF NOT EXISTS idx_product_tutor_config_product ON product_tutor_config(product_id);

-- Indexes for tutor_insights
CREATE INDEX IF NOT EXISTS idx_tutor_insights_user ON tutor_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_tutor_insights_product ON tutor_insights(product_id);
CREATE INDEX IF NOT EXISTS idx_tutor_insights_type ON tutor_insights(insight_type);

-- Indexes for creator_dashboards
CREATE INDEX IF NOT EXISTS idx_creator_dashboards_creator ON creator_dashboards(creator_id);

-- Indexes for insights_history
CREATE INDEX IF NOT EXISTS idx_insights_history_user ON insights_history(user_id);
CREATE INDEX IF NOT EXISTS idx_insights_history_created ON insights_history(created_at DESC);
