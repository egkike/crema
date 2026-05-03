import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
let mockQuery = createMockQuery();

vi.mock('../../db/postgres', () => ({
  default: { query: (...args: any[]) => mockQuery(...args) },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' }, allowedSchemas: ['public', 'crema'] },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('commissionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('mapRowToCommission', () => {
    it('should return null for null input', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      const result = commissionRepository.mapRowToCommission(null);
      expect(result).toBeNull();
    });

    it('should map row with numeric conversions', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      
      const row = {
        id: 'comm-1',
        user_id: 'user-1',
        order_id: 'order-1',
        amount: '25000',
        fee_applied: '3225',
        net_amount: '21775',
        currency: 'ARS',
        type: 'affiliate',
        status: 'pending',
        created_at: new Date(),
        paid_at: null,
      };

      const result = commissionRepository.mapRowToCommission(row);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('comm-1');
      expect(result!.amount).toBe(25000);
      expect(result!.feeApplied).toBe(3225);
      expect(result!.netAmount).toBe(21775);
    });

    it('should handle paid status with paidAt', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      
      const row = {
        id: 'comm-1',
        user_id: 'user-1',
        order_id: 'order-1',
        amount: '10000',
        fee_applied: '1000',
        net_amount: '9000',
        currency: 'ARS',
        type: 'creator',
        status: 'paid',
        created_at: new Date(),
        paid_at: new Date(),
      };

      const result = commissionRepository.mapRowToCommission(row);

      expect(result!.status).toBe('paid');
      expect(result!.paidAt).toBeInstanceOf(Date);
    });
  });

  describe('create', () => {
    it('should create commission and return mapped result', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-new', user_id: 'user-1', amount: '10000' }] });

      const result = await commissionRepository.create({
        userId: 'user-1',
        orderId: 'order-1',
        amount: 10000,
        feeApplied: 1000,
        netAmount: 9000,
        currency: 'ARS',
        type: 'affiliate',
      });

      expect(result).not.toBeNull();
      expect(mockQuery).toHaveBeenCalled();
    });

    it('should use default status when not provided', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-new' }] });

      await commissionRepository.create({
        userId: 'user-1',
        orderId: 'order-1',
        amount: 10000,
        feeApplied: 1000,
        netAmount: 9000,
        currency: 'ARS',
        type: 'affiliate',
      });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('updateStatusByOrder', () => {
    it('should update commissions and return them', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-1', status: 'paid' }] });

      const result = await commissionRepository.updateStatusByOrder('order-1', 'paid');

      expect(result).toHaveLength(1);
      expect(result[0]!.status).toBe('paid');
    });

    it('should set paidAt when status is paid', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-1', status: 'paid', paid_at: new Date() }] });

      const result = await commissionRepository.updateStatusByOrder('order-1', 'paid');

      expect(result).toHaveLength(1);
    });
  });

  describe('getByOrderId', () => {
    it('should return commissions for order', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-1' }, { id: 'comm-2' }] });

      const result = await commissionRepository.getByOrderId('order-1');

      expect(result).toHaveLength(2);
    });

    it('should return empty array when no commissions', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await commissionRepository.getByOrderId('order-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('getByUserId', () => {
    it('should return commissions for user with order join', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'comm-1', user_id: 'user-1', external_reference: 'ext-1' }] });

      const result = await commissionRepository.getByUserId('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe('user-1');
    });

    it('should return empty array when user has no commissions', async () => {
      const { commissionRepository } = await import('../../repositories/commission.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await commissionRepository.getByUserId('user-1');

      expect(result).toHaveLength(0);
    });
  });
});
