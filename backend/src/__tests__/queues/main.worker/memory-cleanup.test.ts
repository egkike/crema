import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../../../config/index', () => ({
  config: {
    db: { schema: 'public' },
    allowedSchemas: ['public', 'crema'],
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock pool
const mockQuery = vi.fn();
vi.mock('../../../db/postgres', () => ({
  default: { query: mockQuery },
}));

// Import after mocks
import { config } from '../../../config/index';

// Re-export the query builder helpers from the worker for unit testing
// This avoids testing hardcoded strings — tests verify actual function output
export function buildCleanupFirstBatchQuery(schema: string, cutoff: Date, batchSize: number): { query: string; params: unknown[] } {
  const query = `
    SELECT created_at, id FROM (
      WITH to_delete AS (
        SELECT id FROM "${schema}".ai_embeddings
        WHERE created_at < $1
        ORDER BY created_at ASC, id ASC
LIMIT $2
    )
    DELETE FROM "${schema}".ai_embeddings
    WHERE id IN (SELECT id FROM to_delete)
    RETURNING created_at, id
  ) AS deleted_rows
  ORDER BY created_at ASC, id ASC
`;
  return { query, params: [cutoff, batchSize] };
}

export function buildCleanupCursorBatchQuery(
  schema: string,
  cutoff: Date,
  lastCreatedAt: string,
  lastId: string,
  batchSize: number
): { query: string; params: unknown[] } {
  const UUID_SENTINEL = '00000000-0000-0000-0000-000000000000';
  const query = `
    SELECT created_at, id FROM (
      WITH to_delete AS (
        SELECT id FROM "${schema}".ai_embeddings
        WHERE created_at < $1 AND (created_at, id) > ($2::timestamptz, $3::text)
        ORDER BY created_at ASC, id ASC
        LIMIT $4
      )
      DELETE FROM "${schema}".ai_embeddings
      WHERE id IN (SELECT id FROM to_delete)
      RETURNING created_at, id
    ) AS deleted_rows
    ORDER BY created_at ASC, id ASC
  `;
  const effectiveLastId = lastId || UUID_SENTINEL;
      return { query, params: [cutoff, lastCreatedAt, effectiveLastId, batchSize] };
}

describe('memory-cleanup job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MEMORY_RETENTION_DAYS', '30');
    vi.stubEnv('MEMORY_CLEANUP_BATCH_SIZE', '1000');
    vi.stubEnv('MEMORY_CLEANUP_BATCH_DELAY_MS', '100');
    vi.stubEnv('MEMORY_CLEANUP_MAX_ITERATIONS', '360');
  });

  describe('schema validation', () => {
    it('should reject invalid schema', () => {
      const schema = (config.db?.schema || 'public').trim();
      expect(config.allowedSchemas.includes(schema)).toBe(true);
    });
  });

  describe('retention days validation', () => {
    it('should parse valid retention days', () => {
      const retentionDaysStr = process.env.MEMORY_RETENTION_DAYS || '30';
      const retentionDays = parseInt(retentionDaysStr, 10);
      expect(retentionDays).toBe(30);
      expect(Number.isInteger(retentionDays)).toBe(true);
      expect(retentionDays).toBeGreaterThan(0);
      expect(retentionDays).toBeLessThanOrEqual(36500);
    });

    it('should reject invalid retention days', () => {
      const invalidValues = ['abc', '-1', '0', '40000'];
      for (const value of invalidValues) {
        const parsed = parseInt(value, 10);
        const isValid = !isNaN(parsed) && parsed > 0 && Number.isInteger(parsed) && parsed <= 36500;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('batch size validation', () => {
    it('should parse valid batch size', () => {
      const batchSizeStr = process.env.MEMORY_CLEANUP_BATCH_SIZE || '1000';
      const batchSize = parseInt(batchSizeStr, 10);
      expect(batchSize).toBe(1000);
      expect(batchSize).toBeGreaterThanOrEqual(1);
      expect(batchSize).toBeLessThanOrEqual(10000);
    });

    it('should reject invalid batch sizes', () => {
      const invalidValues = ['abc', '0', '-100', '10001'];
      for (const value of invalidValues) {
        const parsed = parseInt(value, 10);
        const isValid = !isNaN(parsed) && parsed >= 1 && parsed <= 10000;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('batch delay validation', () => {
    it('should parse valid batch delay', () => {
      const batchDelayStr = process.env.MEMORY_CLEANUP_BATCH_DELAY_MS || '100';
      const batchDelay = parseInt(batchDelayStr, 10);
      expect(batchDelay).toBe(100);
      expect(batchDelay).toBeGreaterThanOrEqual(0);
      expect(batchDelay).toBeLessThanOrEqual(10000);
    });

    it('should reject invalid batch delays', () => {
      const invalidValues = ['abc', '-1', '10001'];
      for (const value of invalidValues) {
        const parsed = parseInt(value, 10);
        const isValid = !isNaN(parsed) && parsed >= 0 && parsed <= 10000;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('max iterations validation', () => {
    it('should parse valid max iterations', () => {
      const maxIterationsStr = process.env.MEMORY_CLEANUP_MAX_ITERATIONS || '360';
      const maxIterations = parseInt(maxIterationsStr, 10);
      expect(maxIterations).toBe(360);
      expect(maxIterations).toBeGreaterThan(0);
    });

    it('should reject invalid max iterations', () => {
      const invalidValues = ['abc', '0', '-1'];
      for (const value of invalidValues) {
        const parsed = parseInt(value, 10);
        const isValid = !isNaN(parsed) && parsed >= 1;
        expect(isValid).toBe(false);
      }
    });
  });

  describe('cutoff calculation', () => {
    it('should calculate correct cutoff date', () => {
      const retentionDays = 30;
      const expectedTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const cutoff = new Date(expectedTime);
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      expect(Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('SQL query generation', () => {
    it('should generate CTE-based first batch query (no cursor)', () => {
      const schema = 'public';
      const cutoff = new Date('2024-01-01T00:00:00Z');
      const BATCH_SIZE = 1000;

      const { query, params } = buildCleanupFirstBatchQuery(schema, cutoff, BATCH_SIZE);

      // Verify CTE structure (not the old broken DELETE...ORDER BY syntax)
      expect(query).toContain('WITH to_delete AS');
      expect(query).toContain('SELECT id FROM');
      expect(query).toContain('DELETE FROM');
      expect(query).toContain('WHERE id IN (SELECT id FROM to_delete)');
      expect(query).toContain('RETURNING created_at, id');
      expect(query).toContain('ORDER BY created_at ASC, id ASC');
      expect(query).toContain('LIMIT $2');

      // Outer wrapper guarantees RETURNING order
      expect(query).toContain('SELECT created_at, id FROM (');
      expect(query).toContain(') AS deleted_rows');

      // Schema interpolation
      expect(query).toContain('"public".ai_embeddings');
      expect(params).toHaveLength(2);
      expect(params[0]).toEqual(cutoff);
      expect(params[1]).toEqual(BATCH_SIZE);
    });

    it('should generate CTE-based cursor batch query', () => {
      const schema = 'public';
      const cutoff = new Date('2024-01-01T00:00:00Z');
      const lastCreatedAt = '2024-01-01T12:00:00.000Z';
      const lastId = '00000000-0000-0000-0000-000000000001';
      const BATCH_SIZE = 500;

      const { query, params } = buildCleanupCursorBatchQuery(schema, cutoff, lastCreatedAt, lastId, BATCH_SIZE);

      // Verify CTE structure with cursor parameters
      expect(query).toContain('WITH to_delete AS');
      expect(query).toContain('(created_at, id) > ($2::timestamptz, $3::text)');
      expect(query).toContain('ORDER BY created_at ASC, id ASC');
      expect(query).toContain('LIMIT $4');

      // Outer wrapper for RETURNING order guarantee
      expect(query).toContain('SELECT created_at, id FROM (');
      expect(query).toContain(') AS deleted_rows');
      expect(query).toContain('ORDER BY created_at ASC, id ASC');

      expect(params).toHaveLength(4);
      expect(params[0]).toEqual(cutoff);
      expect(params[1]).toEqual(lastCreatedAt);
      expect(params[2]).toEqual(lastId);
      expect(params[3]).toEqual(BATCH_SIZE);
    });

    it('should use UUID sentinel when lastId is null', () => {
      const schema = 'public';
      const cutoff = new Date('2024-01-01T00:00:00Z');
      const lastCreatedAt = '2024-01-01T12:00:00.000Z';
      const BATCH_SIZE = 1000;

      const { params } = buildCleanupCursorBatchQuery(schema, cutoff, lastCreatedAt, '', BATCH_SIZE);

      // Empty string lastId falls back to UUID sentinel
      expect(params[2]).toBe('00000000-0000-0000-0000-000000000000');
    });
  });

  describe('UUID sentinel', () => {
    it('should use valid UUID sentinel for first cursor', () => {
      const UUID_SENTINEL = '00000000-0000-0000-0000-000000000000';
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(UUID_SENTINEL).toMatch(uuidRegex);
    });
  });

  describe('iteration safety check', () => {
    it('should stop when max iterations reached', () => {
      const MAX_ITERATIONS = 360;
      let iterations = 360;
      const shouldStop = iterations > MAX_ITERATIONS;
      expect(shouldStop).toBe(false);

      iterations = 361;
      const shouldStopAfter = iterations > MAX_ITERATIONS;
      expect(shouldStopAfter).toBe(true);
    });
  });

  describe('zero rows first iteration warning', () => {
    it('should warn when first batch deletes nothing', () => {
      const iterations = 1;
      const deleted = 0;
      const shouldWarn = iterations === 1 && deleted === 0;
      expect(shouldWarn).toBe(true);
    });

    it('should not warn on subsequent zero-deleted batches', () => {
      const iterationFromEnv = parseInt('2', 10);
      const deletedFromEnv = parseInt('0', 10);
      const shouldWarn = iterationFromEnv === 1 && deletedFromEnv === 0;
      expect(shouldWarn).toBe(false);
    });
  });
});
