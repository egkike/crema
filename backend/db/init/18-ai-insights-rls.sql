-- =============================================================================
-- 18-ai-insights-rls.sql
--
-- SDD: fix-agents-service-gga-findings (Phase 3 — Architectural)
-- Refs: issue #47, PR #3 of the chained fix.
--
-- PURPOSE
--   Defense-in-depth Row Level Security on the five tables wrapped by the
--   `ai_insights_safe_*` views (16-ai-insights-views.sql). Even if the
--   `ai_insights_ro` role grants or the application layer fail, the
--   database itself refuses to return rows that do not belong to the
--   requesting creator.
--
-- HOW IT WORKS
--   1. The application's `withReadOnlyRole` helper sets
--        SET LOCAL app.current_creator_id = '<uuid>'
--      inside the transaction.
--   2. The RLS policy on each table uses
--        current_setting('app.current_creator_id', true)::uuid
--      (the `true` flag = `missing_ok` — returns NULL if the setting is
--      absent, so maintenance queries do not crash).
--   3. `ENABLE ROW LEVEL SECURITY` turns RLS on for the table.
--      `FORCE ROW LEVEL SECURITY` makes it apply to the table owner
--      too, so the application's superuser-like role cannot bypass
--      the policies either.
--
-- TABLES COVERED
--   * orders          -> isolation via order's product.creator_id
--   * products        -> isolation via products.creator_id
--   * users           -> isolation: creator sees self + buyers of own products
--   * commissions     -> isolation via commission's order's product.creator_id
--   * product_reviews -> isolation via review's product.creator_id
--   * product_questions -> isolation via question's product.creator_id
--   * user_balances   -> isolation: creator sees only their own balance row
--
-- WHY EACH POLICY
--   - orders / commissions / product_reviews: no `creator_id` column, so
--     the policy JOINs through `products` to find the creator.
--   - products: has a `creator_id` column, so the policy is a direct
--     comparison.
--   - users: a creator's analytics legitimately need to see their buyers
--     (so the LLM can answer questions like "who are my top buyers?").
--     The policy allows a user row to be visible if EITHER the user IS
--     the current creator, OR the user has at least one order for one
--     of the creator's products.
-- =============================================================================

-- 1. orders — isolation through products.creator_id
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON orders;
CREATE POLICY ai_insights_creator_isolation ON orders
  FOR SELECT
  TO ai_insights_ro
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = orders.product_id
      AND p.creator_id = current_setting('app.current_creator_id', true)::uuid
  ));

-- 2. products — direct creator_id match
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON products;
CREATE POLICY ai_insights_creator_isolation ON products
  FOR SELECT
  TO ai_insights_ro
  USING (creator_id = current_setting('app.current_creator_id', true)::uuid);

-- 3. users — creator sees self + buyers of own products
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON users;
CREATE POLICY ai_insights_creator_isolation ON users
  FOR SELECT
  TO ai_insights_ro
  USING (
    id = current_setting('app.current_creator_id', true)::uuid
    OR EXISTS (
      SELECT 1 FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.buyer_id = users.id
        AND p.creator_id = current_setting('app.current_creator_id', true)::uuid
    )
  );

-- 4. commissions — isolation through orders + products
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON commissions;
CREATE POLICY ai_insights_creator_isolation ON commissions
  FOR SELECT
  TO ai_insights_ro
  USING (EXISTS (
    SELECT 1 FROM orders o
    JOIN products p ON p.id = o.product_id
    WHERE o.id = commissions.order_id
      AND p.creator_id = current_setting('app.current_creator_id', true)::uuid
  ));

-- 5. product_reviews — isolation through products
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON product_reviews;
CREATE POLICY ai_insights_creator_isolation ON product_reviews
  FOR SELECT
  TO ai_insights_ro
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_reviews.product_id
      AND p.creator_id = current_setting('app.current_creator_id', true)::uuid
  ));

-- 6. product_questions — isolation through products
ALTER TABLE product_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_questions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON product_questions;
CREATE POLICY ai_insights_creator_isolation ON product_questions
  FOR SELECT
  TO ai_insights_ro
  USING (EXISTS (
    SELECT 1 FROM products p
    WHERE p.id = product_questions.product_id
      AND p.creator_id = current_setting('app.current_creator_id', true)::uuid
  ));

-- 7. user_balances — direct user_id match (a creator can only see their own balances)
ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_balances FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_insights_creator_isolation ON user_balances;
CREATE POLICY ai_insights_creator_isolation ON user_balances
  FOR SELECT
  TO ai_insights_ro
  USING (user_id = current_setting('app.current_creator_id', true)::uuid);

-- =============================================================================
-- Log de migración exitosa
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 18-ai-insights-rls.sql executed successfully (extended for product_questions and user_balances)';
END $$;
