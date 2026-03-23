-- Migration: Add performance indexes for query optimization
-- Created: 2026-03-22
-- Description: Add indexes for hot path queries in orders and products tables

-- Orders: lookup by buyer+product with status filter (paid orders are most queried)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_buyer_product_paid 
  ON orders(buyer_id, product_id) 
  WHERE status = 'paid';

-- Products: lookup fast by slug (for public URLs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_slug 
  ON products(slug) 
  WHERE status = 'published';

-- Orders: Index for commission calculation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_commissions_calculated
  ON orders(id)
  WHERE commissions_calculated = false;

-- Orders: Index for balance release queries  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_balance_released
  ON orders(id)
  WHERE balance_released = false AND release_at IS NOT NULL;

-- Commissions: Index for order lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commissions_order
  ON commissions(order_id);

-- Commissions: Index for user pending commissions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commissions_user_status
  ON commissions(user_id, status)
  WHERE status = 'pending';

-- Add comment
COMMENT ON INDEX idx_orders_buyer_product_paid IS 'Hot path: buyer product access checks for paid orders';
COMMENT ON INDEX idx_products_slug IS 'Fast slug lookup for public product URLs';
