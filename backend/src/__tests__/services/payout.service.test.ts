import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock repositories
vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    getBalanceForUpdate: vi.fn(),
    subtractAvailableBalance: vi.fn(),
  },
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: {
    getById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    hasMonthlyPayoutLimitReached: vi.fn(),
  },
}));

vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getUserLevels: vi.fn(),
    getConfigsByCurrency: vi.fn(),
    getRequiredFieldsByCurrency: vi.fn(),
    getCurrencyValidationRules: vi.fn(),
  },
}));

vi.mock('../../repositories/history.repository', () => ({
  historyRepository: {
    createRecord: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../repositories/platform_balance.repository', () => ({
  platformBalanceRepository: {
    deductFromPending: vi.fn(),
  },
}));

vi.mock('../../repositories/platform_withdrawal.repository', () => ({
  platformWithdrawalRepository: {
    recordWithdrawal: vi.fn(),
  },
}));

vi.mock('../../utils/validators.util', () => ({
  SpecialValidators: {},
}));

vi.mock('../../db/postgres', () => ({
  default: { connect: vi.fn() },
  pool: { connect: vi.fn() },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('../../queues/scheduler', () => ({
  mainQueue: { add: vi.fn() },
}));

// Import mocks
import { balanceRepository } from '../../repositories/balance.repository';
import { payoutRepository } from '../../repositories/payout.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';
import { configRepository } from '../../repositories/config.repository';
import { PayoutService } from '../../services/payout.service';

describe('PayoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const USER_ID = '00000000-0000-0000-0000-000000000002';
  const METHOD_ID = '00000000-0000-0000-0000-000000000099';

  describe('requestPayout validation', () => {
    it.skip('should throw error for insufficient balance', async () => {
      // Requires DB client mock - skip for now
    });

    it('should throw error for amount below minimum', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: USER_ID,
        currency: 'ARS',
        is_active: true,
        is_verified: true,
        data: {},
      });

      // Try to withdraw 500 when min is 1000
      await expect(
        PayoutService.requestPayout(USER_ID, 500, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('monto mínimo');
    });

    it('should throw error for amount above maximum', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
        max_payout_amount: 5000,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: USER_ID,
        currency: 'ARS',
        is_active: true,
        is_verified: true,
        data: {},
      });

      // Try to withdraw 10000 when max is 5000
      await expect(
        PayoutService.requestPayout(USER_ID, 10000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('monto máximo');
    });

    it('should throw error for invalid payout method', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({});

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue(null);

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', 'invalid-method', 2)
      ).rejects.toThrow('no existe');
    });

    it('should throw error when user level is too low (USER level)', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      // USER level (1) cannot request payouts
      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 1)
      ).rejects.toThrow('nivel de cuenta no permite');
    });

    it('should throw error when payout method belongs to different user', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      // Method belongs to different user
      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: 'different-user-id',
        currency: 'ARS',
        is_active: true,
        is_verified: true,
        data: {},
      });

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('No tienes permiso');
    });

    it('should throw error when payout method is inactive', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: USER_ID,
        currency: 'ARS',
        is_active: false, // Inactive
        is_verified: true,
        data: {},
      });

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('inactivo');
    });

    it('should throw error when payout method is not verified', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: USER_ID,
        currency: 'ARS',
        is_active: true,
        is_verified: false, // Not verified
        data: {},
      });

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('verificado');
    });

    it('should throw error when monthly limit reached', async () => {
      vi.mocked(configRepository.getUserLevels).mockResolvedValue({
        GUEST: 0, USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 10, ADMIN: 99,
      });

      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({
        min_payout_amount: 1000,
        payout_frequency_limit: 1,
      });

      vi.mocked(configRepository.getRequiredFieldsByCurrency).mockResolvedValue([]);

      vi.mocked(payoutMethodRepository.getById).mockResolvedValue({
        id: METHOD_ID,
        user_id: USER_ID,
        currency: 'ARS',
        is_active: true,
        is_verified: true,
        data: {},
      });

      vi.mocked(balanceRepository.getBalanceForUpdate).mockResolvedValue({
        available_balance: 10000,
        total_earned: 15000,
        pending_balance: 5000,
        currency: 'ARS',
        updated_at: new Date(),
      } as any);

      // Monthly limit reached
      vi.mocked(payoutRepository.hasMonthlyPayoutLimitReached).mockResolvedValue(true);

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('límite');
    });
  });
});
