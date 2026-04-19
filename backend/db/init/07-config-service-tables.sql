-- ========================================
-- app_config Table for ConfigService
-- ========================================
-- Purpose: Centralized configuration for AI and operational settings
-- Created: 2026-04-19
-- Related SDD: docs/project/architecture-improvements/sdd/config-service/

-- Drop table if exists (for clean re-runs)
DROP TABLE IF EXISTS app_config CASCADE;

-- Create app_config table
CREATE TABLE app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) DEFAULT 'string',
    category VARCHAR(20) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT app_config_key_check CHECK (config_key ~ '^[a-z0-9._]+$'),
    CONSTRAINT app_config_type_check CHECK (config_type IN ('string', 'number', 'boolean', 'json')),
    CONSTRAINT app_config_category_check CHECK (category IN ('ai', 'retry', 'admin', 'commission', 'cache', 'providers', 'features'))
);

-- Create indexes
CREATE INDEX idx_app_config_category ON app_config(category);
CREATE INDEX idx_app_config_key ON app_config(config_key);

-- ========================================
-- Seed Data: Initial Configuration Values
-- ========================================

-- AI Configuration
INSERT INTO app_config (config_key, config_value, config_type, category, description) VALUES
('ai.embedding_dimensions', '1536', 'number', 'ai', 'Dimensiones para embeddings'),
('ai.whisper_model', 'whisper-1', 'string', 'ai', 'Modelo de Whisper para transcripcion'),
('ai.default_transcription_lang', 'es', 'string', 'ai', 'Idioma por defecto para transcripcion'),
('ai.audio_bitrate', '192000', 'number', 'ai', 'Bitrate para audio'),
('ai.simulator_delay', '50', 'number', 'ai', 'Delay en ms para simulador'),

-- Retry Configuration
('retry.payout_delay', '2000', 'number', 'retry', 'Delay de reintento en ms'),
('retry.release_delay', '2000', 'number', 'retry', 'Delay de release en ms'),

-- Pagination
('pagination.admin_limit', '100', 'number', 'admin', 'Limite por pagina'),

-- Commission
('commission.min_creator_margin', '5', 'number', 'commission', 'Margen minimo del creador (%)'),
('commission.max_affiliate_rate', '50', 'number', 'commission', 'Tasa maxima afiliado (%)'),

-- Cache
('cache.levels_ttl', '300000', 'number', 'cache', 'TTL de cache en ms (5 min)'),

-- Providers
('providers.blockonomics_timeout', '10000', 'number', 'providers', 'Timeout Blockonomics en ms'),
('providers.address_cleanup_ttl', '86400000', 'number', 'providers', 'Cleanup addresses en ms (24h)');

-- ========================================
-- Verify seed data was inserted
-- ========================================
SELECT 'app_config table created with ' || COUNT(*) || ' initial values' as result
FROM app_config;