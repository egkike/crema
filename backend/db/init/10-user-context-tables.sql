-- =============================================================================
-- User Context Tables
-- SDD: docs/project/architecture-improvements/sdd/user-context/
-- =============================================================================

-- Tabla user_context: guarda progreso y contexto del usuario por producto
CREATE TABLE IF NOT EXISTS user_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    context_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- Tabla user_notes: notas, highlights y bookmarks del usuario
CREATE TABLE IF NOT EXISTS user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    note_type VARCHAR(20) CHECK (note_type IN ('highlight', 'bookmark', 'note')),
    position JSONB,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes para performant queries
CREATE INDEX IF NOT EXISTS idx_user_context_user ON user_context(user_id);
CREATE INDEX IF NOT EXISTS idx_user_context_product ON user_context(product_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_product ON user_notes(product_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user_product ON user_notes(user_id, product_id);

-- =============================================================================
-- Seed data inicial (opcional)
-- =============================================================================

-- No hay seed required - los datos se crean cuando el usuario interactúa

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE user_context IS 'Guarda el contexto del usuario por producto: progreso, preguntas, notas';
COMMENT ON TABLE user_notes IS 'Notas, highlights y bookmarks del usuario por producto';
COMMENT ON COLUMN user_context.context_data IS 'JSONB con estructura: {questions: [], progress: 0, last_position: {}, notes: []}';
COMMENT ON COLUMN user_notes.note_type IS 'Tipo de nota: highlight, bookmark, o note';
COMMENT ON COLUMN user_notes.position IS 'Posición opcional: {page: 1, timestamp: 120} para multimedia';