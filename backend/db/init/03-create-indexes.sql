-- 03-create-indexes.sql
-- Crea índices útiles sobre las tablas principales (en schema 'public' por defecto)

-- Índices recomendados en tabla refresh_tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id 
  ON refresh_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at 
  ON refresh_tokens (expires_at);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_revoked 
  ON refresh_tokens (revoked);

-- Opcional: índice para limpieza periódica de tokens expirados no revocados
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_cleanup ON refresh_tokens (expires_at) WHERE revoked = FALSE;

-- Índices útiles para rendimiento
CREATE INDEX IF NOT EXISTS idx_products_creator_id ON products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_external_ref ON orders(external_reference);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate_id ON commissions(affiliate_id);

-- Opcional: Crear un índice para que el Cron Job sea súper rápido
CREATE INDEX IF NOT EXISTS idx_orders_balance_release 
ON orders (status, balance_released, updated_at);

-- Índices para optimizar las consultas de auditoría y soporte
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_seller_id ON refunds(seller_id);
CREATE INDEX IF NOT EXISTS idx_refunds_buyer_id ON refunds(buyer_id);

-- Vital para productRepository.getProductById y getPriceByCurrency
CREATE INDEX IF NOT EXISTS idx_product_prices_composite 
ON product_prices (product_id, currency);

-- Vital para balanceRepository.getByUserIdAndCurrency
CREATE INDEX IF NOT EXISTS idx_user_balances_user_currency 
ON user_balances (user_id, currency);

-- Para listar los movimientos de un usuario ordenados por fecha (lo más común)
CREATE INDEX IF NOT EXISTS idx_balance_history_user_date 
ON balance_history (user_id, created_at DESC);

-- Para búsquedas rápidas vinculadas a una orden específica
CREATE INDEX IF NOT EXISTS idx_balance_history_order_id 
ON balance_history (order_id);

-- Optimización para CommissionService (Búsqueda de comisiones por orden)
CREATE INDEX IF NOT EXISTS idx_commissions_order_id 
ON commissions (order_id);

-- Para que el administrador pueda ver los retiros pendientes rápidamente
CREATE INDEX IF NOT EXISTS idx_payouts_status_created ON payouts(status, created_at DESC);