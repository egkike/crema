import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool - use a mutable reference
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

describe('orderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Recreate mock for each test to avoid hoisting issues
    mockQuery = createMockQuery();
  });

  describe('mapRowToOrder', () => {
    it('should return null for null input', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      const result = orderRepository.mapRowToOrder(null);
      expect(result).toBeNull();
    });

    it('should map row with numeric conversions', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      
      const row = {
        id: 'order-1',
        buyer_id: 'user-1',
        product_id: 'prod-1',
        amount: '100.00',
        commission_amount: '10.00',
        gateway_fee: '2.50',
        gateway_tax: '1.00',
        gateway_taxes_detail: null,
        net_platform_profit: '86.50',
        is_guarantee_eligible: 'true',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        release_at: null,
        days_of_guarantee_applied: '7',
      };

      const result = orderRepository.mapRowToOrder(row);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('order-1');
      expect(result!.amount).toBe(100);
      expect(result!.commission_amount).toBe(10);
      expect(result!.gateway_fee).toBe(2.5);
      expect(result!.is_guarantee_eligible).toBe(true);
    });

    it('should calculate release_date when release_at null', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      
      const row = {
        id: 'order-1',
        buyer_id: 'user-1',
        product_id: 'prod-1',
        amount: '100',
        commission_amount: '0',
        gateway_fee: '0',
        gateway_tax: '0',
        gateway_taxes_detail: null,
        net_platform_profit: '0',
        is_guarantee_eligible: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        release_at: null,
        days_of_guarantee_applied: 7,
      };

      const result = orderRepository.mapRowToOrder(row);

      expect(result!.release_date).toBeInstanceOf(Date);
      expect(result!.release_date!.toDateString()).toBe(new Date('2024-01-08').toDateString());
    });

    it('should preserve release_date from release_at', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      
      const row = {
        id: 'order-1',
        buyer_id: 'user-1',
        product_id: 'prod-1',
        amount: '100',
        commission_amount: '0',
        gateway_fee: '0',
        gateway_tax: '0',
        gateway_taxes_detail: null,
        net_platform_profit: '0',
        is_guarantee_eligible: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        release_at: '2024-01-15T00:00:00Z',
        days_of_guarantee_applied: 7,
      };

      const result = orderRepository.mapRowToOrder(row);

      expect(result!.release_date!.toDateString()).toBe(new Date('2024-01-15').toDateString());
    });
  });

  describe('getByExternalRef', () => {
    it('should return order when found', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1', external_reference: 'ext-123' }] });

      const result = await orderRepository.getByExternalRef('ext-123');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('order-1');
    });

    it('should return null when not found', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await orderRepository.getByExternalRef('not-found');

      expect(result).toBeNull();
    });
  });

  describe('checkAccess', () => {
    it('should return true when has paid order', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1' }] });

      const result = await orderRepository.checkAccess('user-1', 'prod-1');

      expect(result).toBe(true);
    });

    it('should return false when no paid order', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await orderRepository.checkAccess('user-1', 'prod-1');

      expect(result).toBe(false);
    });
  });

  describe('verifyAccess', () => {
    it('should return isOwner and hasPaid', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ isOwner: true, hasPaid: false }] });

      const result = await orderRepository.verifyAccess('user-1', 'prod-1');

      expect(result).toEqual({ isOwner: true, hasPaid: false });
    });

    it('should return false/false when product not found', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await orderRepository.verifyAccess('user-1', 'prod-1');

      expect(result).toEqual({ isOwner: false, hasPaid: false });
    });
  });

  describe('getActiveOrder', () => {
    it('should return active order', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1', status: 'paid' }] });

      const result = await orderRepository.getActiveOrder('user-1', 'prod-1');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await orderRepository.getActiveOrder('user-1', 'prod-1');

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update and return order', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1', status: 'paid' }] });

      const result = await orderRepository.updateStatus('order-1', 'paid');

      expect(result).not.toBeNull();
    });
  });

  describe('getById', () => {
    it('should return order with creator_id', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1', creator_id: 'user-1' }] });

      const result = await orderRepository.getById('order-1');

      expect(result).not.toBeNull();
      expect(result!.creator_id).toBe('user-1');
    });
  });

  describe('invalidateGuarantee', () => {
    it('should return order when updated', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'order-1', is_guarantee_eligible: false }] });

      const result = await orderRepository.invalidateGuarantee('order-1');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { orderRepository } = await import('../../repositories/order.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await orderRepository.invalidateGuarantee('order-1');

      expect(result).toBeNull();
    });
  });
});
