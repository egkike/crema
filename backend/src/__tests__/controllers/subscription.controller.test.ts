import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn(),
    getUserStorageUsage: vi.fn(),
  },
}));

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductsByCreator: vi.fn(),
  },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('SubscriptionController', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockReq = {
      user: null,
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('getMySubscriptionStatus', () => {
    it('should return subscription status for authenticated user', async () => {
      const subRepo = await import('../../repositories/subscription.repository');
      const prodRepo = await import('../../repositories/product.repository');

      (subRepo.subscriptionRepository.getActiveSubscription as any).mockResolvedValue({
        plan_name: 'Premium',
        status: 'active',
        current_period_end: new Date('2024-12-31'),
        features: { max_products: 10, storage_mb: 5000 },
        allowed_types: ['digital', 'physical'],
      });
      (subRepo.subscriptionRepository.getUserStorageUsage as any).mockResolvedValue(1024 * 1024 * 100); // 100MB
      (prodRepo.productRepository.getProductsByCreator as any).mockResolvedValue([{}, {}, {}]); // 3 products

      const { getMySubscriptionStatus } = await import('../../controllers/subscription.controller');

      mockReq.user = { id: 'user-1' };

      await getMySubscriptionStatus(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            planName: 'Premium',
            status: 'active',
          }),
        })
      );
    });

    it('should throw error when user not authenticated', async () => {
      const { getMySubscriptionStatus } = await import('../../controllers/subscription.controller');

      mockReq.user = null;

      await getMySubscriptionStatus(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('autenticado') })
      );
    });

    it('should throw error when no active subscription', async () => {
      const subRepo = await import('../../repositories/subscription.repository');

      (subRepo.subscriptionRepository.getActiveSubscription as any).mockResolvedValue(null);

      const { getMySubscriptionStatus } = await import('../../controllers/subscription.controller');

      mockReq.user = { id: 'user-1' };

      await getMySubscriptionStatus(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('suscripción') })
      );
    });
  });
});
