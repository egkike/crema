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
  default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe('refundRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('mapRow', () => {
    it('should return null for null input', async () => {
      const { refundRepository } = await import('../../repositories/refund.repository');
      const result = refundRepository.mapRow(null);
      expect(result).toBeNull();
    });

    it('should map row with numeric conversions', async () => {
      const { refundRepository } = await import('../../repositories/refund.repository');
      
      const row = {
        id: 'refund-1',
        order_id: 'order-1',
        amount: '10000',
        currency: 'ARS',
      };

      const result = refundRepository.mapRow(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(10000);
    });
  });

  describe('create', () => {
    it('should create refund and update platform earnings and order', async () => {
      const { refundRepository } = await import('../../repositories/refund.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'refund-1', order_id: 'order-1' }] });

      const result = await refundRepository.create({
        orderId: 'order-1',
        sellerId: 'seller-1',
        buyerId: 'buyer-1',
        amount: 10000,
        currency: 'ARS',
        reason: 'Customer request',
      });

      expect(result).not.toBeNull();
      // Should have called queries
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle client for transactions', async () => {
      const { refundRepository } = await import('../../repositories/refund.repository');
      const mockClientQuery = vi.fn().mockResolvedValue({ rows: [{ id: 'refund-1' }] });
      const mockClient = { query: mockClientQuery };

      await refundRepository.create({
        orderId: 'order-1',
        sellerId: null,
        buyerId: 'buyer-1',
        amount: 5000,
        currency: 'ARS',
        reason: 'Test',
      }, mockClient as any);

      // Client query should be called when client is provided
      expect(mockClientQuery).toHaveBeenCalled();
    });
  });
});
