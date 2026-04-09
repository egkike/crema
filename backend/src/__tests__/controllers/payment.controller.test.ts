import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn(),
    getPriceByCurrency: vi.fn(),
  },
}));

vi.mock('../../repositories/order.repository', () => ({
  orderRepository: {
    create: vi.fn(),
  },
}));

vi.mock('../../repositories/coupon.repository', () => ({
  couponRepository: {
    checkThreshold: vi.fn(),
    findValidCoupon: vi.fn(),
    validatePriceFloor: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    findByCredentials: vi.fn(),
    createUser: vi.fn(),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getGatewaysByCurrency: vi.fn(),
  },
}));

// Mock services
vi.mock('../../services/order.service', () => ({
  OrderService: {
    processPaymentNotification: vi.fn(),
  },
}));

vi.mock('../../services/subscription.service', () => ({
  SubscriptionService: {
    handleSubscriptionPayment: vi.fn(),
    cancelSubscription: vi.fn(),
  },
}));

vi.mock('../../services/payment/PaymentProviderFactory', () => ({
  PaymentProviderFactory: {
    getProvider: vi.fn().mockReturnValue({
      createPreference: vi.fn().mockResolvedValue({ initPoint: 'https://test.com/pay' }),
      handleWebhook: vi.fn(),
    }),
  },
}));

vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    confirmPurchase: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock AppError
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

describe('PaymentController', () => {
  let mockReq: any;
  let mockRes: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  let mockNext: any = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();

    mockReq = {
      body: {},
      user: null,
      cookies: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    };
    mockNext = vi.fn();

    // Default mocks
    const configRepo = await import('../../repositories/config.repository');
    const productRepo = await import('../../repositories/product.repository');
    const userRepo = await import('../../repositories/user.repository');
    const orderRepo = await import('../../repositories/order.repository');
    const couponRepo = await import('../../repositories/coupon.repository');
    const providerFactory = await import('../../services/payment/PaymentProviderFactory');

    (configRepo.configRepository.getGatewaysByCurrency as any).mockResolvedValue([
      { id: 'mercadopago', name: 'MercadoPago' }
    ]);
    (productRepo.productRepository.getProductById as any).mockResolvedValue({
      id: 'prod-1',
      title: 'Test Product'
    });
    (productRepo.productRepository.getPriceByCurrency as any).mockResolvedValue('10000');
    (userRepo.userRepository.findByCredentials as any).mockResolvedValue(null);
    (userRepo.userRepository.createUser as any).mockResolvedValue({ id: 'user-new' });
    (couponRepo.couponRepository.checkThreshold as any).mockResolvedValue(true);
    (couponRepo.couponRepository.findValidCoupon as any).mockResolvedValue(null);
    (orderRepo.orderRepository.create as any).mockResolvedValue({ id: 'order-1' });
    (providerFactory.PaymentProviderFactory.getProvider as any).mockReturnValue({
      createPreference: vi.fn().mockResolvedValue({ initPoint: 'https://test.com/pay' }),
    });
  });

  describe('createPaymentPreference', () => {
    it('should create payment preference successfully', async () => {
      const { createPaymentPreference } = await import('../../controllers/payment.controller');

      mockReq.body = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        currency: 'ARS',
        gatewayId: 'mercadopago',
      };
      mockReq.user = { id: 'user-1', email: 'test@test.com' };

      await createPaymentPreference(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            init_point: expect.any(String),
          }),
        })
      );
    });

    it('should call next with error on invalid product', async () => {
      const { createPaymentPreference } = await import('../../controllers/payment.controller');
      const productRepo = await import('../../repositories/product.repository');

      (productRepo.productRepository.getProductById as any).mockResolvedValue(null);

      mockReq.body = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        currency: 'ARS',
        gatewayId: 'mercadopago',
      };

      await createPaymentPreference(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should require email when user is not authenticated', async () => {
      const { createPaymentPreference } = await import('../../controllers/payment.controller');

      mockReq.body = {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        currency: 'ARS',
        gatewayId: 'mercadopago',
      };
      mockReq.user = null;

      await createPaymentPreference(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Email') })
      );
    });
  });

  describe('handleProviderWebhook', () => {
    it('should return 200 immediately and process in background', async () => {
      const { handleProviderWebhook } = await import('../../controllers/payment.controller');
      const providerFactory = await import('../../services/payment/PaymentProviderFactory');

      (providerFactory.PaymentProviderFactory.getProvider as any).mockReturnValue({
        handleWebhook: vi.fn().mockResolvedValue(null),
      });

      mockReq.params = { gatewayId: 'mercadopago' };
      mockReq.body = {};
      mockReq.headers = {};
      mockReq.query = {};

      await handleProviderWebhook(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('OK');
    });
  });
});
