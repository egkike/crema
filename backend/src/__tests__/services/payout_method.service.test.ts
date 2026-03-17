import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID } from '../setup';
// eslint-disable-next-line import/order
import { PayoutMethodService } from '../../services/payout_method.service';

vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {},
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: {
    getByStatusAndUser: vi.fn(),
  },
}));

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    countActiveByCreatorAndCurrency: vi.fn(),
  },
}));

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {
    getActiveSubscription: vi.fn(),
  },
}));

vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    getByUserIdAndCurrency: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getRequiredFieldsByCurrency: vi.fn(),
    getCurrencyValidationRules: vi.fn(),
  },
}));

vi.mock('../../utils/validators.util', () => ({
  SpecialValidators: {},
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {},
}));

vi.mock('../config/index', () => ({
  config: {
    jwt: { secret: 'test-secret' },
  },
}));

import { payoutRepository } from '../../repositories/payout.repository';
import { productRepository } from '../../repositories/product.repository';
import { subscriptionRepository } from '../../repositories/subscription.repository';
import { balanceRepository } from '../../repositories/balance.repository';
import { userRepository } from '../../repositories/user.repository';
import { configRepository } from '../../repositories/config.repository';

describe('PayoutMethodService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestChange', () => {
    it('should throw error if user has pending payouts', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([
        { id: 'payout-1', status: 'pending' },
      ] as any);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'ARS', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('No puedes modificar tus métodos de cobro mientras tengas retiros pendientes');
    });

    it('should throw error if user has active products in currency', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([]);
      vi.mocked(productRepository.countActiveByCreatorAndCurrency).mockResolvedValue(5);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'ARS', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('tienes 5 productos activos usándola');
    });

    it('should throw error if subscription depends on currency', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([]);
      vi.mocked(productRepository.countActiveByCreatorAndCurrency).mockResolvedValue(0);
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        currency: 'ARS',
        status: 'active',
      } as any);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'ARS', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('es la base de tu suscripción actual');
    });

    it('should throw error if user has pending balance in currency', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([]);
      vi.mocked(productRepository.countActiveByCreatorAndCurrency).mockResolvedValue(0);
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(balanceRepository.getByUserIdAndCurrency).mockResolvedValue({
        pending_balance: 1000,
      } as any);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'ARS', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('Tienes saldos pendientes de liberación');
    });

    it('should throw error if user not found', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([]);
      vi.mocked(productRepository.countActiveByCreatorAndCurrency).mockResolvedValue(0);
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(balanceRepository.getByUserIdAndCurrency).mockResolvedValue(null as any);
      vi.mocked(userRepository.getById).mockResolvedValue(null);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'ARS', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('should throw error if currency not configured', async () => {
      vi.mocked(payoutRepository.getByStatusAndUser).mockResolvedValue([]);
      vi.mocked(productRepository.countActiveByCreatorAndCurrency).mockResolvedValue(0);
      vi.mocked(subscriptionRepository.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(balanceRepository.getByUserIdAndCurrency).mockResolvedValue(null as any);
      vi.mocked(userRepository.getById).mockResolvedValue({ id: USER_ID } as any);
      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      await expect(
        PayoutMethodService.requestChange(USER_ID, 'INVALID', 'bank_transfer', { account: '123' })
      ).rejects.toThrow('no está configurada o no existe');
    });
  });
});
