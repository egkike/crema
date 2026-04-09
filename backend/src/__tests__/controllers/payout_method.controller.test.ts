import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payout_method.repository
vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {
    getByUserId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
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

describe('PayoutMethodController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockReq = { user: null, body: {}, params: {} };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  describe('getMyPayoutMethods', () => {
    it('should return payout methods for user', async () => {
      const { payoutMethodRepository } = await import('../../repositories/payout_method.repository');
      (payoutMethodRepository.getByUserId as any).mockResolvedValue([
        { id: 'pm-1', type: 'bank_transfer' }
      ]);

      const controller = await import('../../controllers/payout_method.controller');
      mockReq.user = { id: 'user-1' };

      await controller.getMyPayoutMethods(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: expect.any(Array) })
      );
    });
  });
});
