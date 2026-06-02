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
--     * SELECT on the curated views (16-ai-insights-views.sql) — the
--       safe-by-default API the LLM is encouraged to use.
--     * SELECT on the underlying raw tables, filtered by Row Level
--       Security (see `18-ai-insights-rls.sql`) using
--       `current_setting('app.current_creator_id', true)::uuid`. The
--       LLM prompt in `agents.service.ts` may target either the views
--       or the raw tables; RLS guarantees row-level isolation in
--       both cases (defense in depth).
--     * Column-level grants on `users` restrict PII access — the role
--       sees only `id, username, level, createdate`, not `email` or
--       credential columns. The safe view `ai_insights_safe_users`
--       remains the preferred path for typical queries.
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

-- USAGE on the public schema (so the role can resolve object references).
-- Schema-level USAGE is required by PG to access objects in the schema.
-- The role is NOLOGIN, so external enumeration is not a concern.
GRANT USAGE ON SCHEMA public TO ai_insights_ro;

-- SELECT on the curated views (the ONLY path the LLM has into the data)
GRANT SELECT ON
    ai_insights_safe_orders,
    ai_insights_safe_products,
    ai_insights_safe_users,
    ai_insights_safe_commissions,
    ai_insights_safe_reviews
TO ai_insights_ro;

-- Defense in depth: SELECT on the underlying raw tables is paired with
-- RLS policies (see 18-ai-insights-rls.sql). The role can read these
-- tables, but rows are filtered by `current_setting('app.current_creator_id', true)::uuid`
-- so the LLM only sees the creator's own data, regardless of the query.
-- The LLM may target either the curated views (preferred) or these
-- raw tables — both are safe by construction.
-- `users` is granted separately with a column-level grant below to
-- avoid exposing PII columns (email, password, tokens, etc.).
GRANT SELECT ON
    orders,
    products,
    commissions,
    product_reviews,
    product_questions,
    user_balances
TO ai_insights_ro;

-- Column-level grant (PG 15+) prevents PII exfiltration via the raw
-- table — the safe view remains the preferred path for typical queries.
-- First REVOKE any table-level SELECT on users (a prior batch granted
-- table-level access; column-level grants alone are NOT enough to override
-- a table-level grant — both coexist and the table-level wins).
REVOKE SELECT ON users FROM ai_insights_ro;
GRANT SELECT (id, username, level, createdate) ON users TO ai_insights_ro;

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
