import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool
const mockQuery = vi.fn();
vi.mock('../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
    ai: {},
  },
}));

// Mock admin repository
vi.mock('../../repositories/admin.repository', () => ({
  adminRepository: {
    getGlobalFinancialStats: vi.fn(),
    getReconciliationDetail: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocks
import { StatsService } from '../../services/stats.service';

describe('StatsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getNextReleaseInfo', () => {
    it('should return next release info when found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ next_release_date: '2026-04-15', total_amount: '5000' }],
      });

      const result = await StatsService.getNextReleaseInfo('user-1', 'ARS');

      expect(result).toEqual({
        date: '2026-04-15',
        amount: 5000,
      });
    });

    it('should return null when no releases found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await StatsService.getNextReleaseInfo('user-1', 'ARS');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await StatsService.getNextReleaseInfo('user-1', 'ARS');

      expect(result).toBeNull();
    });
  });

  describe('getCreatorStats', () => {
    it('should return creator stats with all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_earned: '10000', available_now: '5000', pending_release: '3000' }],
        })
        .mockResolvedValueOnce({ rows: [{ total_withdrawn: '2000' }] });

      const result = await StatsService.getCreatorStats('user-1', 'ARS');

      expect(result.totalEarned).toBe(10000);
      expect(result.availableBalance).toBe(5000);
      expect(result.pendingBalance).toBe(3000);
      expect(result.totalWithdrawn).toBe(2000);
      expect(result.currency).toBe('ARS');
    });

    it('should return zeros when no balance found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_withdrawn: '0' }] });

      const result = await StatsService.getCreatorStats('user-1', 'ARS');

      expect(result.totalEarned).toBe(0);
      expect(result.availableBalance).toBe(0);
      expect(result.pendingBalance).toBe(0);
      expect(result.totalWithdrawn).toBe(0);
    });

    it('should throw on query error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(StatsService.getCreatorStats('user-1', 'ARS'))
        .rejects.toThrow();
    });
  });

  describe('getLastSevenDaysSales', () => {
    it('should return sales data for last 7 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day: '2026-04-01', gross_income: '1000', total_refunded: '100' },
        ],
      });

      const result = await StatsService.getLastSevenDaysSales('user-1', 'ARS');

      expect(result).toHaveLength(1);
      expect(result[0].income).toBe(1000);
      expect(result[0].refunds).toBe(100);
      expect(result[0].net).toBe(900);
    });

    it('should throw on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      await expect(StatsService.getLastSevenDaysSales('user-1', 'ARS'))
        .rejects.toThrow();
    });
  });

  describe('getAdminHealthCheck', () => {
    it('should return health check with correct structure', async () => {
      const mockStats = {
        currency: 'ARS',
        platform: {
          pending: 5000,
          available: 95000,
          withdrawnPeriod: 10000,
          taxCollectedPeriod: 21000,
          totalEarnedInPeriod: 100000,
          subscriptionsVolume: 30000,
          totalEarnedHistorical: 150000,
        },
        users: {
          pending: 20000,
          available: 80000,
          totalInSystem: 100000,
        },
        systemIntegrity: {
          totalOrdersVolume: 100000,
          totalInflow: 130000,
          totalAccountability: 130000,
          discrepanciesCount: 0,
          isHealthy: true,
        },
      };

      const mockOrders = [
        { amount: '1000', balance_released: false, guarantee_expired: false },
        { amount: '2000', balance_released: false, guarantee_expired: true },
      ];

      const { adminRepository } = await import('../../repositories/admin.repository');
      vi.mocked(adminRepository.getGlobalFinancialStats).mockResolvedValue(mockStats);
      vi.mocked(adminRepository.getReconciliationDetail).mockResolvedValue(mockOrders as any);

      const result = await StatsService.getAdminHealthCheck('ARS', '2026-01-01', '2026-03-31');

      expect(result.summary).toEqual(mockStats);
      expect(result.taxAuditory.collectedInPeriod).toBe(21000);
    });

    it('should return unhealthy when there are pending releases', async () => {
      const mockStats = {
        currency: 'ARS',
        platform: {
          pending: 5000,
          available: 95000,
          withdrawnPeriod: 10000,
          taxCollectedPeriod: 21000,
          totalEarnedInPeriod: 100000,
          subscriptionsVolume: 30000,
          totalEarnedHistorical: 150000,
        },
        users: {
          pending: 20000,
          available: 80000,
          totalInSystem: 100000,
        },
        systemIntegrity: {
          totalOrdersVolume: 100000,
          totalInflow: 130000,
          totalAccountability: 130000,
          discrepanciesCount: 0,
          isHealthy: true,
        },
      };

      const mockOrders = [
        { amount: '2000', balance_released: false, guarantee_expired: true },
      ];

      const { adminRepository } = await import('../../repositories/admin.repository');
      vi.mocked(adminRepository.getGlobalFinancialStats).mockResolvedValue(mockStats);
      vi.mocked(adminRepository.getReconciliationDetail).mockResolvedValue(mockOrders as any);

      const result = await StatsService.getAdminHealthCheck('ARS');

      expect(result.healthy).toBe(false);
    });
  });

  describe('getPlatformTaxHealth', () => {
    it('should return tax health data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_tax_collected: '50000',
          net_revenue: '200000',
          gross_revenue: '250000',
        }],
      });

      const result = await StatsService.getPlatformTaxHealth('ARS');

      expect(result.total_tax_collected).toBe('50000');
    });

    it('should handle empty result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{}] });

      const result = await StatsService.getPlatformTaxHealth('ARS');

      expect(result.total_tax_collected).toBeUndefined();
    });
  });
});