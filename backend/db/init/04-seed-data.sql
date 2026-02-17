-- 04-seed-data.sql

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

-- Configuración de Moneda habilitada para Argentina y Cripto
INSERT INTO enabled_currencies (code, name, symbol) VALUES 
('ARS', 'Pesos Argentinos', '$'),
('USDT', 'Tether', '₮')
ON CONFLICT (code) DO NOTHING;

-- Configuración de Gateway habilitado para Argentina
INSERT INTO payment_gateways (id, name) VALUES 
('mercadopago', 'Mercado Pago'),
('simulator', 'Pay Simulator');

-- Configuración de Moneda y Gateway habilitados para Argentina
INSERT INTO currency_gateways (currency_code, gateway_id) VALUES
('ARS', 'mercadopago'),
('ARS', 'simulator'),
('USDT', 'simulator');

-- Parámetros de Comisión
INSERT INTO platform_configs (key, currency, value, description) VALUES 
-- Reglas para Pesos Argentinos
('fee_percent', 'ARS', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 'ARS', 150.00000000, 'Fee fijo para productos <= 22500 ARS'),
('fixed_fee_high', 'ARS', 750.00000000, 'Fee fijo para productos > 22500 ARS'),
('price_threshold', 'ARS', 22500.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'ARS', 15000.00000000, 'Monto mínimo para solicitar retiro en Pesos'),
('max_payout_amount', 'ARS', 750000.00, 'Monto máximo por retiro (750 Mil ARS)'),
('payout_frequency_limit', 'ARS', 1, 'Cantidad de retiros permitidos por día'),
('payout_processing_days', 'ARS', 3, 'Días hábiles estimados para procesar el retiro'),
-- Reglas para USDT
('fee_percent', 'USDT', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 'USDT', 0.10000000, 'Fee fijo para productos <= 15 USDT'),
('fixed_fee_high', 'USDT', 0.50000000, 'Fee fijo para productos > 15 USDT'),
('price_threshold', 'USDT', 15.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'USDT', 50.00, 'Monto mínimo para retiro en USDT Crypto'),
('max_payout_amount', 'USDT', 500.00, 'Monto máximo por retiro (500 USDT)'),
('payout_frequency_limit', 'USDT', 1, 'Cantidad de retiros permitidos por día'),
('payout_processing_days', 'USDT', 2, 'Días hábiles estimados para procesar el retiro');

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
DO $$
DECLARE
    plan_free_id UUID;
    plan_pro_id UUID;
BEGIN
    -- Plan Inicial (Para que todos los nuevos creadores empiecen aquí)
    INSERT INTO platform_plans (name, level_required, is_free, features)
    VALUES ('Creador Initial', 3, true, '{
        "max_products": 3, 
        "storage_mb": 500, 
        "advanced_stats": false
    }') RETURNING id INTO plan_free_id;

    -- Plan Pro (Pago)
    INSERT INTO platform_plans (name, level_required, is_free, features)
    VALUES ('Creador Pro', 3, false, '{
        "max_products": 100, 
        "storage_mb": 10240, 
        "advanced_stats": true,
        "custom_fee_percent": 0.05
    }') RETURNING id INTO plan_pro_id;

    -- Seteamos solo el plan por defecto para creadores
    INSERT INTO system_settings (key, value, description) 
    VALUES 
    ('default_creator_plan_id', plan_free_id, 'Plan asignado automáticamente al subir a Nivel 3'),
    ('min_global_affiliate_commission', '10', 'Porcentaje mínimo de comisión que un creador debe ofrecer (0-100)')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $$;
