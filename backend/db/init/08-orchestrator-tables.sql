-- Migration: 08-orchestrator-tables.sql
-- Skills Registry for Orchestrator Phase 2
-- Created: Abril 2026

-- ============================================================================
-- Table: skills
-- Stores metadata for AI skills that can be discovered via Orchestrator
-- NOTE: Handlers are NOT stored here - only metadata for discovery
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    capability VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    parameters JSONB DEFAULT '[]',
    options JSONB DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_skills_capability ON skills(capability);
CREATE INDEX IF NOT EXISTS idx_skills_enabled ON skills(enabled);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE skills IS 'Registry of AI skills for Orchestrator - metadata only, handlers stored in-memory';
COMMENT ON COLUMN skills.capability IS 'Unique capability identifier (e.g., llm.chat, embedding.generate)';
COMMENT ON COLUMN skills.parameters IS 'JSON schema for skill input parameters';
COMMENT ON COLUMN skills.options IS 'Skill options (timeout, retries, cacheable, streaming)';
COMMENT ON COLUMN skills.enabled IS 'Whether skill is active and available';

-- ============================================================================
-- Initial Skills (Metadata only - actual handlers registered at boot)
-- ============================================================================

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('LLM Chat', 'llm.chat', 'Chat completion with LLM', 
     '[{"name": "messages", "type": "array", "required": true}]',
     '{"timeout": 60000, "retries": 2, "cacheable": false, "streaming": false}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('LLM Stream', 'llm.stream', 'Streaming chat completion with LLM',
     '[{"name": "messages", "type": "array", "required": true}]',
     '{"timeout": 60000, "retries": 2, "cacheable": false, "streaming": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Embedding Generate', 'embedding.generate', 'Generate vector embeddings',
     '[{"name": "text", "type": "string", "required": true}]',
     '{"timeout": 30000, "retries": 1, "cacheable": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Embedding Batch', 'embedding.batch', 'Generate batch vector embeddings',
     '[{"name": "texts", "type": "array", "required": true}]',
     '{"timeout": 60000, "retries": 1, "cacheable": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('QA Answer', 'qa.answer', 'Question answering with AI',
     '[{"name": "question", "type": "string", "required": true}]',
     '{"timeout": 30000, "retries": 2, "cacheable": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('QA with Context', 'qa.with_context', 'QA with provided context',
     '[{"name": "question", "type": "string", "required": true}, {"name": "context", "type": "string", "required": true}]',
     '{"timeout": 30000, "retries": 2, "cacheable": false}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Memory Store', 'memory.store', 'Store information in memory',
     '[{"name": "key", "type": "string", "required": true}, {"name": "value", "type": "string", "required": true}]',
     '{"timeout": 5000, "retries": 1, "cacheable": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Memory Recall', 'memory.recall', 'Recall stored information',
     '[{"name": "query", "type": "string", "required": true}]',
     '{"timeout": 10000, "retries": 1, "cacheable": true}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Review Analyze', 'review.analyze', 'Analyze content for review',
     '[{"name": "content", "type": "string", "required": true}]',
     '{"timeout": 30000, "retries": 1, "cacheable": false}',
     true)
ON CONFLICT (capability) DO NOTHING;

INSERT INTO skills (name, capability, description, parameters, options, enabled) VALUES
    ('Transcribe Audio', 'transcribe.audio', 'Transcribe audio to text',
     '[{"name": "audioUrl", "type": "string", "required": true}]',
     '{"timeout": 120000, "retries": 1, "cacheable": false}',
     true)
ON CONFLICT (capability) DO NOTHING
ON CONFLICT (capability) DO NOTHING;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 08-orchestrator-tables.sql executed successfully';
END $$;