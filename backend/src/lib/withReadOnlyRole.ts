/**
 * withReadOnlyRole — defense-in-depth execution context for LLM-generated SQL.
 *
 * Wraps a DB callback so that the LLM cannot read or write data outside the
 * curated `ai_insights_safe_*` views, and cannot see rows that belong to
 * other creators. Three guarantees:
 *
 *   1. READ-ONLY ROLE — the transaction runs as `ai_insights_ro`, a
 *      NOLOGIN PostgreSQL role with SELECT only on the safe views and
 *      REVOKEd on every underlying table. Any write attempt fails with
 *      `permission denied`.
 *
 *   2. CREATOR-LEVEL ISOLATION — `SET LOCAL app.current_creator_id` is
 *      set inside the transaction. RLS policies on the underlying
 *      tables (18-ai-insights-rls.sql) use
 *      `current_setting('app.current_creator_id', true)::uuid` to filter
 *      rows to the requesting creator.
 *
 *   3. AUDIT TRAIL — every execution (success or failure) is recorded in
 *      `ai_sql_audit` with the SQL text, a SHA-256 hash, the creator,
 *      the result count, success status, and duration. Audit writes
 *      use a fresh pool connection (the readonly role has no INSERT
 *      on the audit table) and are best-effort: an audit failure is
 *      logged but never propagated to the caller.
 *
 * MUST USE THE PASSED CLIENT
 *   The callback receives a `pg.PoolClient` from the pool. Callers must
 *   use this client for all queries inside the transaction. A direct
 *   `pool.query()` would run as the application superuser-like role and
 *   bypass BOTH the read-only role AND the RLS setting.
 *
 * ERROR HANDLING
 *   On any non-`AppError` rejection, the raw error is logged with the
 *   operation label and a generic `AppError('Error al ejecutar la
 *   consulta', 500)` is thrown to the client. `AppError` is re-thrown
 *   unchanged so 4xx pass-through still works for callers that
 *   intentionally raise (e.g. Zod validation upstream).
 *
 * See docs/project/ai-features/sdd/fix-agents-service-gga-findings/design.md §3.1.
 */
import { createHash } from 'crypto';
import type { PoolClient } from 'pg';

import pool from '../db/postgres';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export interface WithReadOnlyRoleOptions {
  /** Operation label for log correlation (e.g. 'insightsService.query'). */
  op: string;
  /** The SQL that will be executed. Stored verbatim in the audit log. */
  sqlText: string;
}

export interface WithReadOnlyRoleAudit {
  /** Whether the readonly transaction COMMITted (false = ROLLBACK). */
  success: boolean;
  /** Error message on failure; null on success. */
  errorMessage: string | null;
  /** Number of rows returned by the callback. 0 on error. */
  resultCount: number;
  /** Wall-clock duration from BEGIN to COMMIT/ROLLBACK. */
  durationMs: number;
}

export interface WithReadOnlyRoleResult<T> {
  /** The value returned by the callback. */
  result: T;
  /** Audit metadata for the execution. */
  audit: WithReadOnlyRoleAudit;
}

/**
 * Executes `fn` inside a transaction with the readonly role and creator
 * isolation, then writes an audit row. See module-level documentation
 * for the full contract.
 */
export async function withReadOnlyRole<T>(
  userId: string,
  options: WithReadOnlyRoleOptions,
  fn: (client: PoolClient) => Promise<T>,
): Promise<WithReadOnlyRoleResult<T>> {
  const start = Date.now();
  const client = await pool.connect();
  let result: T | undefined;
  let success = false;
  let rawError: Error | null = null;

  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE ai_insights_ro');
    await client.query('SET LOCAL app.current_creator_id = $1', [userId]);

    result = await fn(client);
    success = true;

    await client.query('COMMIT');
  } catch (err) {
    rawError = err instanceof Error ? err : new Error(String(err));
    try {
      await client.query('ROLLBACK');
    } catch {
      // ROLLBACK can fail if the connection is already in an error state.
      // The original error is more important — we just make sure to
      // release the client in `finally`.
    }
  } finally {
    client.release();
  }

  const durationMs = Date.now() - start;
  const resultCount = success && result !== undefined ? countRows(result) : 0;
  const errorMessage = rawError ? rawError.message : null;

  // Audit row is best-effort: a failure here MUST NOT propagate to the
  // caller (the user already got their result or error). We use a fresh
  // pool connection because the readonly role has no INSERT on the
  // audit table (see 17-ai-insights-role.sql).
  await writeAuditRow({
    creatorId: userId,
    sqlText: options.sqlText,
    success,
    resultCount,
    errorMessage,
    durationMs,
  });

  if (rawError) {
    if (rawError instanceof AppError) {
      // Operational 4xx from the inner callback — pass through so
      // upstream validation / rate-limit / credit errors keep their
      // specific status code and message.
      throw rawError;
    }
    logger.error(
      { err: rawError.message, op: options.op, userId, sql: options.sqlText },
      'withReadOnlyRole: query failed — sanitized for client',
    );
    throw new AppError('Error al ejecutar la consulta', 500);
  }

  return {
    result: result as T,
    audit: {
      success,
      errorMessage,
      resultCount,
      durationMs,
    },
  };
}

/**
 * Best-effort extraction of "how many rows" from a callback result.
 *
 * Callbacks are expected to return either an array of rows (LLM-SQL
 * path: `SELECT * FROM ...`) or a `pg.QueryResult`-shaped object with
 * a `rows` property (anything that uses `client.query(...)`).
 *
 * Returns 0 for anything else — the audit row only needs a number,
 * and we don't want to coerce arbitrary shapes.
 */
function countRows(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows.length;
  }
  return 0;
}

interface AuditRowInput {
  creatorId: string;
  sqlText: string;
  success: boolean;
  resultCount: number;
  errorMessage: string | null;
  durationMs: number;
}

async function writeAuditRow(entry: AuditRowInput): Promise<void> {
  const sqlHash = createHash('sha256').update(entry.sqlText).digest('hex');
  try {
    await pool.query(
      `INSERT INTO ai_sql_audit
        (creator_id, sql_text, sql_hash, result_count, success, error_message, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.creatorId,
        entry.sqlText,
        sqlHash,
        entry.resultCount,
        entry.success,
        entry.errorMessage,
        entry.durationMs,
      ],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { err: message, creatorId: entry.creatorId },
      'withReadOnlyRole: failed to write audit row (non-fatal)',
    );
  }
}
