import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID } from '../setup';
 
import { UserService } from '../../services/user.service';

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
    updUser: vi.fn(),
  },
}));

vi.mock('../../repositories/payout_method.repository', () => ({
  payoutMethodRepository: {
    upsert: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/config.repository', () => ({
  configRepository: {
    getUserLevels: vi.fn().mockResolvedValue({ USER: 1, AFFILIATE: 2, CREATOR: 3, STAFF: 99 }),
  },
}));

vi.mock('../../repositories/subscription.repository', () => ({
  subscriptionRepository: {},
}));

vi.mock('../../utils/validators.util', () => ({
  SpecialValidators: {
    ARS: {
      tax_id: vi.fn((v: string) => v && v.length > 5),
      cbu: vi.fn((v: string) => v && v.length === 22),
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendUpgradeSuccessEmail: vi.fn().mockResolvedValue(true),
  },
}));

import { userRepository } from '../../repositories/user.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';

describe('UserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upgradeLevel', () => {
    it('should throw error if user not found', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue(null);

      await expect(
        UserService.upgradeLevel(USER_ID, 2)
      ).rejects.toThrow('Usuario no encontrado');
    });

    it('should throw if trying to downgrade or keep same level', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        level: 3,
      } as any);

      await expect(
        UserService.upgradeLevel(USER_ID, 3)
      ).rejects.toThrow('No puedes bajar de nivel');
    });

    it('should throw if trying to upgrade to staff level', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        level: 1,
      } as any);

      await expect(
        UserService.upgradeLevel(USER_ID, 99)
      ).rejects.toThrow('no permitido para upgrade manual');
    });

    it('should require payout data for affiliate upgrade', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        level: 1,
      } as any);

      await expect(
        UserService.upgradeLevel(USER_ID, 2)
      ).rejects.toThrow('Es obligatorio configurar tu método de retiro');
    });

    it('should upgrade to affiliate with valid payout data', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        level: 1,
        email: 'test@test.com',
        fullname: 'Test User',
      } as any);
      vi.mocked(userRepository.updUser).mockResolvedValue({
        id: USER_ID,
        level: 2,
        email: 'test@test.com',
        fullname: 'Test User',
      } as any);

      const payoutData = {
        currency: 'ARS',
        type: 'bank_account' as const,
        data: {
          tax_id: '20304050607',
          account_number: '1234567890123456789012',
        },
      };

      const result = await UserService.upgradeLevel(USER_ID, 2, payoutData);

      expect(result).toBeDefined();
      expect(payoutMethodRepository.upsert).toHaveBeenCalled();
    });
  });
});
