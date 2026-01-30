-- 02-create-tables.sql
-- Crea las tablas principales en el schema por defecto 'public'
-- No usamos schema custom para mantener el template simple y estándar

--CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- Habilitar uuid_generate_v4()

-- Tabla users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    fullname VARCHAR(100),
    password TEXT NOT NULL,
    level INT DEFAULT 1 NOT NULL,
    active INT DEFAULT 0 NOT NULL,
    must_change_password BOOLEAN DEFAULT TRUE NOT NULL,
    createdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla refresh_tokens (almacenamiento de tokens de refresco)
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Tablas para productos digitales, órdenes y comisiones
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('course', 'ebook', 'membership', 'software', 'podcast', 'audiobook')),
    price DECIMAL(18,8) NOT NULL CHECK (price >= 0),
    currency VARCHAR(10) DEFAULT 'ARS',
    content_url TEXT,                     -- link a archivo (S3, Cloudinary, local)
    affiliate_commission_percent DECIMAL(18,8) DEFAULT 50.00,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),  -- agregado para control de visibilidad
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    affiliate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS', -- Añadido: Moneda de la venta
    commission_amount DECIMAL(18,8),
    status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, refunded
    payment_method VARCHAR(50),            -- 'mercadopago', 'crypto', etc.
    transaction_id TEXT,
    external_reference VARCHAR(255) UNIQUE, -- ID único que nosotros generamos y le enviamos a MP
    gateway_status VARCHAR(50),             -- Para guardar el estado "crudo" que devuelve la pasarela
    commissions_calculated BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS',
    status VARCHAR(50) DEFAULT 'pending',  -- pending, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE        -- cuando se paga la comisión al afiliado
);

-- Tabla para parámetros globales del sistema
CREATE TABLE IF NOT EXISTS platform_configs (
    key VARCHAR(50) PRIMARY KEY,
    value DECIMAL(18,8) NOT NULL, -- Mayor precisión para porcentajes
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Balances que guardará el acumulado de comisiones (creadores y afiliados)
CREATE TABLE IF NOT EXISTS user_balances (
    -- Eliminamos PRIMARY KEY de aquí para definirla abajo como compuesta
    user_id UUID NOT NULL REFERENCES users(id),
    total_earned DECIMAL(18,8) DEFAULT 0.00,
    available_balance DECIMAL(18,8) DEFAULT 0.00,
    pending_balance DECIMAL(18,8) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'ARS',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Definimos la PK compuesta: Un registro único por cada combinación de usuario/moneda
    PRIMARY KEY (user_id, currency)
);

-- Tabla donde registremos cada "mordida" que toma la plataforma.
CREATE TABLE IF NOT EXISTS platform_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    
    -- Desglose de la ganancia por transacción
    variable_amount DECIMAL(18,8) DEFAULT 0.00, -- El 9.9%
    fixed_amount DECIMAL(18,8) DEFAULT 0.00,    -- El $0.10 o $0.50
    
    -- Otros tipos de ingresos
    subscription_amount DECIMAL(18,8) DEFAULT 0.00,
    service_amount DECIMAL(18,8) DEFAULT 0.00, -- Por si cobras por soporte, etc.
    
    total_amount DECIMAL(18,8) NOT NULL, -- La suma de todo lo anterior    
    currency VARCHAR(10) DEFAULT 'ARS',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para que el usuario pueda ver el detalle de por qué su balance cambió
CREATE TABLE IF NOT EXISTS balance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) DEFAULT 'ARS',
    type VARCHAR(50) NOT NULL, -- 'sale_creator' (venta propia) o 'sale_affiliate' (comisión)
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de configuraciones generales
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para trackear solicitudes de Payouts
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'rejected'
    destination_account TEXT NOT NULL, -- CBU/CVU o Wallet Address
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);