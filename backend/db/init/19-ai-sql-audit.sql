-- =============================================================================
-- 19-ai-sql-audit.sql
--
-- SDD: fix-agents-service-gga-findings (Phase 3 — Architectural)
-- Refs: issue #47, PR #3 of the chained fix.
--
-- PURPOSE
--   Audit table for LLM-generated SQL executions. Every query run via
--   `withReadOnlyRole` is recorded here with the SQL text, a SHA-256
--   hash for dedup/analysis, the requesting creator, the result row
--   count, success status, and duration.
--
--   The application writes audit rows using the application's pool
--   (which runs as the database owner), AFTER the readonly transaction
--   commits/rolls back. This is intentional: the `ai_insights_ro` role
--   has no INSERT on this table (see 17-ai-insights-role.sql).
--
-- RETENTION
--   90-day rolling retention is enforced by the BullMQ `audit-cleanup`
--   job (see `backend/src/queues/scheduler.ts` and `main.worker.ts`).
--   Pattern: `0 0 * * *` (daily at midnight UTC).
--
-- COLUMNS
--   * id           — BIGSERIAL surrogate key (cheaper than UUID for
--                    high-volume audit inserts).
--   * creator_id   — UUID of the requesting user. NOT a FK because
--                    creator rows can be deleted while their audit
--                    history must remain (audit outlives the user).
--   * sql_text     — the full executed SQL (after safeSql transformation).
--   * sql_hash     — SHA-256 of sql_text, hex-encoded (64 chars). Useful
--                    for "how often is this query run" analytics.
--   * result_count — number of rows returned (0 on error / write attempts).
--   * success      — TRUE if the readonly transaction COMMITted, FALSE on
--                    ROLLBACK (including permission-denied write attempts).
--   * error_message— error message on failure (sanitized; not the raw
--                    constraint name or stack trace).
--   * duration_ms  — wall-clock milliseconds from BEGIN to COMMIT/ROLLBACK.
--   * created_at   — INSERT timestamp (defaulted).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_sql_audit (
    id BIGSERIAL PRIMARY KEY,
    creator_id UUID NOT NULL,
    sql_text TEXT NOT NULL,
    sql_hash CHAR(64) NOT NULL,
    result_count INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Primary access pattern: "show me the audit log for creator X, newest first"
CREATE INDEX IF NOT EXISTS idx_ai_sql_audit_creator
    ON ai_sql_audit (creator_id, created_at DESC);

-- Secondary access pattern: "show me all failures in the last 24h" (for
-- security dashboards / anomaly detection). Partial index keeps the
-- index small since the failure rate is expected to be low.
CREATE INDEX IF NOT EXISTS idx_ai_sql_audit_failures
    ON ai_sql_audit (created_at DESC)
    WHERE success = FALSE;

-- Retention helper: the audit-cleanup job filters on created_at alone
-- and benefits from a plain index on that column.
CREATE INDEX IF NOT EXISTS idx_ai_sql_audit_created_at
    ON ai_sql_audit (created_at);

COMMENT ON TABLE ai_sql_audit IS
    'Audit log of LLM-generated SQL executions. 90-day rolling retention via BullMQ audit-cleanup job. See docs/project/ai-features/sdd/fix-agents-service-gga-findings/design.md §3.3.';
COMMENT ON COLUMN ai_sql_audit.sql_hash IS
    'SHA-256 hex of sql_text — enables dedup / frequency analysis without indexing the full SQL.';
COMMENT ON COLUMN ai_sql_audit.result_count IS
    'Rows returned on success; 0 on error (including permission-denied write attempts under the readonly role).';

-- The ai_insights_ro role has no business reading or writing audit data.
-- This REVOKE was moved from 17-ai-insights-role.sql (where the table did
-- not exist yet) to here, after the CREATE TABLE.
REVOKE ALL ON ai_sql_audit FROM ai_insights_ro;

-- =============================================================================
-- Log de migración exitosa
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 19-ai-sql-audit.sql executed successfully';
END $$;
