-- 03-create-seeds.sql

-- Inserta datos iniciales en la tabla users (en schema 'public' por defecto)

-- Hash password = UnaNuevaClaveSegura2026! (Se recomienda cambiar por un hash propio en producción)
INSERT INTO users (username, password, email, fullname, level, active, must_change_password) VALUES 
('admin_crema', '$2b$12$7OR1Xy6A2.hqaskZjOizle13AcMRLUVBH//NKR40MyeQJx4//CeSq', 'admin@crema.com', 'Super Administrador Crema', 99, 1, false)
ON CONFLICT (username) DO NOTHING;

-- Configuración de Moneda y Días de garantia del sistema
INSERT INTO system_settings (key, value, description) VALUES 
('platform_currency', 'ARS', 'Moneda principal de operación'),
('days_of_guarantee', '7', 'Días de espera para liberar el saldo tras una compra'),
('user_levels', '{"GUEST": 0, "USER": 1, "AFFILIATE": 2, "CREATOR": 3, "STAFF": 10, "ADMIN": 99}', 'Mapeo de niveles de permisos y roles')
ON CONFLICT (key) DO NOTHING;

-- Configuración de Moneda habilitada para Argentina y Cripto con Reglas de Validación Dinámicas
INSERT INTO enabled_currencies (code, name, symbol, is_active, required_payout_fields, validation_rules) 
VALUES 
(
    'ARS', 
    'Pesos Argentinos', 
    '$', 
    TRUE, 
    ARRAY['cbu', 'alias', 'tax_id', 'holder'], 
    '{
        "cbu": { 
            "minLength": 22, 
            "maxLength": 22, 
            "pattern": "^[0-9]+$",
            "errorMsg": "El CBU debe contener exactamente 22 números."
        },
        "tax_id": { 
            "minLength": 11, 
            "maxLength": 11, 
            "pattern": "^[0-9]+$",
            "errorMsg": "El CUIT/CUIL debe tener 11 dígitos sin guiones."
        },
        "holder": { 
            "minLength": 3, 
            "pattern": "^[a-zA-Z ]+$",
            "errorMsg": "Nombre del titular inválido."
        },
        "tax_config": {
            "enabled": true,
            "tax_name": "IVA",
            "tax_factor": 1.21,
            "calculation": "inside"
        }
    }'::jsonb
),
(
    'USDT', 
    'Tether', 
    '₮', 
    TRUE, 
    ARRAY['address', 'network'], 
    '{
        "address": { 
            "minLength": 34, 
            "maxLength": 42, 
            "pattern": "^(T[A-Za-z0-9]{33}|0x[a-fA-F0-9]{40})$",
            "errorMsg": "Dirección de billetera USDT inválida (Soporta TRC20 o ERC20)."
        },
        "network": { 
            "pattern": "^(TRC20|ERC20|BEP20)$",
            "errorMsg": "Red no soportada. Use TRC20, ERC20 o BEP20."
        },
        "tax_config": {
            "enabled": false
        }
    }'::jsonb
)
ON CONFLICT (code) DO UPDATE SET 
    required_payout_fields = EXCLUDED.required_payout_fields,
    validation_rules = EXCLUDED.validation_rules,
    is_active = EXCLUDED.is_active;

-- Configuración de Gateway habilitado para Argentina
INSERT INTO payment_gateways (id, name, liquidity_delay_days) VALUES 
('mercadopago', 'Mercado Pago', 14),
('simulator', 'Pay Simulator', 0);

-- Configuración de Moneda y Gateway habilitados para Argentina
INSERT INTO currency_gateways (currency_code, gateway_id) VALUES
('ARS', 'mercadopago'),
('ARS', 'simulator'),
('USDT', 'simulator');

-- Parámetros de Comisión
INSERT INTO platform_configs (key, currency, value, description) VALUES 
-- Reglas para Pesos Argentinos
('fee_percent', 'ARS', 0.10000000, 'Comisión de plataforma (10%)'),
('fixed_fee_low', 'ARS', 450.00000000, 'Fee fijo para productos <= 25000 ARS'),
('fixed_fee_high', 'ARS', 900.00000000, 'Fee fijo para productos > 25000 ARS'),
('price_threshold', 'ARS', 25000.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'ARS', 25000.00000000, 'Monto mínimo para solicitar retiro en Pesos'),
('max_payout_amount', 'ARS', 750000.00, 'Monto máximo por retiro (750 Mil ARS)'),
('payout_frequency_limit', 'ARS', 2, 'Cantidad de retiros permitidos por Mes'),
('payout_processing_days', 'ARS', 3, 'Días hábiles estimados para procesar el retiro'),
('min_product_price_factor', 'ARS', 10.0, 'Factor multiplicador sobre fixed_fee_low para precio mínimo de producto'),
-- Reglas para USDT
('fee_percent', 'USDT', 0.10000000, 'Comisión de plataforma (10%)'),
('fixed_fee_low', 'USDT', 0.30000000, 'Fee fijo para productos <= 20 USDT'),
('fixed_fee_high', 'USDT', 0.60000000, 'Fee fijo para productos > 20 USDT'),
('price_threshold', 'USDT', 20.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'USDT', 50.00, 'Monto mínimo para retiro en USDT Crypto'),
('max_payout_amount', 'USDT', 500.00, 'Monto máximo por retiro (500 USDT)'),
('payout_frequency_limit', 'USDT', 2, 'Cantidad de retiros permitidos por Mes'),
('payout_processing_days', 'USDT', 3, 'Días hábiles estimados para procesar el retiro'),
('min_product_price_factor', 'USDT', 10.0, 'Factor multiplicador sobre fixed_fee_low para precio mínimo de producto');

-- Semillas de Tipos de Productos
INSERT INTO product_types (id, name) VALUES 
('course', 'Curso Online'),
('ebook', 'Libro Digital'),
('membership', 'Membresía'),
('software', 'Software / Acceso'),
('podcast', 'Podcast Premium'),
('audiobook', 'Audiolibro')
ON CONFLICT (id) DO NOTHING;

-- Insertar Planes solo para Creadores (Nivel 3)
-- 1. Limpieza previa para evitar conflictos en re-ejecuciones
DELETE FROM plan_allowed_types;
DELETE FROM platform_plans;

-- 2. Insertar Planes con la nueva lógica de negocio
DO $$
DECLARE
    plan_free_id UUID;
    plan_pro_id UUID;
BEGIN
    -- Plan Inicial: 0 MB de storage. Solo para servicios o enlaces externos.
    INSERT INTO platform_plans (name, level_required, is_free, features)
    VALUES ('Creador Initial', 3, true, '{
        "max_products": 15, 
        "storage_mb": 0, 
        "allow_file_uploads": false,
        "advanced_stats": false,
        "custom_fee_percent": 0.10
    }') RETURNING id INTO plan_free_id;

    -- Plan Pro: 10 GB de storage y todos los beneficios.
    INSERT INTO platform_plans (name, level_required, is_free, features)
    VALUES ('Creador Pro', 3, false, '{
        "max_products": 100, 
        "storage_mb": 25600, 
        "allow_file_uploads": true,
        "advanced_stats": true,
        "custom_fee_percent": 0.08
    }') RETURNING id INTO plan_pro_id;

    -- 3. Definir Tipos Permitidos por Plan
    -- El Plan Inicial NO permite 'ebook', 'podcast' ni 'audiobook' porque son archivos pesados.
    -- Solo permite tipos que funcionan por links o accesos manuales.
    INSERT INTO plan_allowed_types (plan_id, product_type_id) VALUES 
    (plan_free_id, 'membership'), 
    (plan_free_id, 'software'),
    (plan_free_id, 'course'); -- Nota: El curso en Free será validado para ser solo vía Link (YouTube/Vimeo)

    -- El Plan Pro permite absolutamente TODO el catálogo.
    INSERT INTO plan_allowed_types (plan_id, product_type_id)
    SELECT plan_pro_id, id FROM product_types;

    -- 4. Actualizar Settings Globales
    INSERT INTO system_settings (key, value, description) 
    VALUES 
    ('default_creator_plan_id', plan_free_id, 'Plan asignado automáticamente al subir a Nivel 3'),
    ('min_global_affiliate_commission', '5', 'Porcentaje mínimo de comisión que un creador debe ofrecer')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $$;

-- Insertar Precios al Plan Pro en las Monedas correspondientes
DO $$
DECLARE
    pro_plan_id UUID;
BEGIN
    SELECT id INTO pro_plan_id FROM platform_plans WHERE name = 'Creador Pro' LIMIT 1;

    IF pro_plan_id IS NOT NULL THEN
        -- Precio en ARS (Nivelado a ~15 USD)
        INSERT INTO plan_prices (plan_id, currency, amount)
        VALUES (pro_plan_id, 'ARS', 30000.00000000)
        ON CONFLICT (plan_id, currency) DO UPDATE SET amount = EXCLUDED.amount;

        -- Precio en USDT (Base)
        INSERT INTO plan_prices (plan_id, currency, amount)
        VALUES (pro_plan_id, 'USDT', 20.00000000)
        ON CONFLICT (plan_id, currency) DO UPDATE SET amount = EXCLUDED.amount;
    END IF;
END $$;
