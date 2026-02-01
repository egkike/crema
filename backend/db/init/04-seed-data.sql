-- 04-seed-data.sql
-- Inserta datos iniciales de prueba en la tabla users (en schema 'public' por defecto)
-- Hash password = Admin1 (Se recomienda cambiar por un hash propio en producción)

INSERT INTO users (username, password, email, fullname) VALUES 
('admin', '$2b$10$K59x//Okkfudik.Cs6jwmeROognDsr./JA90.oeS4cg3l/l.36OaG', 'admin@midominio.com', 'Usuario Administrador')
ON CONFLICT (username) DO NOTHING;

UPDATE users SET level = 99, active = 1, must_change_password = false
WHERE username = 'admin';

-- Configuración de Moneda del sistema
INSERT INTO system_settings (key, value, description) 
VALUES ('platform_currency', 'ARS', 'Moneda principal de operación');

-- Configuración de Moneda habilitada para Argentina
INSERT INTO enabled_currencies (code, name, symbol) 
VALUES ('ARS', 'Pesos Argentinos', '$');

-- Configuración de Gateway habilitado para Argentina
INSERT INTO payment_gateways (id, name) 
VALUES ('mercadopago', 'Mercado Pago');

-- Configuración de Moneda y Gateway habilitados para Argentina
INSERT INTO currency_gateways (currency_code, gateway_id) 
VALUES ('ARS', 'mercadopago');

-- Parámetros de Comisión
INSERT INTO platform_configs (key, currency, value, description) VALUES 
('fee_percent', 'ARS', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 'ARS', 150.00000000, 'Fee fijo para productos <= 22500 ARS'),
('fixed_fee_high', 'ARS', 750.00000000, 'Fee fijo para productos > 22500 ARS'),
('price_threshold', 'ARS', 22500.00000000, 'Límite de precio para cambio de fee fijo'),
('min_payout_amount', 'ARS', 15000.00000000, 'Monto mínimo para solicitar retiro en Pesos');