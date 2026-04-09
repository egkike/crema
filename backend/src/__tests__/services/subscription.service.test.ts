import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID } from '../setup';
 
import { SubscriptionService } from '../../services/subscription.service';

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getPlanById: vi.fn(),
    getActiveSubscription: vi.fn(),
    upgradeUserPlan: vi.fn(),
    recordSubscriptionEarning: vi.fn(),
    forceDowngrade: vi.fn(),
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
    getCurrencyValidationRules: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
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
  EmailService: {
    sendDowngradeNotification: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../config/index', () => ({
  config: {
    db: { schema: 'public' },
  },
}));

import { subscriptionRepository } from '../../repositories/subscription.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';
import { userRepository } from '../../repositories/user.repository';
import { configRepository } from '../../repositories/config.repository';
import { gatewayRepository } from '../../repositories/gateway.repository';

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

    it('should throw error if gateway not supported for currency', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue({
        id: 'plan-pro-ars',
        name: 'Pro ARS',
        amount: 1000,
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getGatewaysByCurrency).mockResolvedValue([]);

      await expect(
        SubscriptionService.createSubscriptionLink(USER_ID, 'plan-pro-ars', 'test@test.com', 'mercadopago')
      ).rejects.toThrow('no es válida');
    });

    it('should throw error if gateway does not support subscriptions', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue({
        id: 'plan-pro-ars',
        name: 'Pro ARS',
        amount: 1000,
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getGatewaysByCurrency).mockResolvedValue([{ id: 'mercadopago' }]);
      vi.mocked(gatewayRepository.getSupportsSubscriptions).mockResolvedValue(false);

      await expect(
        SubscriptionService.createSubscriptionLink(USER_ID, 'plan-pro-ars', 'test@test.com', 'mercadopago')
      ).rejects.toThrow('no soporta suscripciones recurrentes');
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
      vi.mocked(configRepository.getGatewaysByCurrency).mockResolvedValue([{ id: 'mercadopago' }]);
      vi.mocked(gatewayRepository.getSupportsSubscriptions).mockResolvedValue(true);

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

  describe('handleSubscriptionPayment', () => {
    it('should throw error if plan not found', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue(null);

      await expect(
        SubscriptionService.handleSubscriptionPayment(USER_ID, 'plan-1', 'sub-123')
      ).rejects.toThrow('Plan no encontrado');
    });

    it('should process payment without tax when tax disabled', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue({
        id: 'plan-pro-ars',
        name: 'Pro ARS',
        amount: 1000,
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getCurrencyValidationRules).mockResolvedValue({
        tax_config: { enabled: false },
      });
      vi.mocked(subscriptionRepository.upgradeUserPlan).mockResolvedValue(undefined);
      vi.mocked(subscriptionRepository.recordSubscriptionEarning).mockResolvedValue(undefined);

      await SubscriptionService.handleSubscriptionPayment(
        USER_ID,
        'plan-pro-ars',
        'sub-123',
        50,
        10
      );

      expect(subscriptionRepository.upgradeUserPlan).toHaveBeenCalled();
      expect(subscriptionRepository.recordSubscriptionEarning).toHaveBeenCalled();
    });

    it('should process payment with tax when tax enabled (inside)', async () => {
      vi.mocked(payoutMethodRepository.getByUserId).mockResolvedValue([
        { id: 'method-1', currency: 'ARS' },
      ]);
      vi.mocked(subscriptionRepository.getPlanById).mockResolvedValue({
        id: 'plan-pro-ars',
        name: 'Pro ARS',
        amount: 1210,
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getCurrencyValidationRules).mockResolvedValue({
        tax_config: { enabled: true, calculation: 'inside', tax_factor: 1.21 },
      });
      vi.mocked(subscriptionRepository.upgradeUserPlan).mockResolvedValue(undefined);
      vi.mocked(subscriptionRepository.recordSubscriptionEarning).mockResolvedValue(undefined);

      await SubscriptionService.handleSubscriptionPayment(
        USER_ID,
        'plan-pro-ars',
        'sub-123',
        50,
        10
      );

      // 1210 / 1.21 = 1000 (net), VAT = 210, netProfit = 1000 - 50 - 10 = 940
      expect(subscriptionRepository.recordSubscriptionEarning).toHaveBeenCalledWith(
        1210, 'ARS', 940, 50, 10, 210
      );
    });
  });

  describe('cancelSubscription', () => {
    it('should return message if no active subscription', async () => {
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(subscriptionRepository.forceDowngrade).mockResolvedValue(undefined);

      const result = await SubscriptionService.cancelSubscription(USER_ID);

      expect(result.message).toBe('No se encontró una suscripción activa.');
      expect(subscriptionRepository.forceDowngrade).toHaveBeenCalledWith(USER_ID);
    });

    it('should cancel subscription and downgrade user', async () => {
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        user_id: USER_ID,
        gateway_subscription_id: 'mp-sub-123',
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getGatewaysByCurrency).mockResolvedValue([{ id: 'mercadopago' }]);
      vi.mocked(subscriptionRepository.forceDowngrade).mockResolvedValue(undefined);
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'test@test.com',
        fullname: 'Test User',
      } as any);

      const result = await SubscriptionService.cancelSubscription(USER_ID);

      expect(result.message).toBe('Suscripción cancelada exitosamente');
      expect(subscriptionRepository.forceDowngrade).toHaveBeenCalledWith(USER_ID);
    });

    it('should handle provider cancelSubscription not available', async () => {
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        user_id: USER_ID,
        gateway_subscription_id: 'mp-sub-123',
        currency: 'ARS',
      } as any);
      vi.mocked(configRepository.getGatewaysByCurrency).mockResolvedValue([{ id: 'simulator' }]);
      vi.mocked(subscriptionRepository.forceDowngrade).mockResolvedValue(undefined);
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'test@test.com',
        fullname: 'Test User',
      } as any);

      const result = await SubscriptionService.cancelSubscription(USER_ID);

      expect(result.message).toBe('Suscripción cancelada exitosamente');
    });
  });
});
