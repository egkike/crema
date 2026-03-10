-- 01-create-tables.sql
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
    affiliate_slug VARCHAR(50) UNIQUE,
    tax_id VARCHAR(11), -- CUIT/CUIL sin guiones
    tax_condition VARCHAR(50) DEFAULT 'monotax', -- 'ri', 'monotax', 'exempt'
    must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token TEXT,
    verification_token_expires TIMESTAMP WITH TIME ZONE,
    reset_password_token TEXT,
    reset_password_expires TIMESTAMP WITH TIME ZONE,
    two_factor_secret TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_backup_codes JSONB DEFAULT '[]',
    createdate TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para controlar qué monedas opera la plataforma (Orquestador)
CREATE TABLE IF NOT EXISTS enabled_currencies (
    code VARCHAR(10) PRIMARY KEY, -- 'ARS', 'USDT'
    name VARCHAR(50) NOT NULL,
    symbol VARCHAR(5) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    required_payout_fields TEXT[] DEFAULT '{}',
    validation_rules JSONB DEFAULT '{}',
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
    liquidity_delay_days INT DEFAULT 0,
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
    revoked_at TIMESTAMP WITH TIME ZONE,
    user_agent TEXT,
    ip_address VARCHAR(45),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    device_type VARCHAR(50) -- Ej: Mobile, Desktop, Tablet
);

-- Tabla para el Historial de Actividad (Auditoría)
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- Ej: 'LOGIN_SUCCESS', 'PASSWORD_CHANGE', '2FA_ENABLED'
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    affiliate_commission_percent DECIMAL(18,8) DEFAULT 5.00,
    slug VARCHAR(100) UNIQUE,
    size_bytes BIGINT DEFAULT 0,
    has_structured_content BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    guarantee_days INT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN products.guarantee_days IS 'Días de garantía específicos para este producto. Si es NULL, usa el global.';
COMMENT ON COLUMN products.has_structured_content IS 'Si es TRUE, el contenido se busca en product_modules/lessons. Si es FALSE, se usa content_url.';

-- Tabla de Precios x monedas
CREATE TABLE IF NOT EXISTS product_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL REFERENCES enabled_currencies(code),
    amount DECIMAL(18,8) NOT NULL CHECK (amount >= 0),
    UNIQUE(product_id, currency) -- Un producto no puede tener dos precios en la misma moneda
);

-- 1. Tabla de Cupones de descuentos
CREATE TABLE IF NOT EXISTS product_coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    discount_percent DECIMAL(18,8) NOT NULL DEFAULT 0.00,
    max_uses INT NOT NULL DEFAULT 1,
    current_uses INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Restricciones de Negocio
    CONSTRAINT check_max_discount CHECK (discount_percent <= 20.00),
    CONSTRAINT check_positive_uses CHECK (max_uses > 0),
    UNIQUE(product_id, code)
);
COMMENT ON COLUMN product_coupons.discount_percent IS 'Limite estricto de 20% para proteger rentabilidad de afiliados y plataforma';

-- Tabla para organizar el contenido en secciones o módulos (ej: "Introducción", "Módulo Avanzado")
CREATE TABLE IF NOT EXISTS product_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    order_index INT DEFAULT 0, -- Para que el creador pueda ordenar los módulos
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para el contenido real de cada lección
CREATE TABLE IF NOT EXISTS product_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES product_modules(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Tipo de contenido dentro de la lección
    content_type VARCHAR(20) DEFAULT 'video' CHECK (content_type IN ('video', 'pdf', 'text', 'quiz', 'link')),
    
    -- URL del video (Vimeo, Wistia, YouTube) o del archivo en nuestro storage
    content_url TEXT,
    
    -- Duración en segundos (si es video/audio)
    duration_seconds INT DEFAULT 0,
    
    -- Para lecciones que son solo texto (tipo blog/artículo)
    body_text TEXT,
    
    order_index INT DEFAULT 0,
    is_preview BOOLEAN DEFAULT FALSE, -- ¿Es una clase gratuita de muestra?
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla para trackear el progreso de los estudiantes en las lecciones
CREATE TABLE IF NOT EXISTS user_lessons_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES product_lessons(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    PRIMARY KEY (user_id, lesson_id)
);

-- Tabla de Estructura de las preguntas (JSONB para máxima flexibilidad)
CREATE TABLE IF NOT EXISTS product_lesson_quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id UUID NOT NULL REFERENCES product_lessons(id) ON DELETE CASCADE,
    -- JSONB: [{ "id": 1, "question": "¿...?", "options": ["a", "b"], "correct": 0 }]
    questions JSONB NOT NULL, 
    passing_score INT DEFAULT 80, -- Porcentaje mínimo para aprobar
    max_attempts INT DEFAULT NULL, -- NULL es ilimitado
    UNIQUE(lesson_id)
);

-- Tabla de Historial de intentos y resultados
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quiz_id UUID NOT NULL REFERENCES product_lesson_quizzes(id) ON DELETE CASCADE,
    score INT NOT NULL, -- Nota obtenida (0-100)
    passed BOOLEAN NOT NULL,
    answers JSONB, -- Respuestas que eligió el usuario (para revisión)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Certificados obtenidos
CREATE TABLE IF NOT EXISTS user_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    certificate_code UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    issued_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Un usuario solo debería tener UN certificado por cada producto
    UNIQUE(user_id, product_id)
);

-- Tabla de Ordenes de compras generadas
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    affiliate_id UUID REFERENCES users(id) ON DELETE SET NULL,
    amount DECIMAL(18,8) NOT NULL,
    original_amount DECIMAL(18,8),
    coupon_id UUID REFERENCES product_coupons(id) ON DELETE SET NULL,
    discount_applied DECIMAL(18,8) DEFAULT 0.00,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    commission_amount DECIMAL(18,8),
    status VARCHAR(50) DEFAULT 'pending' CHECK (
        status IN ('pending', 'paid', 'refunded')
    ),
    payment_method VARCHAR(50),              -- 'mercadopago', 'crypto', etc.
    transaction_id TEXT,
    external_reference VARCHAR(255) UNIQUE,  -- ID único que nosotros generamos y le enviamos a MP
    gateway_status VARCHAR(50),              -- Para guardar el estado "crudo" que devuelve la pasarela
    gateway_fee DECIMAL(18,8) DEFAULT 0.00,
    gateway_tax DECIMAL(18,8) DEFAULT 0.00,
    gateway_taxes_detail JSONB DEFAULT '{}', -- { "iibb_mendoza": 15.5, "iva_retencion": 10.2, "ganancias": 5.0 }
    net_platform_profit DECIMAL(18,8) DEFAULT 0.00,
    commissions_calculated BOOLEAN DEFAULT FALSE,
    balance_released BOOLEAN DEFAULT FALSE,
    days_of_guarantee_applied INT DEFAULT 7,
    is_guarantee_eligible BOOLEAN DEFAULT TRUE,
    gateway_liquidity_days_applied INT DEFAULT 0,
    release_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN orders.is_guarantee_eligible IS 'Se vuelve FALSE si el usuario consume el producto (descarga o progreso > 30%)';
COMMENT ON COLUMN orders.gateway_fee IS 'Comisión bruta cobrada por la pasarela (ej: Mercado Pago Fee)';
COMMENT ON COLUMN orders.gateway_tax IS 'Impuestos retenidos por la pasarela (ej: IVA de la comisión)';
COMMENT ON COLUMN orders.net_platform_profit IS 'Ganancia real de Crema tras restar costos de pasarela e impuestos del fee de plataforma';
COMMENT ON COLUMN orders.gateway_liquidity_days_applied IS 'Días de retención de la pasarela vigentes al momento del pago.';
COMMENT ON COLUMN orders.release_at IS 'Fecha definitiva de liberación: MAX(garantía, liquidez pasarela).';

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

-- Tabla para que el usuario pueda ver el detalle de por qué su balance cambió
CREATE TABLE IF NOT EXISTS balance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- Si se borra la orden, mantenemos el historial
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    -- Definimos el tipo con un CHECK inline para integridad de datos
    type VARCHAR(50) NOT NULL CHECK (
        type IN ('sale_creator', 'sale_affiliate', 'refund', 'payout_request', 'payout_refund', 'payout_cancel', 'balance_release')
    ),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    
    tax_amount DECIMAL(18,8) DEFAULT 0.00,
    total_amount DECIMAL(18,8) NOT NULL, -- La suma de todo lo anterior
    net_profit DECIMAL(18,8) DEFAULT 0.00,
    creator_tax_id VARCHAR(11),
    status VARCHAR(20) DEFAULT 'active', -- active, paid, refunded
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    balance_released BOOLEAN DEFAULT FALSE,
    released_at TIMESTAMP WITH TIME ZONE,
    release_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
COMMENT ON COLUMN platform_earnings.net_profit IS 'Monto que queda en la billetera de Crema después de pagar costos operativos de la transacción';
COMMENT ON COLUMN platform_earnings.release_at IS 'Fecha programada para la liberación (copiada de la orden).';
COMMENT ON COLUMN platform_earnings.released_at IS 'Fecha real en la que el cron ejecutó la liberación del saldo.';

-- Tabla de "Resumen" de la billetera de la plataforma
CREATE TABLE IF NOT EXISTS platform_balances (
    currency VARCHAR(10) PRIMARY KEY REFERENCES enabled_currencies(code),
    pending_balance DECIMAL(18,8) DEFAULT 0.00 CHECK (pending_balance >= 0),
    available_balance DECIMAL(18,8) DEFAULT 0.00 CHECK (available_balance >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla que permite que la plataforma tenga su propio "Libro de Egresos" independiente.
CREATE TABLE IF NOT EXISTS platform_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL, -- Quién autorizó el retiro
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    description TEXT,
    transaction_receipt VARCHAR(255) NOT NULL, -- El comprobante bancario/MP
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_admin FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Tabla para trackear solicitudes de Payouts
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL,
    currency VARCHAR(10) REFERENCES enabled_currencies(code),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'refunded', 'cancelled')),
    destination_account TEXT NOT NULL, -- CBU/CVU o Wallet Address
    admin_notes TEXT,
    bank_name VARCHAR(100),
    account_holder VARCHAR(100),
    tax_id VARCHAR(50), -- CUIT/CUIL
    alias VARCHAR(100),
    transaction_receipt TEXT, -- Nro de transferencia, Hash o ID de transacción bancaria
    payout_data_snapshot JSONB DEFAULT '{}',
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
    gateway_subscription_id TEXT UNIQUE, 
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Tabla de Portfolio de productos de los Afiliados
CREATE TABLE IF NOT EXISTS affiliate_portfolio (
    affiliate_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (affiliate_id, product_id)
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
CREATE TRIGGER trg_upd_platform_balances BEFORE UPDATE ON platform_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_upd_product_lessons BEFORE UPDATE ON product_lessons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
