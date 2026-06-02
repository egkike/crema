-- =============================================================================
-- 16-ai-insights-views.sql
--
-- SDD: fix-agents-service-gga-findings (Phase 3 — Architectural)
-- Refs: issue #47, PR #3 of the chained fix.
--
-- PURPOSE
--   Create a curated view layer that the LLM-generated SQL path targets,
--   instead of letting the LLM read from raw underlying tables. The views
--   expose ONLY columns that are safe for analytics consumption:
--     * No PII (no `users.email`, `users.fullname`, `users.password`)
--     * No review/question bodies (`product_reviews.content`,
--       `product_questions.question`) — these are free-form text that
--       could leak user data or be used as an exfiltration channel.
--     * No payment internals (`external_reference`, `transaction_id`,
--       `gateway_*`, tax data).
--
--   Every view that the LLM is allowed to query against includes a
--   `creator_id` column so Row Level Security on the underlying tables
--   (see `18-ai-insights-rls.sql`) can isolate rows per creator.
--
-- WHY VIEWS, NOT A NEW SCHEMA
--   A new schema would force every existing query (`pool.query(safeSql)`)
--   to be qualified with the schema name. Views keep the existing
--   SQL surface intact and the `ai_insights_ro` role is granted
--   SELECT on the views (and REVOKEd on the underlying tables).
--
-- COLUMN MAPPING
--   * ai_insights_safe_orders      -> orders + products (creator_id)
--   * ai_insights_safe_products    -> products
--   * ai_insights_safe_users       -> users (PII stripped)
--   * ai_insights_safe_commissions -> commissions + orders + products
--   * ai_insights_safe_reviews     -> product_reviews + products
--
-- product_questions is intentionally OMITTED in this PR per the design
-- (LLM query surface does not target it; deferred if needed later).
-- =============================================================================

-- 1. Orders: join to products to expose creator_id
CREATE OR REPLACE VIEW ai_insights_safe_orders AS
SELECT
    o.id,
    o.product_id,
    p.creator_id,
    o.buyer_id,
    o.amount,
    o.currency,
    o.status,
    o.created_at
FROM orders o
JOIN products p ON p.id = o.product_id;

-- 2. Products: own creator_id column is the isolation key
CREATE OR REPLACE VIEW ai_insights_safe_products AS
SELECT
    id,
    creator_id,
    title,
    type,
    status,
    created_at
FROM products;

-- 3. Users: PII columns (email, fullname, password, 2FA) deliberately omitted
CREATE OR REPLACE VIEW ai_insights_safe_users AS
SELECT
    id,
    username,
    level,
    created_at
FROM users;

-- 4. Commissions: creator_id is the order's product creator
CREATE OR REPLACE VIEW ai_insights_safe_commissions AS
SELECT
    c.id,
    c.order_id,
    c.user_id,
    c.amount,
    c.fee_applied,
    c.net_amount,
    c.currency,
    c.type,
    c.status,
    c.created_at,
    p.creator_id
FROM commissions c
JOIN orders o ON o.id = c.order_id
JOIN products p ON p.id = o.product_id;

-- 5. Reviews: content/title omitted (free-form text, exfiltration risk)
CREATE OR REPLACE VIEW ai_insights_safe_reviews AS
SELECT
    r.id,
    r.product_id,
    p.creator_id,
    r.user_id,
    r.rating,
    r.created_at
FROM product_reviews r
JOIN products p ON p.id = r.product_id;

-- =============================================================================
-- Enforce security_invoker on every view. Without this, views default to
-- definer's rights: if a future migration grants ai_insights_ro SELECT on
-- a new view over a sensitive table, the role sees data through the owner's
-- privileges, bypassing the REVOKE on underlying tables.
-- security_invoker = true makes the view resolve permissions against the
-- invoking role (ai_insights_ro) instead of the view owner.
-- =============================================================================
ALTER VIEW ai_insights_safe_orders SET (security_invoker = true);
ALTER VIEW ai_insights_safe_products SET (security_invoker = true);
ALTER VIEW ai_insights_safe_users SET (security_invoker = true);
ALTER VIEW ai_insights_safe_commissions SET (security_invoker = true);
ALTER VIEW ai_insights_safe_reviews SET (security_invoker = true);

-- =============================================================================
-- Log de migración exitosa
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 16-ai-insights-views.sql executed successfully';
END $$;
