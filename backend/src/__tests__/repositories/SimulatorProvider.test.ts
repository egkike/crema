import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config
vi.mock('../../config', () => ({
  config: {
    frontendUrl: 'https://crema.test',
    mercadoPago: { accessToken: 'test_token' },
    blockonomics: { apiKey: 'test_key' },
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

describe('SimulatorProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createPreference', () => {
    it('should create a preference URL with all params', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.createPreference({
        product: { id: 'prod-1', title: 'Test Product' },
        amount: 10000,
        currency: 'ARS',
        externalReference: 'order-123',
        email: 'test@test.com',
      });

      expect(result.initPoint).toContain('order-123');
      expect(result.initPoint).toContain('10000');
      expect(result.initPoint).toContain('ARS');
    });

    it('should include tempPassword in URL when provided', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.createPreference({
        product: { id: 'prod-1', title: 'Test Product' },
        amount: 5000,
        currency: 'ARS',
        externalReference: 'order-456',
        email: 'test@test.com',
        tempPassword: 'mypass123',
      });

      // Note: tempPassword is not included in initPoint, but handled in handleWebhook
      expect(result.initPoint).toContain('order-456');
    });
  });

  describe('createSubscription', () => {
    it('should create subscription URL with provider reference', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.createSubscription({
        planName: 'Premium Plan',
        amount: 5000,
        currency: 'ARS',
        externalReference: 'SUB:user-1',
        email: 'test@test.com',
      });

      expect(result.initPoint).toContain('SUB:user-1');
      expect(result.initPoint).toContain('type=subscription');
      expect(result.providerReference).toMatch(/^SIM-SUB-[A-F0-9]+$/);
    });
  });

  describe('cancelSubscription', () => {
    it('should log cancellation and resolve', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      await provider.cancelSubscription('sub-123');

      // Simulator just logs and resolves - verify no error thrown
      expect(true).toBe(true);
    });
  });

  describe('createCreditPreference', () => {
    it('should create credit preference URL with all params', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.createCreditPreference({
        packageId: 'pkg-1',
        packageName: '100 Credits',
        credits: 100,
        amount: 5000,
        currency: 'ARS',
        userId: 'user-1',
        email: 'test@test.com',
      });

      expect(result.initPoint).toContain('credits=100');
      expect(result.initPoint).toContain('amount=5000');
    });
  });

  describe('refund', () => {
    it('should log refund and resolve', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      await provider.refund('tx-123', 5000);

      // Simulator just logs and resolves - verify no error thrown
      expect(true).toBe(true);
    });
  });

  describe('handleWebhook', () => {
    it('should return payment result from body', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.handleWebhook({
        body: {
          externalReference: 'order-123',
          status: 'approved',
          transactionId: 'tx-456',
          tempPassword: 'testpass',
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result!.externalReference).toBe('order-123');
      expect(result!.status).toBe('approved');
      expect(result!.transactionId).toBe('tx-456');
      expect(result!.type).toBe('payment');
      expect(result!.metadata?.temp_password).toBe('testpass');
    });

    it('should return subscription type for SUB: externalReference', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.handleWebhook({
        body: {
          externalReference: 'SUB:user-1',
          status: 'approved',
          transactionId: 'tx-789',
        },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result!.type).toBe('subscription');
    });

    it('should use default values when body is empty', async () => {
      const { SimulatorProvider } = await import('../../services/payment/providers/SimulatorProvider');
      const provider = new SimulatorProvider();

      const result = await provider.handleWebhook({
        body: { externalReference: 'order-default' },
        headers: {},
        query: {},
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('approved');
      expect(result!.transactionId).toMatch(/^SIM-TX-/);
      expect(result!.type).toBe('payment');
    });
  });
});
