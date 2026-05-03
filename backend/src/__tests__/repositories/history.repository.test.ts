import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
let mockQuery = createMockQuery();

vi.mock('../../db/postgres', () => ({
  default: { query: (...args: any[]) => mockQuery(...args) },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' }, allowedSchemas: ['public', 'crema'] },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('historyRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('mapRow', () => {
    it('should map row with numeric conversions', async () => {
      const { historyRepository } = await import('../../repositories/history.repository');
      
      const row = { id: 'hist-1', user_id: 'user-1', amount: '10000', type: 'sale_creator' };
      const result = historyRepository.mapRow(row);

      expect(result.amount).toBe(10000);
    });
  });

  describe('createRecordWithClient', () => {
    it('should create history record with client', async () => {
      const { historyRepository } = await import('../../repositories/history.repository');
      const mockClient = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'hist-1' }] }) };

      const result = await historyRepository.createRecordWithClient(mockClient as any, {
        userId: 'user-1',
        order_id: 'order-1',
        amount: 10000,
        currency: 'ARS',
        type: 'sale_creator',
        description: 'Test sale',
      });

      expect(result).not.toBeNull();
      expect(mockClient.query).toHaveBeenCalled();
    });
  });

  describe('getByUserIdWithCount', () => {
    it('should return history records with count for user', async () => {
      const { historyRepository } = await import('../../repositories/history.repository');
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'hist-1' }, { id: 'hist-2' }] })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const result = await historyRepository.getByUserIdWithCount('user-1');

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('should return empty when no records', async () => {
      const { historyRepository } = await import('../../repositories/history.repository');
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await historyRepository.getByUserIdWithCount('user-1');

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
