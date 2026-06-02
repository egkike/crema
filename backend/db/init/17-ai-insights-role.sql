-- =============================================================================
-- 17-ai-insights-role.sql
--
-- SDD: fix-agents-service-gga-findings (Phase 3 — Architectural)
-- Refs: issue #47, PR #3 of the chained fix.
--
-- PURPOSE
--   Create the `ai_insights_ro` database role used for executing
--   LLM-generated SQL safely. Properties:
--     * NOLOGIN — no human / application connects as this role directly.
--                 The application's pool user is what connects, then
--                 issues `SET LOCAL ROLE ai_insights_ro` to swap roles
--                 inside a transaction (see `withReadOnlyRole`).
--     * SELECT on the curated views only (16-ai-insights-views.sql).
--     * Explicit REVOKE on the underlying tables — defense in depth.
--       Even if a future view is misconfigured, the role has no access
--       to the raw tables that the views wrap.
--     * USAGE on the public schema so SELECT grants resolve.
--
-- USAGE
--   The application's pool helper `withReadOnlyRole` does:
--       BEGIN;
--       SET LOCAL ROLE ai_insights_ro;
--       SET LOCAL app.current_creator_id = '<uuid>';
--       <run SELECT against the safe views>;
--     COMMIT;
--
--   Because the role has no INSERT/UPDATE/DELETE grants and the
--   underlying tables are REVOKEd, any write attempt inside the
--   transaction fails with `permission denied for table ...`.
-- =============================================================================

-- Create the role idempotently (NOLOGIN — can only be used via SET ROLE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_insights_ro') THEN
        CREATE ROLE ai_insights_ro NOLOGIN;
    END IF;
END $$;

-- NOTE: ai_insights_ro is a NOLOGIN role; only used as a permission set
-- via SET LOCAL ROLE. GRANT CONNECT ON DATABASE is intentionally omitted
-- because a NOLOGIN role cannot initiate connections.

-- USAGE on the public schema (so the role can resolve object references)
GRANT USAGE ON SCHEMA public TO ai_insights_ro;

-- SELECT on the curated views (the ONLY path the LLM has into the data)
GRANT SELECT ON
    ai_insights_safe_orders,
    ai_insights_safe_products,
    ai_insights_safe_users,
    ai_insights_safe_commissions,
    ai_insights_safe_reviews
TO ai_insights_ro;

-- Defense in depth: explicit REVOKE on the underlying tables.
-- Even if a future view is created over a sensitive table and the role
-- is mistakenly granted SELECT on the view, the role can never see the
-- raw data directly. The role has no privileges on these tables.
REVOKE ALL ON
    orders,
    products,
    users,
    commissions,
    product_reviews,
    product_questions,
    user_balances
FROM ai_insights_ro;

-- =============================================================================
-- Grant membership so the app pool user can SET LOCAL ROLE to ai_insights_ro
-- This is idempotent — re-running the migration is safe. Works when the
-- migration runs as the app pool user (typical for psql -U app_user in prod).
-- =============================================================================
DO $$
BEGIN
    EXECUTE format('GRANT ai_insights_ro TO %I', current_user);
END $$;

-- =============================================================================
-- Log de migración exitosa
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 17-ai-insights-role.sql executed successfully';
END $$;
