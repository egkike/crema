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

describe('payoutRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
  });

  describe('mapRow', () => {
    it('should return null for null input', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      const result = payoutRepository.mapRow(null);
      expect(result).toBeNull();
    });

    it('should map row with numeric conversions', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      
      const row = { id: 'payout-1', amount: '10000', currency: 'ARS', status: 'pending' };
      const result = payoutRepository.mapRow(row);

      expect(result).not.toBeNull();
      expect(result!.amount).toBe(10000);
    });
  });

  describe('create', () => {
    it('should create payout request', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      const mockClient = { query: vi.fn().mockResolvedValue({ rows: [{ id: 'payout-1', amount: '10000' }] }) };

      const result = await payoutRepository.create({
        userId: 'user-1',
        amount: 10000,
        currency: 'ARS',
        destination_account: '12345678',
        bank_name: 'Banco Galicia',
        account_holder: 'John Doe',
      }, mockClient as any);

      expect(result).not.toBeNull();
    });
  });

  describe('getById', () => {
    // payoutRepository no tiene getById directo - usa getByIdForUpdate con client
    // Testeamos getByUserId que sí existe
    it('should return payouts for user', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'payout-1', amount: '10000' }] });

      const result = await payoutRepository.getByUserId('user-1');

      expect(result).toHaveLength(1);
    });

    it('should return empty array when no payouts', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await payoutRepository.getByUserId('user-1');

      expect(result).toHaveLength(0);
    });
  });

  describe('updateStatus', () => {
    it('should update payout status', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'payout-1', status: 'completed' }] });

      const result = await payoutRepository.updateStatus('payout-1', 'completed', null, null, 'admin-1');

      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });

    it('should throw when status requires admin_id', async () => {
      const { payoutRepository } = await import('../../repositories/payout.repository');

      await expect(payoutRepository.updateStatus('payout-1', 'completed', ''))
        .rejects.toThrow('admin_id');
    });
  });
});
