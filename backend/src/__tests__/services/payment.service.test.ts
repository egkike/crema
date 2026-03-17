import { describe, it, expect, vi } from 'vitest';

// Mock config before importing
vi.mock('../../config/index', () => ({
  config: {
    mercadoPago: { accessToken: 'test_token' },
  },
}));

vi.mock('../../errors/AppError', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.name = 'AppError';
      this.statusCode = statusCode;
    }
  },
}));

import { PaymentProviderFactory } from '../../services/payment/PaymentProviderFactory';

describe('PaymentProviderFactory', () => {
  it('should return a provider for mercadopago gateway', () => {
    const provider = PaymentProviderFactory.getProvider('mercadopago');
    expect(provider).toBeDefined();
  });

  it('should return a provider for simulator gateway', () => {
    const provider = PaymentProviderFactory.getProvider('simulator');
    expect(provider).toBeDefined();
  });

  it('should return a provider with refund method', () => {
    const provider = PaymentProviderFactory.getProvider('simulator');
    expect(provider.refund).toBeDefined();
  });

  it('should return same instance for same gateway (singleton)', () => {
    const provider1 = PaymentProviderFactory.getProvider('simulator');
    const provider2 = PaymentProviderFactory.getProvider('simulator');
    expect(provider1).toBe(provider2);
  });
});
