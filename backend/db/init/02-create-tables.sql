-- 02-create-tables.sql
-- Crea las tablas principales en el schema por defecto 'public'
-- No usamos schema custom para mantener el template simple y estándar

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- Habilitar uuid_generate_v4()

-- Tabla users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Tablas para productos digitales, órdenes y comisiones

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('course', 'ebook', 'membership', 'software', 'podcast', 'audiobook')),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    content_url TEXT,                     -- link a archivo (S3, Cloudinary, local)
    affiliate_commission_percent DECIMAL(5,2) DEFAULT 50.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    affiliate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(10,2) NOT NULL,
    commission_amount DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'pending',  -- pending, paid, refunded
    payment_method VARCHAR(50),            -- 'mercadopago', 'crypto', etc.
    transaction_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    affiliate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, paid
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
