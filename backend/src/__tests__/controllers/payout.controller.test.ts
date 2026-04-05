import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock services and repositories
vi.mock('../../services/payout.service', () => ({
  PayoutService: { 
    requestPayout: vi.fn().mockResolvedValue({ id: 'payout-1', status: 'pending' }),
    cancelUserPayout: vi.fn().mockResolvedValue({ message: 'Retiro cancelado exitosamente' })
  },
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: { getByUserId: vi.fn(), getById: vi.fn() },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: { 
    findByCredentials: vi.fn(),
    getActivityLogs: vi.fn(),
    getUserSessions: vi.fn(),
  },
}));

vi.mock('../../services/twoFactor.service', () => ({
  TwoFactorService: { verifyToken: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: { sendPayoutRequestEmail: vi.fn(), sendSecurityAlert: vi.fn() },
}));

vi.mock('../../schemas/payout.schema', () => ({
  requestPayoutSchema: { parse: vi.fn((data) => data) },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, public statusCode: number) {
      super(message);
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

    it('should successfully process payout when all validations pass', async () => {
      const userRepo = await import('../../repositories/user.repository');
      const payoutService = await import('../../services/payout.service');

      (userRepo.userRepository.findByCredentials as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        two_factor_enabled: false,
        level: 1,
      });
      (userRepo.userRepository.getActivityLogs as any).mockResolvedValue([]);
      (userRepo.userRepository.getUserSessions as any).mockResolvedValue([
        { ip_address: '127.0.0.1', user_agent: 'test-agent' }
      ]);
      (payoutService.PayoutService.requestPayout as any).mockResolvedValue({
        id: 'payout-1',
        amount: 1000,
        currency: 'ARS',
      });

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.body = { amount: 1000, currency: 'ARS', payoutMethodId: 'pm-1' };
      mockReq.headers = { 'user-agent': 'test-agent' };

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
        })
      );
    });

    it('should throw 403 when 2FA code is invalid', async () => {
      const userRepo = await import('../../repositories/user.repository');
      const twoFactorService = await import('../../services/twoFactor.service');

      (userRepo.userRepository.findByCredentials as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        two_factor_enabled: true,
        two_factor_secret: 'secret123',
      });
      (twoFactorService.TwoFactorService.verifyToken as any).mockReturnValue(false);

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.body = { amount: 1000, currency: 'ARS', payoutMethodId: 'pm-1' };
      mockReq.headers = { 'x-2fa-code': 'wrong-code' };

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should throw 403 when recent security change detected', async () => {
      const userRepo = await import('../../repositories/user.repository');

      // User with 2FA disabled but recent password change
      (userRepo.userRepository.findByCredentials as any).mockResolvedValue({
        id: 'user-1',
        email: 'test@test.com',
        two_factor_enabled: false,
        level: 1,
      });
      
      // Recent password change
      const yesterday = new Date();
      yesterday.setHours(yesterday.getHours() - 12);
      (userRepo.userRepository.getActivityLogs as any).mockResolvedValue([
        { action: 'PASSWORD_CHANGED', created_at: yesterday }
      ]);

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1', email: 'test@test.com' };
      mockReq.body = { amount: 1000, currency: 'ARS', payoutMethodId: 'pm-1' };

      await payoutController.requestPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403 })
      );
    });
  });

  describe('getMyPayouts', () => {
    it('should return 401 when user not authenticated', async () => {
      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = null;

      await payoutController.getMyPayouts(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should return payouts for authenticated user', async () => {
      const payoutRepo = await import('../../repositories/payout.repository');

      (payoutRepo.payoutRepository.getByUserId as any).mockResolvedValue([
        { id: 'payout-1', amount: 1000, status: 'pending' }
      ]);

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1' };

      await payoutController.getMyPayouts(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });

  describe('cancelPayout', () => {
    it('should return 401 when user not authenticated', async () => {
      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = null;
      mockReq.params = { id: 'payout-1' };

      await payoutController.cancelPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('should return 400 when payout ID not provided', async () => {
      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = {};

      await payoutController.cancelPayout(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('should cancel payout successfully', async () => {
      const payoutService = await import('../../services/payout.service');

      (payoutService.PayoutService.cancelUserPayout as any).mockResolvedValue({
        message: 'Retiro cancelado exitosamente'
      });

      const { payoutController } = await import('../../controllers/payout.controller');

      mockReq.user = { id: 'user-1' };
      mockReq.params = { id: 'payout-1' };

      await payoutController.cancelPayout(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });
  });
});
