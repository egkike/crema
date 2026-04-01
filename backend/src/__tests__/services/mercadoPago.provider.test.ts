import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock MercadoPago SDK con clases reales (no arrow functions)
const mockPreferenceCreate = vi.fn();
const mockPaymentRefundCreate = vi.fn();
const mockPreApprovalCreate = vi.fn();
const mockPreApprovalUpdate = vi.fn();
const mockPreApprovalGet = vi.fn();
const mockPaymentGet = vi.fn();

vi.mock('mercadopago', () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = mockPreferenceCreate;
  },
  PaymentRefund: class {
    create = mockPaymentRefundCreate;
  },
  PreApproval: class {
    create = mockPreApprovalCreate;
    update = mockPreApprovalUpdate;
    get = mockPreApprovalGet;
  },
  Payment: class {
    get = mockPaymentGet;
  },
}));

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    mercadoPago: {
      accessToken: 'test_access_token',
      publicKey: 'test_public_key',
      webhookSecret: 'test_webhook_secret',
    },
    frontendUrl: 'https://test.crema.app',
    apiBaseUrl: 'https://api.test.crema.app',
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

import { MercadoPagoProvider } from '../../services/payment/providers/MercadoPagoProvider';

describe('MercadoPagoProvider', () => {
  let provider: MercadoPagoProvider;

  beforeEach(() => {
    provider = new MercadoPagoProvider();
    vi.clearAllMocks();
  });

  describe('createPreference', () => {
    it('should return initPoint from MercadoPago', async () => {
      mockPreferenceCreate.mockResolvedValueOnce({
        init_point: 'https://mpago.la/test123',
      });

      const result = await provider.createPreference({
        product: { id: 'prod-123', title: 'Test Product' },
        amount: 1000,
        currency: 'ARS',
        externalReference: 'order-456',
        email: 'user@test.com',
      });

      expect(result.initPoint).toBe('https://mpago.la/test123');
      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            items: [
              expect.objectContaining({
                id: 'prod-123',
                title: 'Test Product',
                unit_price: 1000,
                currency_id: 'ARS',
              }),
            ],
            external_reference: 'order-456',
            payer: { email: 'user@test.com' },
          }),
        })
      );
    });

    it('should include tempPassword in metadata', async () => {
      mockPreferenceCreate.mockResolvedValueOnce({
        init_point: 'https://mpago.la/test123',
      });

      await provider.createPreference({
        product: { id: 'prod-123', title: 'Test' },
        amount: 500,
        currency: 'ARS',
        externalReference: 'order-789',
        email: 'user@test.com',
        tempPassword: 'secret123',
      });

      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            metadata: { temp_password: 'secret123' },
          }),
        })
      );
    });

    it('should throw error when init_point is missing', async () => {
      mockPreferenceCreate.mockResolvedValueOnce({ init_point: null });

      await expect(
        provider.createPreference({
          product: { id: 'prod-123', title: 'Test' },
          amount: 100,
          currency: 'ARS',
          externalReference: 'order-123',
          email: 'user@test.com',
        })
      ).rejects.toThrow('No se pudo obtener el init_point de Mercado Pago');
    });

    it('should trim email to prevent whitespace issues', async () => {
      mockPreferenceCreate.mockResolvedValueOnce({ init_point: 'https://mpago.la/test' });

      await provider.createPreference({
        product: { id: 'prod-123', title: 'Test' },
        amount: 100,
        currency: 'ARS',
        externalReference: 'order-123',
        email: '  user@test.com  ',
      });

      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            payer: { email: 'user@test.com' },
          }),
        })
      );
    });
  });

  describe('createSubscription', () => {
    it('should return initPoint and providerReference for subscription', async () => {
      mockPreApprovalCreate.mockResolvedValueOnce({
        init_point: 'https://mpago.la/sub123',
        id: 'sub-ref-456',
      });

      const result = await provider.createSubscription({
        planName: 'Premium Plan',
        amount: 1500,
        currency: 'ARS',
        externalReference: 'SUB:user-123',
        email: 'user@test.com',
      });

      expect(result.initPoint).toBe('https://mpago.la/sub123');
      expect(result.providerReference).toBe('sub-ref-456');
      expect(mockPreApprovalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            reason: 'Premium Plan',
            auto_recurring: expect.objectContaining({
              frequency: 1,
              frequency_type: 'months',
              transaction_amount: 1500,
              currency_id: 'ARS',
            }),
          }),
        })
      );
    });

    it('should throw error when init_point is missing', async () => {
      mockPreApprovalCreate.mockResolvedValueOnce({ init_point: null, id: 'sub-123' });

      await expect(
        provider.createSubscription({
          planName: 'Test Plan',
          amount: 100,
          currency: 'ARS',
          externalReference: 'SUB:test',
          email: 'user@test.com',
        })
      ).rejects.toThrow('Error al crear suscripción en Mercado Pago');
    });
  });

  describe('createCreditPreference', () => {
    it('should return initPoint for credits purchase', async () => {
      mockPreferenceCreate.mockResolvedValueOnce({
        init_point: 'https://mpago.la/credits123',
      });

      const result = await provider.createCreditPreference({
        packageId: 'pkg-100',
        packageName: '100 Credits',
        credits: 100,
        amount: 500,
        currency: 'ARS',
        userId: 'user-123',
        email: 'user@test.com',
      });

      expect(result.initPoint).toBe('https://mpago.la/credits123');
      expect(mockPreferenceCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            external_reference: expect.stringMatching(/^CREDITS:user-123:pkg-100:\d+$/),
            items: [
              expect.objectContaining({
                id: 'credits-pkg-100',
                title: '100 Credits',
                description: '100 Créditos AI',
              }),
            ],
            metadata: expect.objectContaining({
              userId: 'user-123',
              packageId: 'pkg-100',
              credits: 100,
            }),
          }),
        })
      );
    });
  });

  describe('refund', () => {
    it('should create refund successfully', async () => {
      mockPaymentRefundCreate.mockResolvedValueOnce({ id: 'refund-123' });

      await expect(provider.refund('456', 500)).resolves.toBeUndefined();

      expect(mockPaymentRefundCreate).toHaveBeenCalledWith({
        payment_id: 456,
        body: { amount: 500 },
      });
    });

    it('should throw error when refund fails', async () => {
      mockPaymentRefundCreate.mockRejectedValueOnce(new Error('MP refund error'));

      await expect(provider.refund('payment-456', 500)).rejects.toThrow(
        'Error en Mercado Pago Refund: MP refund error'
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      mockPreApprovalUpdate.mockResolvedValueOnce({ id: 'sub-123', status: 'cancelled' });

      await expect(provider.cancelSubscription('sub-123')).resolves.toBeUndefined();

      expect(mockPreApprovalUpdate).toHaveBeenCalledWith({
        id: 'sub-123',
        body: { status: 'cancelled' },
      });
    });
  });

  describe('handleWebhook', () => {
    it('should process payment webhook with fee breakdown', async () => {
      mockPaymentGet.mockResolvedValueOnce({
        id: 123456,
        external_reference: 'order-789',
        status: 'approved',
        metadata: {},
        fee_details: [
          { type: 'mercadopago_fee', amount: 50 },
          { type: 'tax', amount: 21 },
          { type: 'financing_fee', amount: 10 },
        ],
      });

      const result = await provider.handleWebhook({
        body: {
          type: 'payment',
          action: 'payment.created',
          data: { id: '123456' },
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result?.externalReference).toBe('order-789');
      expect(result?.status).toBe('approved');
      expect(result?.transactionId).toBe('123456');
      expect(result?.type).toBe('payment');
      expect(result?.gatewayFee).toBe(60); // 50 + 10
      expect(result?.gatewayTax).toBe(21);
    });

    it('should process subscription webhook', async () => {
      mockPreApprovalGet.mockResolvedValueOnce({
        id: 'sub-123',
        external_reference: 'SUB:user-456',
        status: 'authorized',
      });

      const result = await provider.handleWebhook({
        body: {
          type: 'subscription_preapproval',
          action: 'subscription_preapproval.created',
          data: { id: 'sub-123' },
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result?.externalReference).toBe('SUB:user-456');
      expect(result?.status).toBe('authorized');
      expect(result?.type).toBe('subscription');
    });

    it('should return null when no resource ID', async () => {
      const result = await provider.handleWebhook({
        body: { type: 'payment', action: 'payment.created', data: {} },
        headers: {},
        query: {},
      });

      expect(result).toBeNull();
    });

    it('should return null for unknown webhook type', async () => {
      const result = await provider.handleWebhook({
        body: { type: 'unknown_type', data: { id: '123' } },
        headers: {},
        query: {},
      });

      expect(result).toBeNull();
    });

    it('should return null and log warning when payment fetch fails', async () => {
      mockPaymentGet.mockRejectedValueOnce(new Error('MP API error'));

      const result = await provider.handleWebhook({
        body: {
          type: 'payment',
          action: 'payment.created',
          data: { id: '123456' },
        },
        headers: {},
        query: {},
      });

      expect(result).toBeNull();
    });
  });
});
