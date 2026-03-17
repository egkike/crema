import { describe, it, expect, vi, beforeEach } from 'vitest';

import { SimulatorProvider } from '../../services/payment/providers/SimulatorProvider';

vi.mock('../../config/index', () => ({
  config: {
    frontendUrl: 'https://test.crema.app',
    apiBaseUrl: 'https://api.test.crema.app',
  },
}));

describe('SimulatorProvider', () => {
  let provider: SimulatorProvider;

  beforeEach(() => {
    provider = new SimulatorProvider();
    vi.clearAllMocks();
  });

  describe('createPreference', () => {
    it('should return initPoint URL with external reference', async () => {
      const result = await provider.createPreference({
        product: { id: 'prod-123', title: 'Test Product' },
        amount: 1000,
        currency: 'ARS',
        externalReference: 'order-456',
        email: 'user@test.com',
      });

      expect(result.initPoint).toContain('order-456');
      expect(result.initPoint).toContain('1000');
      expect(result.initPoint).toContain('ARS');
    });

    it('should include product info in URL', async () => {
      const result = await provider.createPreference({
        product: { id: 'prod-123', title: 'Test Product' },
        amount: 500,
        currency: 'USD',
        externalReference: 'order-789',
        email: 'user@test.com',
      });

      expect(result.initPoint).toContain('order-789');
      expect(result.initPoint).toContain('500');
      expect(result.initPoint).toContain('USD');
    });
  });

  describe('createSubscription', () => {
    it('should return subscription URL with SIM prefix', async () => {
      const result = await provider.createSubscription({
        planName: 'Premium Plan',
        amount: 1500,
        currency: 'ARS',
        externalReference: 'SUB:user-123',
        email: 'user@test.com',
      });

      expect(result.initPoint).toContain('SUB:user-123');
      expect(result.initPoint).toContain('subscription');
      expect(result.providerReference).toMatch(/^SIM-SUB-[A-F0-9]+$/);
    });
  });

  describe('cancelSubscription', () => {
    it('should resolve without error', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await expect(provider.cancelSubscription('SUB-123')).resolves.toBeUndefined();
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('cancelada')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('refund', () => {
    it('should resolve without error', async () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      await expect(provider.refund('TX-123', 500)).resolves.toBeUndefined();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Reembolso')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('handleWebhook', () => {
    it('should return webhook result for payment', async () => {
      const result = await provider.handleWebhook({
        body: {
          externalReference: 'order-123',
          status: 'approved',
          transactionId: 'TX-456',
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result?.externalReference).toBe('order-123');
      expect(result?.status).toBe('approved');
      expect(result?.transactionId).toBe('TX-456');
      expect(result?.type).toBe('payment');
    });

    it('should return webhook result for subscription', async () => {
      const result = await provider.handleWebhook({
        body: {
          externalReference: 'SUB:user-123',
          status: 'active',
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result?.externalReference).toBe('SUB:user-123');
      expect(result?.type).toBe('subscription');
    });

    it('should handle missing transactionId with generated one', async () => {
      const result = await provider.handleWebhook({
        body: {
          externalReference: 'order-123',
          status: 'pending',
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result?.transactionId).toMatch(/^SIM-TX-\d+$/);
    });

    it('should include tempPassword in metadata', async () => {
      const result = await provider.handleWebhook({
        body: {
          externalReference: 'order-123',
          status: 'approved',
          tempPassword: 'secret123',
        },
        headers: {},
        query: {},
      });

      expect(result?.metadata).toEqual({ temp_password: 'secret123' });
    });
  });
});
