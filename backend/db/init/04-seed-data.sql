-- 04-seed-data.sql
-- Inserta datos iniciales de prueba en la tabla users (en schema 'public' por defecto)
-- Hash password = Admin1 (Se recomienda cambiar por un hash propio en producción)

INSERT INTO users (username, password, email, fullname) VALUES 
('admin', '$2b$10$K59x//Okkfudik.Cs6jwmeROognDsr./JA90.oeS4cg3l/l.36OaG', 'admin@midominio.com', 'Usuario Administrador')
ON CONFLICT (username) DO NOTHING;

UPDATE users SET level = 5, active = 1, must_change_password = false
WHERE username = 'admin';

-- Insertamos los valores iniciales
INSERT INTO platform_configs (key, value, description) VALUES 
('fee_percent', 0.0990, 'Comisión de plataforma (9.90%)'),
('fixed_fee_low', 0.10, 'Fee fijo para productos <= 15 USD'),
('fixed_fee_high', 0.50, 'Fee fijo para productos > 15 USD'),
('price_threshold', 15.00, 'Límite de precio para cambio de fee fijo');