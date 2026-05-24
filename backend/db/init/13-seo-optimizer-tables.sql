-- SEO Optimizer Tables
-- SDD: docs/project/ai-features/sdd/seo-optimizer/
-- Task 0: DB Migration for SEO meta tags storage

-- product_seo_configs: Meta tags generados por producto
CREATE TABLE IF NOT EXISTS product_seo_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    meta_title VARCHAR(70),
    meta_description VARCHAR(160),
    og_title VARCHAR(70),
    og_description VARCHAR(160),
    og_image_url VARCHAR(500),
    schema_markup JSONB,
    keywords TEXT[],
    canonical_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda rápida por product_id
CREATE INDEX IF NOT EXISTS idx_seo_configs_product ON product_seo_configs(product_id);

-- Índice para queries de cleanup por updated_at
CREATE INDEX IF NOT EXISTS idx_seo_configs_updated ON product_seo_configs(updated_at ASC);

-- Comentarios para documentación
COMMENT ON TABLE product_seo_configs IS 'Meta tags SEO generados automáticamente para productos';
COMMENT ON COLUMN product_seo_configs.meta_title IS 'Título SEO (máx 60 chars, recomendado 30-60)';
COMMENT ON COLUMN product_seo_configs.meta_description IS 'Descripción SEO (máx 160 chars, recomendado 100-155)';
COMMENT ON COLUMN product_seo_configs.og_title IS 'Open Graph título para redes sociales (máx 70 chars)';
COMMENT ON COLUMN product_seo_configs.og_description IS 'Open Graph descripción (máx 100 chars)';
COMMENT ON COLUMN product_seo_configs.og_image_url IS 'URL de imagen para Open Graph';
COMMENT ON COLUMN product_seo_configs.schema_markup IS 'JSON-LD estructurado según Schema.org';
COMMENT ON COLUMN product_seo_configs.keywords IS 'Keywords para SEO';
COMMENT ON COLUMN product_seo_configs.canonical_url IS 'URL canónica para evitar contenido duplicado';