import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services and repositories
vi.mock('../../services/refund.service', () => ({
  RefundService: { processRefund: vi.fn() },
}));

vi.mock('../../repositories/order.repository', () => ({
  orderRepository: { getById: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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

describe('RefundController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { user: null, body: {}, params: {} };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  describe('processRefund (admin)', () => {
    it('should throw 401 when user not authenticated', async () => {
      const { processRefund } = await import('../../controllers/refund.controller');

      mockReq.user = null;
      mockReq.params = { orderId: 'order-1' };

      await processRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should throw 403 when user level < 10', async () => {
      const { processRefund } = await import('../../controllers/refund.controller');

      mockReq.user = { id: 'admin-1', level: 5 };
      mockReq.params = { orderId: 'order-1' };

      await processRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should process refund when admin (level >= 10)', async () => {
      const refundService = await import('../../services/refund.service');
      (refundService.RefundService.processRefund as any).mockResolvedValue({ success: true });

      const { processRefund } = await import('../../controllers/refund.controller');

      mockReq.user = { id: 'admin-1', level: 10 };
      mockReq.params = { orderId: 'order-1' };
      mockReq.body = { reason: 'Customer request' };

      await processRefund(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('requestSelfRefund (user)', () => {
    it('should throw 401 when user not authenticated', async () => {
      const { requestSelfRefund } = await import('../../controllers/refund.controller');

      mockReq.user = null;
      mockReq.params = { orderId: 'order-1' };

      await requestSelfRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should throw 404 when order not found', async () => {
      const orderRepo = await import('../../repositories/order.repository');
      (orderRepo.orderRepository.getById as any).mockResolvedValue(null);

      const { requestSelfRefund } = await import('../../controllers/refund.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { orderId: 'order-1' };

      await requestSelfRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('should throw 400 when order not paid', async () => {
      const orderRepo = await import('../../repositories/order.repository');
      (orderRepo.orderRepository.getById as any).mockResolvedValue({
        id: 'order-1',
        buyer_id: 'user-1',
        status: 'pending',
        is_guarantee_eligible: true,
      });

      const { requestSelfRefund } = await import('../../controllers/refund.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { orderId: 'order-1' };

      await requestSelfRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('should process self refund when valid', async () => {
      const orderRepo = await import('../../repositories/order.repository');
      const refundService = await import('../../services/refund.service');

      (orderRepo.orderRepository.getById as any).mockResolvedValue({
        id: 'order-1',
        buyer_id: 'user-1',
        status: 'paid',
        is_guarantee_eligible: true,
        release_date: new Date(Date.now() + 86400000), // future date
      });
      (refundService.RefundService.processRefund as any).mockResolvedValue({ success: true });

      const { requestSelfRefund } = await import('../../controllers/refund.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { orderId: 'order-1' };

      await requestSelfRefund(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });

  describe('edge cases', () => {
    it('should handle service errors gracefully', async () => {
      const { processRefund } = await import('../../controllers/refund.controller');
      const refundService = await import('../../services/refund.service');
      (refundService.RefundService.processRefund as any).mockRejectedValue(new Error('Service error'));

      mockReq.user = { id: 'admin-1', level: 10 };
      mockReq.params = { orderId: 'order-1' };
      mockReq.body = { reason: 'Customer request' };

      await processRefund(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
