import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services and repositories
vi.mock('../../services/payout.service', () => ({
  PayoutService: { requestPayout: vi.fn() },
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: { getByUserId: vi.fn(), getById: vi.fn() },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: { findByCredentials: vi.fn(), getActivityLogs: vi.fn() },
}));

vi.mock('../../services/twoFactor.service', () => ({
  TwoFactorService: { verifyToken: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: { sendPayoutRequestEmail: vi.fn() },
}));

vi.mock('../../schemas/payout.schema', () => ({
  requestPayoutSchema: { parse: vi.fn((data) => data) },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('PayoutController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = { user: null, body: {}, params: {}, headers: {}, ip: '127.0.0.1' };
    mockRes = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    mockNext = vi.fn();
  });

  describe('requestPayout', () => {
    it('should throw 401 when user not authenticated', async () => {
      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = null;

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should throw 404 when user not found', async () => {
      const userRepo = await import('../../repositories/user.repository');
      (userRepo.userRepository.findByCredentials as any).mockResolvedValue(null);

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.body = { amount: 1000, currency: 'ARS', payoutMethodId: 'pm-1' };

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('should throw 403 when 2FA required but not provided', async () => {
      const userRepo = await import('../../repositories/user.repository');
      (userRepo.userRepository.findByCredentials as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        two_factor_enabled: true,
        two_factor_secret: 'secret',
      });

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.body = { amount: 1000, currency: 'ARS', payoutMethodId: 'pm-1' };
      mockReq.headers = {};

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });

    it('should have requestPayout method', async () => {
      const { payoutController } = await import('../../controllers/payout.controller');
      expect(payoutController.requestPayout).toBeDefined();
    });
  });
});
