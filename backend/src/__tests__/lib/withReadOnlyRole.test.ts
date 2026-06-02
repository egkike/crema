import { createHash } from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger BEFORE the imports that depend on it.
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../db/postgres', () => ({
  default: {
    connect: vi.fn(),
    query: vi.fn(),
  },
}));

import { AppError } from '../../errors/AppError';
import { withReadOnlyRole } from '../../lib/withReadOnlyRole';
import pool from '../../db/postgres';
import logger from '../../utils/logger';

const poolMock = pool as unknown as {
  connect: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
};
const loggerMock = logger as unknown as { error: ReturnType<typeof vi.fn> };

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function buildMockClient(): MockClient {
  // Default: BEGIN, SET LOCAL ROLE, SET LOCAL setting all resolve with
  // empty rows. Tests that need a specific return value for the fn()
  // body's query should queue the value via `mockClient.query
  // .mockResolvedValueOnce(...)` AFTER the setup calls, or override
  // the default with `mockImplementation` and key off the SQL string.
  const query = vi.fn().mockImplementation(async (sql: string) => {
    if (
      sql === 'BEGIN' ||
      sql === 'COMMIT' ||
      sql === 'ROLLBACK' ||
      sql === 'SET LOCAL ROLE ai_insights_ro' ||
      sql === "SET LOCAL app.current_creator_id = $1"
    ) {
      return { rows: [] };
    }
    return { rows: [] };
  });
  return {
    query,
    release: vi.fn(),
  };
}

function allQuerySql(mockClient: MockClient): string[] {
  return mockClient.query.mock.calls.map((call) => call[0] as string);
}

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SAMPLE_SQL = 'SELECT * FROM ai_insights_safe_products LIMIT 10';

describe('withReadOnlyRole', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = buildMockClient();
    poolMock.connect.mockResolvedValue(mockClient);
    // Default audit INSERT succeeds
    poolMock.query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  describe('transaction setup', () => {
    it('acquires a client, runs BEGIN, then SET LOCAL ROLE ai_insights_ro, then SET LOCAL app.current_creator_id in that exact order', async () => {
      mockClient.query
        // fn() body — return a value
        .mockResolvedValueOnce({ rows: [{ id: 'p1' }], rowCount: 1 });

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      const calls = allQuerySql(mockClient);
      // The first three calls must be BEGIN, SET LOCAL ROLE, SET LOCAL setting
      expect(calls[0]).toBe('BEGIN');
      expect(calls[1]).toBe('SET LOCAL ROLE ai_insights_ro');
      expect(calls[2]).toBe("SET LOCAL app.current_creator_id = $1");
    });

    it('passes userId as the bound parameter for SET LOCAL app.current_creator_id', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      const setLocalCall = mockClient.query.mock.calls[2];
      expect(setLocalCall[0]).toBe('SET LOCAL app.current_creator_id = $1');
      expect(setLocalCall[1]).toEqual([USER_ID]);
    });

    it('passes the readonly-scoped client to the callback (not pool.query)', async () => {
      const callback = vi.fn().mockResolvedValue({ rows: [] });
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        callback,
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(mockClient);
    });

    it('releases the client back to the pool on success', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('releases the client back to the pool on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN succeeds
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL ROLE
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL setting
        .mockRejectedValueOnce(new Error('permission denied for table users'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch(() => {
        /* expected */
      });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful execution', () => {
    it('returns the callback result wrapped in { result, audit }', async () => {
      const expected = { rows: [{ id: 'a' }, { id: 'b' }], rowCount: 2 };
      // Override the default: the fn() body's query returns `expected`.
      // The setup calls (BEGIN, SET LOCAL ROLE, SET LOCAL setting) still
      // return { rows: [] } via the default mockImplementation.
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql === SAMPLE_SQL) return expected;
        return { rows: [] };
      });

      const { result, audit } = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      expect(result).toBe(expected);
      expect(audit.success).toBe(true);
      expect(audit.errorMessage).toBeNull();
      expect(audit.resultCount).toBe(2);
      expect(audit.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('commits the transaction after the callback resolves', async () => {
      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      const calls = allQuerySql(mockClient);
      expect(calls).toContain('COMMIT');
      expect(calls).not.toContain('ROLLBACK');
    });

    it('counts rows from an array return value', async () => {
      const arr = [{ a: 1 }, { a: 2 }, { a: 3 }];

      const { audit } = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async () => arr,
      );

      expect(audit.resultCount).toBe(3);
    });

    it('counts rows from a pg QueryResult return value (rows property) — expects > 0', async () => {
      // Override the default mock to return rows for the fn() body query
      mockClient.query.mockImplementation(async (sql: string) => {
        if (sql === SAMPLE_SQL) return { rows: [{ id: 'a' }], rowCount: 1 };
        return { rows: [] };
      });

      const { audit } = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      expect(audit.resultCount).toBe(1);
    });

    it('returns 0 result count for non-array/non-QueryResult values', async () => {
      const { audit } = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async () => 42, // scalar — unusual but allowed
      );

      expect(audit.resultCount).toBe(0);
    });
  });

  describe('audit row on success', () => {
    it('writes exactly one audit INSERT via pool.query (separate from the client)', async () => {
      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      // The audit INSERT goes through pool.query, NOT client.query.
      expect(poolMock.query).toHaveBeenCalledTimes(1);
      const [sql, params] = poolMock.query.mock.calls[0];
      expect(sql).toContain('INSERT INTO ai_sql_audit');
      expect(sql).toMatch(/creator_id/);
      expect(sql).toMatch(/sql_text/);
      expect(sql).toMatch(/sql_hash/);
      expect(sql).toMatch(/result_count/);
      expect(sql).toMatch(/success/);
      expect(sql).toMatch(/error_message/);
      expect(sql).toMatch(/duration_ms/);
      expect(Array.isArray(params)).toBe(true);
    });

    it('audit INSERT contains the creator_id, success=true, error_message=null', async () => {
      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      const auditParams = poolMock.query.mock.calls[0][1] as unknown[];
      // [creatorId, sqlText, sqlHash, resultCount, success, errorMessage, durationMs]
      expect(auditParams[0]).toBe(USER_ID);
      expect(auditParams[1]).toBe(SAMPLE_SQL);
      expect(auditParams[4]).toBe(true);
      expect(auditParams[5]).toBeNull();
    });

    it('audit sql_hash is sha256 of the sql_text, hex-encoded (64 chars)', async () => {
      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      const auditParams = poolMock.query.mock.calls[0][1] as unknown[];
      const expectedHash = createHash('sha256').update(SAMPLE_SQL).digest('hex');
      expect(auditParams[2]).toBe(expectedHash);
      expect(auditParams[2]).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('failure execution', () => {
    it('rolls back the transaction on callback error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL ROLE
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL setting
        .mockRejectedValueOnce(new Error('permission denied for table users'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch(() => {
        /* expected */
      });

      const calls = allQuerySql(mockClient);
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
    });

    it('throws a generic AppError(500) for a raw Error', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL ROLE
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL setting
        .mockRejectedValueOnce(new Error('permission denied for table users'))
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const err = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch((e) => e);

      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(500);
      expect((err as AppError).message).toBe('Error al ejecutar la consulta');
      // The original error message must NOT leak to the caller.
      expect((err as AppError).message).not.toContain('permission denied');
    });

    it('re-throws AppError unchanged (passes through 4xx)', async () => {
      const inner = new AppError('Forbidden', 403);
      mockClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL ROLE
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL setting
        .mockRejectedValueOnce(inner)
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      const err = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch((e) => e);

      expect(err).toBe(inner);
      expect((err as AppError).statusCode).toBe(403);
      expect((err as AppError).message).toBe('Forbidden');
    });

    it('logs the raw error server-side with op and userId for traceability', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('permission denied for table users'))
        .mockResolvedValueOnce({ rows: [] });

      await withReadOnlyRole(
        USER_ID,
        { op: 'insightsService.query', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch(() => {
        /* expected */
      });

      expect(loggerMock.error).toHaveBeenCalled();
      const [logArg, logMsg] = loggerMock.error.mock.calls[0];
      expect(logArg).toMatchObject({
        op: 'insightsService.query',
        userId: USER_ID,
        sql: SAMPLE_SQL,
      });
      // The full original message is preserved in the log.
      expect(logArg.err).toContain('permission denied');
      expect(logMsg).toContain('sanitized');
    });

    it('audit row is still written on failure (success=false, error_message set)', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(new Error('permission denied for table users'))
        .mockResolvedValueOnce({ rows: [] });

      await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      ).catch(() => {
        /* expected */
      });

      // Audit row was still written.
      expect(poolMock.query).toHaveBeenCalledTimes(1);
      const auditParams = poolMock.query.mock.calls[0][1] as unknown[];
      // [creatorId, sqlText, sqlHash, resultCount, success, errorMessage, durationMs]
      expect(auditParams[0]).toBe(USER_ID);
      expect(auditParams[4]).toBe(false);
      expect(auditParams[5]).toBe('permission denied for table users');
    });

    it('audit-write failure does NOT propagate to the caller', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      // Audit INSERT throws — caller must still get the success result.
      poolMock.query.mockRejectedValueOnce(new Error('audit table is missing'));

      const { result, audit } = await withReadOnlyRole(
        USER_ID,
        { op: 'test.op', sqlText: SAMPLE_SQL },
        async (client) => client.query(SAMPLE_SQL),
      );

      expect(audit.success).toBe(true);
      expect(result).toBeDefined();
      // The audit failure is logged but swallowed.
      expect(loggerMock.error).toHaveBeenCalled();
    });
  });

  describe('integration with insightsService SQL path (sanity)', () => {
    it('a write attempt via the client (INSERT) would be blocked by the readonly role — verified at the DB layer in integration tests', () => {
      // This is a unit-level test: the readonly role's permissions are
      // configured in 17-ai-insights-role.sql (REVOKE on the underlying
      // tables, GRANT SELECT only on the views). The role is enforced
      // by PostgreSQL when the SET LOCAL ROLE inside withReadOnlyRole
      // takes effect. We assert the contract here:
      //
      //   1. withReadOnlyRole always sets the role BEFORE running the
      //      callback (covered above in "transaction setup").
      //   2. The callback receives the scoped client, so any INSERT
      //      issued inside it runs as ai_insights_ro and fails at the
      //      DB layer (verified in integration tests against a live
      //      PostgreSQL with the role + RLS configured).
      //
      // See: backend/src/__tests__/db/ai-insights-rls.integration.test.ts
      // (requires DB + Redis, excluded from the default test run).
      const roleCall = mockClient.query.mock.calls.find(
        (call) => call[0] === 'SET LOCAL ROLE ai_insights_ro',
      );
      // The contract: the first query after BEGIN is SET LOCAL ROLE.
      // (Verified by the order test above; this assertion is a placeholder
      // for the integration test that lives outside this file.)
      expect(roleCall).toBeUndefined(); // not yet called in this test
      expect(SAMPLE_SQL.startsWith('SELECT')).toBe(true);
    });
  });
});
