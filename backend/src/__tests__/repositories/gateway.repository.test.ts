import { describe, it, expect, vi, beforeEach } from 'vitest';

import { gatewayRepository } from '../../repositories/gateway.repository';

// Mock de la DB
const mockQuery = vi.fn();
vi.mock('../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('gatewayRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getLiquidityDays', () => {
    it('should return liquidity days for a gateway', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ liquidity_delay_days: 30 }] });

      const result = await gatewayRepository.getLiquidityDays('mercadopago');

      expect(result).toBe(30);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('liquidity_delay_days'),
        ['mercadopago']
      );
    });

    it('should return 0 when gateway not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await gatewayRepository.getLiquidityDays('unknown');

      expect(result).toBe(0);
    });

    it('should return 0 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await gatewayRepository.getLiquidityDays('mercadopago');

      expect(result).toBe(0);
    });
  });

  describe('getById', () => {
    it('should return gateway info including supports_refunds and supports_subscriptions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'blockonomics',
            name: 'Crypto (USDT)',
            liquidity_delay_days: 0,
            is_active: true,
            supports_refunds: false,
            supports_subscriptions: false,
          },
        ],
      });

      const result = await gatewayRepository.getById('blockonomics');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('blockonomics');
      expect(result?.supports_refunds).toBe(false);
      expect(result?.supports_subscriptions).toBe(false);
    });

    it('should return null when gateway not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await gatewayRepository.getById('unknown');

      expect(result).toBeNull();
    });
  });

  describe('getSupportsRefunds', () => {
    it('should return false for blockonomics', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ supports_refunds: false }] });

      const result = await gatewayRepository.getSupportsRefunds('blockonomics');

      expect(result).toBe(false);
    });

    it('should return true for mercadopago', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ supports_refunds: true }] });

      const result = await gatewayRepository.getSupportsRefunds('mercadopago');

      expect(result).toBe(true);
    });

    it('should default to true when gateway not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await gatewayRepository.getSupportsRefunds('unknown');

      expect(result).toBe(true);
    });

    it('should default to true on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await gatewayRepository.getSupportsRefunds('blockonomics');

      expect(result).toBe(true);
    });
  });

  describe('getSupportsSubscriptions', () => {
    it('should return false for blockonomics', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ supports_subscriptions: false }] });

      const result = await gatewayRepository.getSupportsSubscriptions('blockonomics');

      expect(result).toBe(false);
    });

    it('should return true for mercadopago', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ supports_subscriptions: true }] });

      const result = await gatewayRepository.getSupportsSubscriptions('mercadopago');

      expect(result).toBe(true);
    });

    it('should default to true when gateway not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await gatewayRepository.getSupportsSubscriptions('unknown');

      expect(result).toBe(true);
    });
  });
});
