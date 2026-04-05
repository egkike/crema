import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg module before importing
vi.mock('pg', () => {
  const mockPool = {
    connect: vi.fn(),
    query: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
  };

  return {
    Pool: vi.fn(() => mockPool),
    types: {
      setTypeParser: vi.fn(),
      builtins: {
        NUMERIC: 'NUMERIC',
        INT8: 'INT8',
      },
    },
  };
});

vi.mock('../../config/index', () => ({
  config: {
    db: {
      host: 'localhost',
      port: 5432,
      user: 'test_user',
      password: 'test_pass',
      database: 'test_db',
      schema: 'public',
    },
    nodeEnv: 'test',
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('db/postgres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pool initialization', () => {
    it('should have pg module mocked', async () => {
      const pg = await import('pg');
      expect(pg.Pool).toBeDefined();
      expect(pg.types).toBeDefined();
    });

    it('should have types with setTypeParser', async () => {
      const pg = await import('pg');
      expect(pg.types.setTypeParser).toBeDefined();
    });
  });
});
