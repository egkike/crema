import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID } from '../setup';
// eslint-disable-next-line import/order
import { SubscriptionService } from '../../services/subscription.service';

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getPlanById: vi.fn(),
  },
}));

vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {
    getByUserId: vi.fn(),
  },
}));

vi.mock('../../repositories/gateway.repository', () => ({
  gatewayRepository: {
    getSupportsSubscriptions: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getGatewaysByCurrency: vi.fn().mockResolvedValue([{ id: 'mercadopago' }]),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {},
}));

vi.mock('../../services/payment/PaymentProviderFactory', () => ({
  PaymentProviderFactory: {
    getProvider: vi.fn().mockReturnValue({
      createSubscription: vi.fn().mockResolvedValue({
        initPoint: 'https://init.point',
        providerReference: 'preapproval-123',
      }),
    }),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {},
}));

vi.mock('../config/index', () => ({
  config: {
    db: { schema: 'public' },
  },
}));

import { subscriptionRepository } from '../../repositories/subscription.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSubscriptionLink', () => {
    it('should throw error if user has no payout methods', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([]);

      await expect(
        SubscriptionService.createSubscriptionLink(USER_ID, 'plan-1', 'test@test.com', 'mercadopago')
      ).rejects.toThrow('Debes configurar tu moneda de cobro');
    });

    it('should throw error if no compatible plan found', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue(null);

      await expect(
        SubscriptionService.createSubscriptionLink(USER_ID, 'plan-1', 'test@test.com', 'mercadopago')
      ).rejects.toThrow('No se encontró un plan compatible');
    });

    it('should create subscription link successfully', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue({
        id: 'plan-pro-ars',
        name: 'Pro ARS',
        amount: 1000,
        currency: 'ARS',
      } as any);

      const result = await SubscriptionService.createSubscriptionLink(
        USER_ID,
        'plan-pro-ars',
        'test@test.com',
        'mercadopago'
      );

      expect(result).toEqual({
        init_point: 'https://init.point',
        preapproval_id: 'preapproval-123',
      });
    });
  });
});
