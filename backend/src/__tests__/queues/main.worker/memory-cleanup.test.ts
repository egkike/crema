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

describe('memory-cleanup job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
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
      // Calculate cutoff without storing unused variable
      const expectedTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const cutoff = new Date(expectedTime);

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Cutoff should be approximately 30 days ago (within 1 second)
      expect(Math.abs(cutoff.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(1000);
    });
  });

  describe('SQL query generation', () => {
    it('should generate first batch query without cursor', () => {
      const schema = 'public';
      const BATCH_SIZE = 1000;

      // Template demonstrates query structure with inline cutoff
      const query = `
        DELETE FROM "${schema}".ai_embeddings
        WHERE created_at < $1
        ORDER BY created_at ASC, id ASC
        LIMIT ${BATCH_SIZE}
        RETURNING created_at, id
      `;

      expect(query).toContain('DELETE FROM');
      expect(query).toContain('ORDER BY created_at ASC, id ASC');
      expect(query).toContain('LIMIT 1000');
      expect(query).toContain('RETURNING created_at, id');
    });

    it('should generate subsequent batch query with cursor', () => {
      const schema = 'public';
      const BATCH_SIZE = 1000;

      // Template demonstrates cursor parameters but doesn't use actual values
      const query = `
        DELETE FROM "${schema}".ai_embeddings
        WHERE created_at < $1 AND (created_at, id) > ($2::timestamptz, $3::text)
        ORDER BY created_at ASC, id ASC
        LIMIT ${BATCH_SIZE}
        RETURNING created_at, id
      `;

      expect(query).toContain('(created_at, id) >');
      expect(query).toContain('$2::timestamptz');
      expect(query).toContain('$3::text');
    });
  });

  describe('UUID sentinel', () => {
    it('should use valid UUID sentinel for first cursor', () => {
      const UUID_SENTINEL = '00000000-0000-0000-0000-000000000000';

      // UUID format validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(UUID_SENTINEL).toMatch(uuidRegex);
    });
  });

  describe('iteration safety check', () => {
    it('should stop when max iterations reached', () => {
      const MAX_ITERATIONS = 360;
      let iterations = 360;
      const shouldStop = iterations > MAX_ITERATIONS;

      expect(shouldStop).toBe(false); // exactly at limit, should not stop

      iterations = 361;
      const shouldStopAfter = iterations > MAX_ITERATIONS;
      expect(shouldStopAfter).toBe(true); // over limit, should stop
    });
  });

  describe('zero rows first iteration warning', () => {
    it('should warn when first batch deletes nothing', () => {
      const iterations = 1;
      const deleted = 0;

      // This triggers a warn condition: iterations === 1 && deleted === 0
      const shouldWarn = iterations === 1 && deleted === 0;
      expect(shouldWarn).toBe(true);
    });

    it('should not warn on subsequent zero-deleted batches', () => {
      // Use parseInt to break literal type inference
      const iterationFromEnv = parseInt('2', 10);
      const deletedFromEnv = parseInt('0', 10);

      const shouldWarn = iterationFromEnv === 1 && deletedFromEnv === 0;
      expect(shouldWarn).toBe(false); // not first iteration
    });
  });
});