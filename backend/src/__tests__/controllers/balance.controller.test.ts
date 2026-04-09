import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories and services
vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    getAllBalancesByUserId: vi.fn(),
  },
}));

vi.mock('../../repositories/history.repository', () => ({
  historyRepository: {
    getByUserIdWithCount: vi.fn(),
  },
}));

vi.mock('../../services/stats.service', () => ({
  StatsService: {
    getCreatorStats: vi.fn(),
    getLastSevenDaysSales: vi.fn(),
  },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    public statusCode: number;
    public isOperational: boolean;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.isOperational = true;
    }
  },
}));

describe('BalanceController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { user: null, query: {} };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  describe('getDashboardStats', () => {
    it('should return dashboard stats', async () => {
      const { balanceController } = await import('../../controllers/balance.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.query = { currency: 'ARS' };

      await balanceController.getDashboardStats(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('getMyBalance', () => {
    it('should throw when not authenticated', async () => {
      const { balanceController } = await import('../../controllers/balance.controller');

      mockReq.user = null;

      await balanceController.getMyBalance(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getMyHistory', () => {
    it('should return history with pagination', async () => {
      const { historyRepository } = await import('../../repositories/history.repository');
      (historyRepository.getByUserIdWithCount as any).mockResolvedValue({
        data: [{ id: 'hist-1' }],
        total: 1,
      });

      const { balanceController } = await import('../../controllers/balance.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.query = { limit: '20', offset: '0' };

      await balanceController.getMyHistory(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});
