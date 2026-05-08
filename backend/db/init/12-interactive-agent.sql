-- =============================================================================
-- Interactive Agent Tables
-- SDD: docs/project/ai-features/sdd/interactive-agent/
--
-- Known limitations:
-- - findUserData silently truncates at 10000 offset — documented as acceptable
--     for pagination depth (users rarely page beyond 100 pages).
-- - Advisory locks block same user across tabs — inherent to the design;
--     users editing the same module from multiple tabs will see 409 Conflict
--     on the second tab. This is intentional to prevent data corruption.
-- - Advisory lock collision probability via MD5 is theoretically non-zero
--      but astronomically low (2^64 key space). Acceptable for now.
-- =============================================================================

-- Tabla user_course_data: almacena datos de entrada del usuario y análisis
-- de resultados por producto/módulo en el flujo interactivo
CREATE TABLE IF NOT EXISTS user_course_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL CHECK (module_key ~ '^[a-z0-9_]+$'),
    input_data JSONB NOT NULL DEFAULT '{}',
    output_analysis JSONB,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id, module_key),
    CONSTRAINT chk_input_data_size CHECK (octet_length(input_data::text) <= 51200),
    CONSTRAINT chk_output_analysis_size CHECK (octet_length(output_analysis::text) <= 1048576)
);

-- Tabla product_module_fields: define configuración de campos por producto/módulo
CREATE TABLE IF NOT EXISTS product_module_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL CHECK (module_key ~ '^[a-z0-9_]+$'),
    field_name VARCHAR(100) NOT NULL CHECK (field_name ~ '^[a-z0-9_]+$'),
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('number', 'string', 'boolean', 'select')),
    field_label VARCHAR(200) NOT NULL,
    field_placeholder VARCHAR(500),
    field_options JSONB,
    field_required BOOLEAN DEFAULT FALSE,
    field_validation JSONB,
    order_index INTEGER NOT NULL DEFAULT 0 CHECK (order_index >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_product_module_fields UNIQUE(product_id, module_key, field_name)
);

-- DB-level guard on field_options array length (with type guard to prevent crashes on non-array JSONB)
ALTER TABLE product_module_fields
ADD CONSTRAINT chk_field_options_array_length
CHECK (field_options IS NULL OR (jsonb_typeof(field_options) = 'array' AND jsonb_array_length(field_options) <= 100));

-- CR2: Prevent ReDoS vector via oversized field_validation patterns
ALTER TABLE product_module_fields
ADD CONSTRAINT chk_field_validation_size
CHECK (field_validation IS NULL OR octet_length(field_validation::text) <= 10000);

-- CR6: Select fields must have at least one option
ALTER TABLE product_module_fields
ADD CONSTRAINT chk_select_requires_options
CHECK (field_type != 'select' OR (field_options IS NOT NULL AND jsonb_array_length(field_options) >= 1));

-- =============================================================================
-- Triggers para updated_at
-- La función update_updated_at_column() ya existe en 01-create-tables.sql
-- =============================================================================

CREATE TRIGGER trg_upd_user_course_data
    BEFORE UPDATE ON user_course_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_upd_product_module_fields
    BEFORE UPDATE ON product_module_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- Índices para consultas performantes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_course_data_user ON user_course_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_product ON user_course_data(product_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_module ON user_course_data(user_id, product_id, module_key);
CREATE INDEX IF NOT EXISTS idx_user_course_data_created ON user_course_data(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_course_data_input_gin ON user_course_data USING GIN (input_data);
CREATE INDEX IF NOT EXISTS idx_user_course_data_product_module ON user_course_data(product_id, module_key);
CREATE INDEX IF NOT EXISTS idx_user_course_data_completed ON user_course_data(product_id) WHERE completed = true;

-- Composite index for findUserData pagination
CREATE INDEX IF NOT EXISTS idx_user_course_data_user_product_created
  ON user_course_data(user_id, product_id, created_at DESC);

-- Composite index for findUserData with moduleKey filter
CREATE INDEX IF NOT EXISTS idx_user_course_data_user_product_module_created
  ON user_course_data(user_id, product_id, module_key, created_at DESC);

-- Partial index for hasActiveOrder access pattern
-- NOTE: status column removed from index key — redundant with WHERE clause
CREATE INDEX IF NOT EXISTS idx_orders_active_access
  ON orders(product_id, buyer_id)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_product_module_fields_product ON product_module_fields(product_id);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_module ON product_module_fields(product_id, module_key);
-- Redundant index dropped (covered by idx_product_module_fields_lookup)
-- DROP INDEX IF EXISTS idx_product_module_fields_order;
CREATE INDEX IF NOT EXISTS idx_product_module_fields_lookup ON product_module_fields(product_id, module_key, order_index);

-- Partial index for numeric field stats queries
CREATE INDEX IF NOT EXISTS idx_product_module_fields_numeric
  ON product_module_fields(product_id, field_name)
  WHERE field_type = 'number';

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE user_course_data IS 'Almacena datos de entrada del usuario y análisis de resultados por producto/módulo en el flujo interactivo del agente';
COMMENT ON TABLE product_module_fields IS 'Define la configuración de campos (tipo, label, validaciones) por producto y módulo para el agente interactivo';
COMMENT ON COLUMN user_course_data.input_data IS 'JSONB con los datos ingresados por el usuario en el módulo';
COMMENT ON COLUMN user_course_data.output_analysis IS 'JSONB con el análisis generado por el agente IA';
COMMENT ON COLUMN user_course_data.completed IS 'Indica si el usuario completó el módulo interactivo';
COMMENT ON COLUMN user_course_data.completed_at IS 'Timestamp de cuando se completó el módulo';
COMMENT ON COLUMN product_module_fields.field_type IS 'Tipo de campo: number, string, boolean, o select';
COMMENT ON COLUMN product_module_fields.field_options IS 'Opciones para campos de tipo select (array de valores)';
COMMENT ON COLUMN product_module_fields.field_validation IS 'Reglas de validación específicas del campo (min, max, pattern, etc.)';
COMMENT ON COLUMN product_module_fields.order_index IS 'Orden de visualización del campo en el formulario';

-- =============================================================================
-- Log de migración exitosa
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 12-interactive-agent.sql executed successfully';
END $$;
