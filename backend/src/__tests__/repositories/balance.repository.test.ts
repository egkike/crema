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

describe('balanceRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('addPendingBalance', () => {
    it('should add pending balance and return updated balance', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          total_earned: '10000', 
          available_balance: '0', 
          pending_balance: '10000', 
          currency: 'ARS',
          updated_at: new Date() 
        }] 
      });

      const result = await balanceRepository.addPendingBalance('user-1', 10000, 'ARS');

      expect(result).not.toBeNull();
      expect(result!.pending_balance).toBe(10000);
      expect(result!.total_earned).toBe(10000);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(balanceRepository.addPendingBalance('user-1', 10000, 'ARS'))
        .rejects.toThrow('DB error');
    });
  });

  describe('releaseBalance', () => {
    it('should release balance from pending to available', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          total_earned: '10000', 
          available_balance: '5000', 
          pending_balance: '5000', 
          currency: 'ARS',
          updated_at: new Date() 
        }] 
      });

      const result = await balanceRepository.releaseBalance('user-1', 5000, 'ARS');

      expect(result).not.toBeNull();
      expect(result!.available_balance).toBe(5000);
    });

    it('should throw when insufficient pending balance', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(balanceRepository.releaseBalance('user-1', 10000, 'ARS'))
        .rejects.toThrow('Saldo pendiente insuficiente');
    });
  });

  describe('subtractAvailableBalance', () => {
    it('should subtract from available balance', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          total_earned: '10000', 
          available_balance: '5000', 
          pending_balance: '5000', 
          currency: 'ARS',
          updated_at: new Date() 
        }] 
      });

      const result = await balanceRepository.subtractAvailableBalance('user-1', 3000, 'ARS');

      expect(result).not.toBeNull();
      expect(result!.available_balance).toBe(5000);
    });

    it('should throw when insufficient available balance', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(balanceRepository.subtractAvailableBalance('user-1', 10000, 'ARS'))
        .rejects.toThrow('Saldo disponible insuficiente');
    });
  });

  describe('deductPendingEarnings', () => {
    it('should deduct from pending earnings', async () => {
      const { balanceRepository } = await import('../../repositories/balance.repository');
      mockQuery.mockResolvedValue({ 
        rows: [{ 
          total_earned: '5000', 
          available_balance: '5000', 
          pending_balance: '0', 
          currency: 'ARS',
          updated_at: new Date() 
        }] 
      });

      const result = await balanceRepository.deductPendingEarnings('user-1', 5000, 'ARS');

      expect(result).not.toBeNull();
      expect(result!.pending_balance).toBe(0);
    });
  });
});
