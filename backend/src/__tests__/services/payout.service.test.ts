import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool - using factory function
const mockClient = { query: vi.fn(), release: vi.fn() };
vi.mock('../../db/postgres', () => ({
  default: { connect: () => Promise.resolve(mockClient) },
  pool: { connect: () => Promise.resolve(mockClient) },
}));

// Mock repositories
vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    getBalanceForUpdate: vi.fn(),
    subtractAvailableBalance: vi.fn(),
    addAvailableBalance: vi.fn(),
  },
}));

vi.mock('../../repositories/payout.repository', () => ({
  payoutRepository: {
    getById: vi.fn(),
    getByIdForUpdate: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    hasMonthlyPayoutLimitReached: vi.fn(),
    countByStatus: vi.fn(),
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
    getEnabledCurrencies: vi.fn(),
  },
}));

vi.mock('../../repositories/history.repository', () => ({
  historyRepository: {
    createRecord: vi.fn(),
    createRecordWithClient: vi.fn(),
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
    deductFromAvailable: vi.fn(),
    getAvailable: vi.fn(),
  },
}));

vi.mock('../../repositories/platform_withdrawal.repository', () => ({
  platformWithdrawalRepository: {
    recordWithdrawal: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../../utils/validators.util', () => ({
  SpecialValidators: {},
}));

vi.mock('../../utils/rounder.util', () => ({
  roundToTwo: (n: number) => Math.round(n * 100) / 100,
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
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
        is_active: false,
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
        is_verified: false,
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

      vi.mocked(payoutRepository.hasMonthlyPayoutLimitReached).mockResolvedValue(true);

      await expect(
        PayoutService.requestPayout(USER_ID, 2000, 'ARS', METHOD_ID, 2)
      ).rejects.toThrow('límite');
    });
  });

  describe('cancelUserPayout', () => {
    it('should throw when payout not found', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue(null);

      await expect(PayoutService.cancelUserPayout('payout-1', USER_ID))
        .rejects.toThrow('No encontrado');
    });

    it('should throw when payout belongs to different user', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue({
        id: 'payout-1',
        user_id: 'other-user',
        status: 'pending',
        amount: 1000,
        currency: 'ARS',
      });

      await expect(PayoutService.cancelUserPayout('payout-1', USER_ID))
        .rejects.toThrow('No autorizado');
    });

    it('should throw when payout is not pending', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue({
        id: 'payout-1',
        user_id: USER_ID,
        status: 'completed',
        amount: 1000,
        currency: 'ARS',
      });

      await expect(PayoutService.cancelUserPayout('payout-1', USER_ID))
        .rejects.toThrow('No es anulable');
    });
  });

  describe('updatePayoutStatus', () => {
    it('should throw when payout not found', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue(null);

      await expect(PayoutService.updatePayoutStatus('payout-1', 'completed', 'admin-1'))
        .rejects.toThrow('No encontrado');
    });

    it('should throw when payout already processed', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue({
        id: 'payout-1',
        status: 'completed',
        user_id: USER_ID,
        amount: 1000,
        currency: 'ARS',
      });

      await expect(PayoutService.updatePayoutStatus('payout-1', 'completed', 'admin-1'))
        .rejects.toThrow('Ya procesado');
    });

    it('should throw when completing without transaction receipt', async () => {
      vi.mocked(payoutRepository.getByIdForUpdate).mockResolvedValue({
        id: 'payout-1',
        status: 'pending',
        user_id: USER_ID,
        amount: 1000,
        currency: 'ARS',
      });

      await expect(
        PayoutService.updatePayoutStatus('payout-1', 'completed', 'admin-1', undefined, '')
      ).rejects.toThrow('Falta comprobante');
    });
  });

  describe('checkPlatformLiquidity', () => {
    it('should return empty when currencies have sufficient balance', async () => {
      vi.mocked(configRepository.getEnabledCurrencies).mockResolvedValue([{ code: 'ARS' }]);
      const { platformBalanceRepository } = await import('../../repositories/platform_balance.repository');
      vi.mocked(platformBalanceRepository.getAvailable).mockResolvedValue(100000);
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({ min_payout_amount: 1000 });

      const alerts = await PayoutService.checkPlatformLiquidity();

      expect(alerts).toHaveLength(0);
    });

    it('should return alert when balance below threshold', async () => {
      vi.mocked(configRepository.getEnabledCurrencies).mockResolvedValue([{ code: 'ARS' }]);
      const { platformBalanceRepository } = await import('../../repositories/platform_balance.repository');
      vi.mocked(platformBalanceRepository.getAvailable).mockResolvedValue(500);
      vi.mocked(configRepository.getConfigsByCurrency).mockResolvedValue({ min_payout_amount: 1000 });

      const alerts = await PayoutService.checkPlatformLiquidity();

      expect(alerts).toHaveLength(1);
      expect(alerts[0].currency).toBe('ARS');
    });
  });

  describe('notifyAdminPendingPayouts', () => {
    it('should return count 0 when no pending', async () => {
      vi.mocked(payoutRepository.countByStatus).mockResolvedValue(0);

      const result = await PayoutService.notifyAdminPendingPayouts();

      expect(result.pendingCount).toBe(0);
    });

    it('should send email when pending exist', async () => {
      vi.mocked(payoutRepository.countByStatus).mockResolvedValue(5);
      const { mainQueue } = await import('../../queues/scheduler');

      const result = await PayoutService.notifyAdminPendingPayouts();

      expect(result.pendingCount).toBe(5);
      expect(vi.mocked(mainQueue.add)).toHaveBeenCalled();
    });
  });
});