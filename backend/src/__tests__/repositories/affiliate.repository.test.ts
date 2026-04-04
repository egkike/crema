import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
let mockQuery = createMockQuery();

vi.mock('../../db/postgres', () => ({
  default: { query: (...args: any[]) => mockQuery(...args) },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' } },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('affiliateRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('addToPortfolio', () => {
    it('should add affiliate to product portfolio', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await affiliateRepository.addToPortfolio('affiliate-1', 'product-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(affiliateRepository.addToPortfolio('aff-1', 'prod-1'))
        .rejects.toThrow('DB error');
    });
  });

  describe('removeFromPortfolio', () => {
    it('should remove affiliate from product portfolio', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await affiliateRepository.removeFromPortfolio('affiliate-1', 'product-1');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await affiliateRepository.removeFromPortfolio('aff-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  describe('isAffiliated', () => {
    it('should return true when affiliation exists', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockResolvedValue({ rows: [{ 1: 1 }] });

      const result = await affiliateRepository.isAffiliated('affiliate-1', 'product-1');

      expect(result).toBe(true);
    });

    it('should return false when no affiliation', async () => {
      const { affiliateRepository } = await import('../../repositories/affiliate.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await affiliateRepository.isAffiliated('aff-1', 'prod-1');

      expect(result).toBe(false);
    });
  });
});
