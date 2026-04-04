import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
const createMockConnect = () => vi.fn();
let mockQuery = createMockQuery();
let mockConnect = createMockConnect();

vi.mock('../../db/postgres', () => ({
  default: { 
    query: (...args: any[]) => mockQuery(...args),
    connect: (() => ({ query: mockConnect, release: vi.fn(), query: mockConnect })) 
  },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' } },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('subscriptionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
    mockConnect = createMockConnect();
  });

  describe('createInitialSubscription', () => {
    it('should create initial subscription', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'sub-1', user_id: 'user-1', status: 'active' }] });

      const result = await subscriptionRepository.createInitialSubscription('user-1', 'plan-1', 'ARS');

      expect(result).not.toBeNull();
      expect(result.status).toBe('active');
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should handle database error', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockRejectedValue(new Error('DB error'));

      await expect(subscriptionRepository.createInitialSubscription('user-1', 'plan-1', 'ARS'))
        .rejects.toThrow('DB error');
    });
  });

  describe('getActiveSubscription', () => {
    it('should return active subscription', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'sub-1', user_id: 'user-1', status: 'active', plan_name: 'Pro' }] });

      const result = await subscriptionRepository.getActiveSubscription('user-1');

      expect(result).not.toBeNull();
      expect(result!.plan_name).toBe('Pro');
    });

    it('should return null when no active subscription', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await subscriptionRepository.getActiveSubscription('user-1');

      expect(result).toBeNull();
    });
  });

  describe('getUserStorageUsage', () => {
    it('should return total storage in bytes', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [{ total: '1024000' }] });

      const result = await subscriptionRepository.getUserStorageUsage('user-1');

      expect(result).toBe(1024000);
    });

    it('should return 0 when no products', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [{ total: null }] });

      const result = await subscriptionRepository.getUserStorageUsage('user-1');

      expect(result).toBe(0);
    });
  });

  describe('getPlanById', () => {
    it('should return plan with price', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'plan-1', name: 'Pro', amount: 10000, currency: 'ARS' }] });

      const result = await subscriptionRepository.getPlanById('plan-1', 'ARS');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Pro');
    });

    it('should return null when plan not found', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await subscriptionRepository.getPlanById('not-found', 'ARS');

      expect(result).toBeNull();
    });

    it('should return null for inactive plan', async () => {
      const { subscriptionRepository } = await import('../../repositories/subscription.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await subscriptionRepository.getPlanById('inactive-plan', 'ARS');

      expect(result).toBeNull();
    });
  });
});
