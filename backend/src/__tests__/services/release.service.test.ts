import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID, CREATOR_ID, ORDER_ID } from '../setup';
import { ReleaseService } from '../../services/release.service';
import { balanceRepository } from '../../repositories/balance.repository';
import { commissionRepository } from '../../repositories/commission.repository';
import { userRepository } from '../../repositories/user.repository';
import pool from '../../db/postgres';
import { mainQueue } from '../../queues/scheduler';

vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    releaseBalance: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/commission.repository', () => ({
  commissionRepository: {
    getByOrderId: vi.fn(),
    updateStatusByOrder: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/history.repository', () => ({
  historyRepository: {
    createRecordWithClient: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/platform_balance.repository', () => ({
  platformBalanceRepository: {
    ensureBalanceExists: vi.fn().mockResolvedValue(true),
    releaseBalance: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
    redis: { host: 'localhost', port: 6379 },
  },
}));

vi.mock('../../config/redis', () => ({
  redisConnection: {
    host: 'localhost',
    port: 6379,
  },
}));

vi.mock('../../db/postgres', () => {
  const mockClient = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };
  
  return {
    default: {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      connect: vi.fn().mockResolvedValue(mockClient),
    },
  };
});

vi.mock('../../queues/scheduler', () => ({
  mainQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

vi.mock('../../utils/rounder.util', () => ({
  roundToTwo: vi.fn((n: number) => Math.round(n * 100) / 100),
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendBalanceReleasedEmail: vi.fn().mockResolvedValue(true),
  },
}));

describe('ReleaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processPendingBalances', () => {
    it('should return empty stats when no orders to release', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

      const result = await ReleaseService.processPendingBalances();

      expect(result).toEqual({
        count: 0,
        releasedToUsers: {},
        releasedToPlatform: {},
      });
      expect(pool.query).toHaveBeenCalled();
    });

    it('should skip commission if already released', async () => {
      const mockOrder = {
        id: ORDER_ID,
        amount: 10000,
        currency: 'ARS',
        release_at: new Date(),
        creator_id: CREATOR_ID,
      };

      const mockCommissions = [
        {
          id: 'comm-1',
          userId: CREATOR_ID,
          netAmount: 7000,
          status: 'paid', // Already released
        },
      ];

      vi.mocked(pool.query).mockResolvedValue({ rows: [mockOrder] } as any);
      vi.mocked(commissionRepository.getByOrderId).mockResolvedValue(mockCommissions as any);

      const result = await ReleaseService.processPendingBalances();

      // Should not release balance since status is 'paid'
      expect(balanceRepository.releaseBalance).not.toHaveBeenCalled();
      expect(result.releasedToUsers['ARS']).toBeUndefined();
    });
  });

  describe('notifyUser', () => {
    it('should enqueue email when queue is available', async () => {
      const mockUser = {
        id: USER_ID,
        email: 'test@test.com',
        fullname: 'Test User',
      };

      vi.mocked(userRepository.getById).mockResolvedValue(mockUser as any);

      await ReleaseService.notifyUser(USER_ID, 5000, 'ARS');

      expect(mainQueue!.add).toHaveBeenCalledWith(
        'send-email',
        expect.objectContaining({
          type: 'BALANCE_RELEASED',
          to: 'test@test.com',
          data: expect.objectContaining({
            fullname: 'Test User',
            amount: 5000,
            currency: 'ARS',
          }),
        }),
        expect.any(Object)
      );
    });

    it('should do nothing if user not found', async () => {
      vi.mocked(userRepository.getById).mockResolvedValue(null);

      await ReleaseService.notifyUser(USER_ID, 5000, 'ARS');

      expect(mainQueue!.add).not.toHaveBeenCalled();
    });
  });

  // Method existence tests
  describe('method existence', () => {
    it('should have processPendingBalances method', () => {
      expect(typeof ReleaseService.processPendingBalances).toBe('function');
    });

    it('should have notifyUser method', () => {
      expect(typeof ReleaseService.notifyUser).toBe('function');
    });
  });
});
