-- 04-seed-data.sql

-- Inserta datos iniciales en la tabla users (en schema 'public' por defecto)
-- Hash password = UnaNuevaClaveSegura2026! (Se recomienda cambiar por un hash propio en producción)
INSERT INTO users (username, password, email, fullname, level, active, must_change_password) VALUES 
('admin_crema', '$2b$12$7OR1Xy6A2.hqaskZjOizle13AcMRLUVBH//NKR40MyeQJx4//CeSq', 'admin@crema.com', 'Super Administrador Crema', 99, 1, false)
ON CONFLICT (username) DO NOTHING;

-- Configuración de Moneda del sistema
INSERT INTO system_settings (key, value, description) 
VALUES ('platform_currency', 'ARS', 'Moneda principal de operación');

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
('fee_percent', 'ARS', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 'ARS', 150.00000000, 'Fee fijo para productos <= 22500 ARS'),
('fixed_fee_high', 'ARS', 750.00000000, 'Fee fijo para productos > 22500 ARS'),
('price_threshold', 'ARS', 22500.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'ARS', 15000.00000000, 'Monto mínimo para solicitar retiro en Pesos'),
('fee_percent', 'USDT', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 'USDT', 0.10000000, 'Fee fijo para productos <= 15 USDT'),
('fixed_fee_high', 'USDT', 0.50000000, 'Fee fijo para productos > 15 USDT'),
('price_threshold', 'USDT', 15.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'USDT', 50.00, 'Monto mínimo para retiro en USDT Crypto');