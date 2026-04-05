import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../../repositories/ai/denunciation.repository', () => ({
  denominationRepository: {
    createReport: vi.fn(),
    getReports: vi.fn(),
    getReportById: vi.fn(),
    updateReport: vi.fn(),
    createAction: vi.fn(),
    getReasons: vi.fn(),
    getActionsByReport: vi.fn(),
    getPolicies: vi.fn(),
    getPolicyById: vi.fn(),
    getReasonByCode: vi.fn(),
    hasUserReported: vi.fn(),
  },
}));

vi.mock('../../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      (this as any).statusCode = statusCode;
    }
  },
}));

describe('ReportService', () => {
  describe('exports', () => {
    it('should export reportService', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(reportService).toBeDefined();
    });
  });

  describe('method existence', () => {
    it('should have createReport method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.createReport).toBe('function');
    });

    it('should have getReports method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReports).toBe('function');
    });

    it('should have getReportById method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReportById).toBe('function');
    });

    it('should have resolveReport method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.resolveReport).toBe('function');
    });

    it('should have applyAction method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.applyAction).toBe('function');
    });

    it('should have getReasons method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getReasons).toBe('function');
    });

    it('should have getActions method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getActions).toBe('function');
    });

    it('should have getPolicies method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getPolicies).toBe('function');
    });

    it('should have getPolicyById method', async () => {
      const { reportService } = await import('../../../services/ai/denunciation.service');
      expect(typeof reportService.getPolicyById).toBe('function');
    });
  });
});
