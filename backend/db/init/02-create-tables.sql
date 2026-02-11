-- 02-create-tables.sql
-- Crea las tablas principales en el schema por defecto 'public'

-- 1. Tablas Base (Sin dependencias externas)

-- Tabla users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    fullname VARCHAR(100),
    password TEXT NOT NULL,
    level INT DEFAULT 1 NOT NULL,
    active INT DEFAULT 0 NOT NULL,
    must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token TEXT,
    verification_token_expires TIMESTAMP WITH TIME ZONE,
    reset_password_token TEXT,
    reset_password_expires TIMESTAMP WITH TIME ZONE,
    createdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para controlar qué monedas opera la plataforma (Orquestador)
CREATE TABLE IF NOT EXISTS enabled_currencies (
    code VARCHAR(10) PRIMARY KEY, -- 'ARS', 'USDT'
    name VARCHAR(50) NOT NULL,
    symbol VARCHAR(5) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de configuraciones generales
CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Pasarelas
CREATE TABLE IF NOT EXISTS payment_gateways (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_types (
    id VARCHAR(50) PRIMARY KEY, -- 'course', 'ebook', 'podcast', etc.
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabla de Catálogo de Planes (Solo beneficios)
CREATE TABLE IF NOT EXISTS platform_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    level_required INT NOT NULL,
    is_free BOOLEAN DEFAULT FALSE,
    -- JSONB para límites y beneficios: 
    -- { "max_products": 5, "storage_mb": 500, "min_commission": 15, "advanced_stats": true }
    features JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tablas con Dependencias (Foreign Keys)

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

-- Tabla para parámetros globales del sistema
CREATE TABLE IF NOT EXISTS platform_configs (
    key VARCHAR(50) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    value DECIMAL(18,8) NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (key, currency)
);

-- Tabla permite que una moneda tenga múltiples pasarelas y viceversa
CREATE TABLE IF NOT EXISTS currency_gateways (
    currency_code VARCHAR(10) REFERENCES enabled_currencies(code),
    gateway_id VARCHAR(50) REFERENCES payment_gateways(id),
    is_default BOOLEAN DEFAULT FALSE, -- Para saber cuál mostrar primero
    priority INTEGER DEFAULT 1,       -- Para ordenar en el frontend
    PRIMARY KEY (currency_code, gateway_id)
);

-- Tablas para productos digitales, órdenes y comisiones
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
    content_url TEXT,
    affiliate_commission_percent DECIMAL(18,8) DEFAULT 10.00,
    size_bytes BIGINT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Precios x monedas
CREATE TABLE IF NOT EXISTS product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL REFERENCES enabled_currencies(code),
    amount DECIMAL(18,8) NOT NULL CHECK (amount >= 0),
    UNIQUE(product_id, currency) -- Un producto no puede tener dos precios en la misma moneda
);

-- Tabla de Ordenes de compras generadas
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    affiliate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    commission_amount DECIMAL(18,8),
    status VARCHAR(50) DEFAULT 'pending' CHECK (
        status IN ('pending', 'paid', 'refunded')
    ),
    payment_method VARCHAR(50),            -- 'mercadopago', 'crypto', etc.
    transaction_id TEXT,
    external_reference VARCHAR(255) UNIQUE, -- ID único que nosotros generamos y le enviamos a MP
    gateway_status VARCHAR(50),             -- Para guardar el estado "crudo" que devuelve la pasarela
    commissions_calculated BOOLEAN DEFAULT FALSE,
    balance_released BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Comisiones generadas
CREATE TABLE IF NOT EXISTS commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL,
    fee_applied DECIMAL(18,8) NOT NULL DEFAULT 0,
    net_amount DECIMAL(18,8) NOT NULL DEFAULT 0,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    type VARCHAR(20) DEFAULT 'creator', -- 'creator' o 'affiliate'
    status VARCHAR(50) DEFAULT 'pending' CHECK (
        status IN ('pending', 'paid', 'refunded', 'cancelled')
    ),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE        -- cuando se paga la comisión al afiliado
);
-- Un comentario para que tu equipo sepa qué es cada cosa
COMMENT ON COLUMN commissions.fee_applied IS 'Comisión retenida por la plataforma';
COMMENT ON COLUMN commissions.net_amount IS 'Monto neto que se acredita al usuario';

-- Tabla de Balances que guardará el acumulado de comisiones (creadores y afiliados)
CREATE TABLE IF NOT EXISTS user_balances (
    user_id UUID NOT NULL REFERENCES users(id),
    total_earned DECIMAL(18,8) DEFAULT 0.00,
    available_balance DECIMAL(18,8) DEFAULT 0.00 CHECK (available_balance >= 0),
    pending_balance DECIMAL(18,8) DEFAULT 0.00 CHECK (pending_balance >= 0),
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Definimos la PK compuesta: Un registro único por cada combinación de usuario/moneda
    PRIMARY KEY (user_id, currency)
);

-- Tabla donde registramos cada "mordida" que toma la plataforma.
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
    status VARCHAR(20) DEFAULT 'active', -- active, paid, refunded
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para que el usuario pueda ver el detalle de por qué su balance cambió
CREATE TABLE IF NOT EXISTS balance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- Si se borra la orden, mantenemos el historial
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    -- Definimos el tipo con un CHECK inline para integridad de datos
    type VARCHAR(50) NOT NULL CHECK (
        type IN ('sale_creator', 'sale_affiliate', 'refund', 'payout_request', 'payout_refund')
    ),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para trackear solicitudes de Payouts
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'processing', 'completed', 'rejected', 'refunded')
    ),
    destination_account TEXT NOT NULL, -- CBU/CVU o Wallet Address
    admin_notes TEXT,
    bank_name VARCHAR(100),
    account_holder VARCHAR(100),
    tax_id VARCHAR(50), -- CUIT/CUIL
    alias VARCHAR(100),
    transaction_receipt TEXT, -- Nro de transferencia, Hash o ID de transacción bancaria
    admin_id UUID, -- ID del administrador que ejecutó la transferencia
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para devoluciones por garantias
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES users(id),
    buyer_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(18,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para que el usuario guarde sus métodos de cobro predefinidos
CREATE TABLE IF NOT EXISTS user_payout_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL REFERENCES enabled_currencies(code),
    type VARCHAR(20) NOT NULL CHECK (type IN ('bank_account', 'crypto_wallet')),   
    -- JSONB para flexibilidad:
    -- ARS: { "bank_name": "...", "cbu": "...", "alias": "...", "tax_id": "...", "holder": "..." }
    -- USDT: { "address": "...", "network": "..." }
    data JSONB NOT NULL,
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Un usuario solo puede tener un método por defecto por cada moneda
    UNIQUE(user_id, currency, is_default) 
);

-- Tabla de Precios del Plan por Moneda
CREATE TABLE IF NOT EXISTS plan_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES platform_plans(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL REFERENCES enabled_currencies(code),
    amount DECIMAL(18,8) NOT NULL CHECK (amount >= 0),
    UNIQUE(plan_id, currency)
);

-- Tabla de relacion Plan <-> Tipos de Productos
CREATE TABLE IF NOT EXISTS plan_allowed_types (
    plan_id UUID REFERENCES platform_plans(id) ON DELETE CASCADE,
    product_type_id VARCHAR(50) REFERENCES product_types(id) ON DELETE CASCADE,
    PRIMARY KEY (plan_id, product_type_id)
);

-- Tabla de Suscripciones Activas (Con registro de moneda y precio)
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES platform_plans(id),
    currency VARCHAR(10) REFERENCES enabled_currencies(code), -- Moneda de cobro
    price_at_subscription DECIMAL(18,8),                      -- Precio pactado
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
    mp_preapproval_id TEXT UNIQUE, 
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Función para los triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para mantener actualizados los updated_at
CREATE TRIGGER trg_upd_user_balances BEFORE UPDATE ON user_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_system_settings BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_platform_configs BEFORE UPDATE ON platform_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_products BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_orders BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_payouts BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_refunds BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_platform_earnings BEFORE UPDATE ON platform_earnings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_user_payout_methods BEFORE UPDATE ON user_payout_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_platform_plans BEFORE UPDATE ON platform_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_user_subscriptions BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
