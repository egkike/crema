-- 04-seed-data.sql
-- Inserta datos iniciales de prueba en la tabla users (en schema 'public' por defecto)
-- Hash password = Admin1 (Se recomienda cambiar por un hash propio en producción)

INSERT INTO users (username, password, email, fullname) VALUES 
('admin', '$2b$10$K59x//Okkfudik.Cs6jwmeROognDsr./JA90.oeS4cg3l/l.36OaG', 'admin@midominio.com', 'Usuario Administrador')
ON CONFLICT (username) DO NOTHING;

UPDATE users SET level = 5, active = 1, must_change_password = false
WHERE username = 'admin';

-- Parámetros de Comisión
INSERT INTO platform_configs (key, value, description) VALUES 
('fee_percent', 0.09900000, 'Comisión de plataforma (9.9%)'),
('fixed_fee_low', 150.00000000, 'Fee fijo para productos <= 22500 ARS'),
('fixed_fee_high', 750.00000000, 'Fee fijo para productos > 22500 ARS'),
('price_threshold', 22500.00000000, 'Límite de precio para cambio de fee fijo');

-- Configuración de Moneda
INSERT INTO system_settings (key, value, description) 
VALUES ('platform_currency', 'ARS', 'Moneda principal de operación');