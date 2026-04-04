import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services
vi.mock('../../services/stats.service', () => ({
  StatsService: {
    getAdminHealthCheck: vi.fn(),
    getCreatorStats: vi.fn(),
  },
}));

vi.mock('../../services/export.service', () => ({
  ExportService: {
    exportTaxAuditToCSV: vi.fn(),
    exportFinancialAuditCSV: vi.fn(),
    exportRefundsToCSV: vi.fn(),
  },
}));

vi.mock('../../services/payout.service', () => ({
  PayoutService: {
    checkPlatformLiquidity: vi.fn(),
    notifyAdminPendingPayouts: vi.fn(),
  },
}));

// Mock repositories
vi.mock('../../repositories/admin.repository', () => ({
  adminRepository: {
    getRetentionSummary: vi.fn(),
    getPlatformLedger: vi.fn(),
  },
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: {
    getByStatus: vi.fn(),
  },
}));

vi.mock('../../repositories/system.repository', () => ({
  systemRepository: {
    getSystemSettings: vi.fn(),
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
import { AdminController } from '../../controllers/admin.controller';
import { StatsService } from '../../services/stats.service';
import { ExportService } from '../../services/export.service';
import { adminRepository } from '../../repositories/admin.repository';
import { payoutRepository } from '../../repositories/payout.repository';

describe('AdminController', () => {
  let mockReq: any;
  let mockRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockReq = {
      query: {},
      params: {},
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };
  });

  describe('validateCurrency', () => {
    it('should return currency when valid', () => {
      const result = AdminController.validateCurrency('ARS');
      expect(result).toBe('ARS');
    });

    it('should throw when currency is undefined', () => {
      expect(() => AdminController.validateCurrency(undefined)).toThrow('La moneda (currency) es obligatoria');
    });

    it('should throw when currency is empty string', () => {
      expect(() => AdminController.validateCurrency('')).toThrow('La moneda (currency) es obligatoria');
    });

    it('should throw when currency is not a string', () => {
      expect(() => AdminController.validateCurrency(null as any)).toThrow('La moneda (currency) es obligatoria');
    });
  });

  describe('downloadTaxReport', () => {
    it('should return CSV when successful', async () => {
      mockReq.query = { currency: 'ARS', from: '2026-01-01', to: '2026-03-31' };
      
      vi.mocked(ExportService.exportTaxAuditToCSV).mockResolvedValue('date,cuit,amount');

      await AdminController.downloadTaxReport(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalledWith('date,cuit,amount');
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.downloadTaxReport(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('moneda') }));
    });

    it('should return 500 when export fails', async () => {
      mockReq.query = { currency: 'ARS' };
      
      vi.mocked(ExportService.exportTaxAuditToCSV).mockRejectedValue(new Error('DB error'));

      await AdminController.downloadTaxReport(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getRetentionSummary', () => {
    it('should return summary when successful', async () => {
      mockReq.query = { currency: 'ARS' };
      
      const mockData = [{ type: 'IVA', total: 1000 }];
      vi.mocked(adminRepository.getRetentionSummary).mockResolvedValue(mockData);

      await AdminController.getRetentionSummary(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success', data: mockData });
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.getRetentionSummary(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getFinancialHealth', () => {
    it('should return health data when successful', async () => {
      mockReq.query = { currency: 'ARS', from: '2026-01-01', to: '2026-03-31' };
      
      const mockHealth = { totalRevenue: 50000, totalPayouts: 10000 };
      vi.mocked(StatsService.getAdminHealthCheck).mockResolvedValue(mockHealth);

      await AdminController.getFinancialHealth(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success', data: mockHealth });
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.getFinancialHealth(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getPlatformLedger', () => {
    it('should return ledger when successful', async () => {
      mockReq.query = { currency: 'ARS', from: '2026-01-01', to: '2026-03-31' };
      
      const mockLedger = { entries: [] };
      vi.mocked(adminRepository.getPlatformLedger).mockResolvedValue(mockLedger);

      await AdminController.getPlatformLedger(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success', data: mockLedger });
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.getPlatformLedger(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('downloadFinancialAudit', () => {
    it('should return CSV when successful', async () => {
      mockReq.query = { currency: 'ARS' };
      
      vi.mocked(ExportService.exportFinancialAuditCSV).mockResolvedValue('order_id,amount');

      await AdminController.downloadFinancialAudit(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalledWith('order_id,amount');
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.downloadFinancialAudit(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('downloadRefundsReport', () => {
    it('should return CSV when successful', async () => {
      mockReq.query = { currency: 'ARS' };
      
      vi.mocked(ExportService.exportRefundsToCSV).mockResolvedValue('refund_id,amount');

      await AdminController.downloadRefundsReport(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalledWith('refund_id,amount');
    });

    it('should return 400 when currency missing', async () => {
      mockReq.query = {};

      await AdminController.downloadRefundsReport(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getUserStats', () => {
    it('should return stats when successful', async () => {
      mockReq.params = { userId: 'user-123' };
      mockReq.query = { currency: 'ARS' };
      
      const mockStats = { totalSales: 5000 };
      vi.mocked(StatsService.getCreatorStats).mockResolvedValue(mockStats);

      await AdminController.getUserStats(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success', data: mockStats });
    });

    it('should return 400 when userId missing', async () => {
      mockReq.params = {};
      mockReq.query = { currency: 'ARS' };

      await AdminController.getUserStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when currency missing', async () => {
      mockReq.params = { userId: 'user-123' };
      mockReq.query = {};

      await AdminController.getUserStats(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getPayoutsByStatus', () => {
    it('should return payouts when successful', async () => {
      mockReq.query = { status: 'completed' };
      
      const mockPayouts = [{ id: 'payout-1', amount: 1000 }];
      vi.mocked(payoutRepository.getByStatus).mockResolvedValue(mockPayouts);

      await AdminController.getPayoutsByStatus(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({ status: 'success', data: mockPayouts });
    });

    it('should default to pending status', async () => {
      mockReq.query = {};
      
      vi.mocked(payoutRepository.getByStatus).mockResolvedValue([]);

      await AdminController.getPayoutsByStatus(mockReq, mockRes);

      expect(payoutRepository.getByStatus).toHaveBeenCalledWith('pending');
    });
  });
});