import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BlockonomicsProvider } from '../../services/payment/providers/BlockonomicsProvider';

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    blockonomics: {
      apiKey: 'test_api_key',
      callbackUrl: 'https://test.crema.app/webhook',
      webhookSecret: 'test_secret',
    },
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

// Mock configService
vi.mock('../../services/config.service', () => ({
  configService: {
    get: vi.fn().mockResolvedValue(undefined),
    getNumber: vi.fn().mockResolvedValue(10000),
    getBoolean: vi.fn().mockResolvedValue(false),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BlockonomicsProvider', () => {
  let provider: BlockonomicsProvider;

  beforeEach(() => {
    provider = new BlockonomicsProvider();
    vi.clearAllMocks();
    // Skip clearing private static Map - test isolation handled by mock reset
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createPreference', () => {
    it('should return initPoint URL and providerReference with BTC address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ address: 'bc1qtest123' }),
      });

      const result = await provider.createPreference({
        product: { id: 'prod-123', title: 'Test Product' },
        amount: 100,
        currency: 'BTC',
        externalReference: 'order-456',
        email: 'user@test.com',
      });

      expect(result.initPoint).toContain('bc1qtest123');
      expect(result.initPoint).toContain('crypto=btc');
      expect(result.providerReference).toBe('bc1qtest123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.blockonomics.co/api/new_address',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test_api_key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ addr_count: 1, show_addr: true }),
        })
      );
    });

    it('should monitor USDT transaction when currency is USDT', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ address: '0xUSDTtest123' }),
        })
        .mockResolvedValueOnce({ ok: true });

      const result = await provider.createPreference({
        product: { id: 'prod-123', title: 'Test Product' },
        amount: 50,
        currency: 'USDT',
        externalReference: 'order-789',
        email: 'user@test.com',
      });

      expect(result.providerReference).toBe('0xUSDTtest123');
      expect(result.initPoint).toContain('crypto=usdt');

      // Verify monitor-tx was called with order_ref in callback_url
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.blockonomics.co/api/monitor-tx',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            addr: '0xUSDTtest123',
            order_id: 'order-789',
            callback_url: 'https://test.crema.app/webhook?order_ref=order-789',
          }),
        })
      );
    });

    it('should throw AppError when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      });

      await expect(
        provider.createPreference({
          product: { id: 'prod-123' },
          amount: 100,
          currency: 'BTC',
          externalReference: 'order-123',
          email: 'user@test.com',
        })
      ).rejects.toThrow('Error al crear preferencia de pago crypto');
    });

    it('should throw AppError when no address returned', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ address: null }),
      });

      await expect(
        provider.createPreference({
          product: { id: 'prod-123' },
          amount: 100,
          currency: 'BTC',
          externalReference: 'order-123',
          email: 'user@test.com',
        })
      ).rejects.toThrow('Error al crear preferencia de pago crypto');
    });

    it('should include 10s timeout in fetch request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ address: 'bc1qtimeout' }),
      });

      await provider.createPreference({
        product: { id: 'prod-123' },
        amount: 100,
        currency: 'BTC',
        externalReference: 'order-123',
        email: 'user@test.com',
      });

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBeDefined();
      expect(fetchOptions.signal).toBeInstanceOf(AbortSignal);
    });

    it('should throw when monitorUSDTTransaction fails (USDT)', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ address: '0xUSDTfail' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Internal Server Error'),
        });

      await expect(
        provider.createPreference({
          product: { id: 'prod-123' },
          amount: 50,
          currency: 'USDT',
          externalReference: 'order-fail',
          email: 'user@test.com',
        })
      ).rejects.toThrow('Error al crear preferencia de pago crypto');
    });
  });

  describe('handleWebhook', () => {
    it('should process confirmed payment (status=2) correctly', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest123',
          value: '100000000', // 1 BTC in satoshis
          txid: '0xabc123',
          secret: 'test_secret',
          order_ref: 'ORD-123-456',
        },
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('completed');
      expect(result?.transactionId).toBe('0xabc123');
      expect(result?.externalReference).toBe('ORD-123-456');
      expect(result?.type).toBe('payment');
      expect(result?.gatewayTax).toBe(0);
      expect(result?.gatewayFee).toBe(0);
    });

    it('should map pending status (0, 1) correctly', async () => {
      const result0 = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '0', addr: 'bc1qtest', value: '100000', txid: 'tx1', secret: 'test_secret', order_ref: 'ORD-1' },
      });

      const result1 = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '1', addr: 'bc1qtest', value: '100000', txid: 'tx2', secret: 'test_secret', order_ref: 'ORD-2' },
      });

      expect(result0?.status).toBe('pending');
      expect(result1?.status).toBe('pending');
    });

    it('should map cancelled status (-1) to failed', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '-1', addr: 'bc1qtest', value: '100000', txid: 'tx3', secret: 'test_secret', order_ref: 'ORD-3' },
      });

      expect(result?.status).toBe('failed');
    });

    it('should reject webhook with invalid secret', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100',
          txid: 'tx1',
          secret: 'wrong_secret',
          order_ref: 'ORD-4',
        },
      });

      expect(result).toBeNull();
    });

    it('should accept webhook with valid secret', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000',
          txid: 'tx-accept-secret',
          secret: 'test_secret',
          order_ref: 'ORD-5',
        },
      });

      expect(result).not.toBeNull();
    });

    it('should return null when missing order_ref', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '2', addr: 'bc1qtest', value: '100000', txid: 'tx1' },
      });

      expect(result).toBeNull();
    });

    it('should reject webhook with value <= 0', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '0',
          txid: 'tx1',
          secret: 'test_secret',
          order_ref: 'ORD-8',
        },
      });

      expect(result).toBeNull();
    });

    it('should have zero gateway fee (monthly subscription model)', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000000', // 1 BTC
          txid: 'tx-zerofee',
          secret: 'test_secret',
          order_ref: 'ORD-6',
        },
      });

      // Blockonomics charges monthly subscription, not per-transaction
      expect(result?.gatewayFee).toBe(0);
    });

    it('should read status from body when query is empty', async () => {
      const result = await provider.handleWebhook({
        body: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000',
          txid: 'tx-body-status',
          secret: 'test_secret',
          order_ref: 'ORD-7',
        },
        headers: {},
        query: { order_ref: 'ORD-7', secret: 'test_secret' },
      });

      expect(result?.status).toBe('completed');
    });

    it('should reject webhook with negative value', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '-100',
          txid: 'tx-neg',
          secret: 'test_secret',
          order_ref: 'ORD-NEG',
        },
      });

      expect(result).toBeNull();
    });

    it('should reject webhook when webhookSecret is not configured', async () => {
      // Temporarily override config to simulate missing webhookSecret
      const { config } = await import('../../config/index');
      const originalSecret = config.blockonomics?.webhookSecret;
      if (config.blockonomics) {
        (config.blockonomics as any).webhookSecret = '';
      }

      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000000',
          txid: 'tx-nosecret',
          secret: 'test_secret',
          order_ref: 'ORD-NOSECRET',
        },
      });

      expect(result).toBeNull();

      // Restore original secret
      if (config.blockonomics && originalSecret !== undefined) {
        (config.blockonomics as any).webhookSecret = originalSecret;
      }
    });

    it('should reject webhook with value below minimum sanity check (< 100000)', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '1', // 1 satoshi — attack attempt
          txid: 'tx-min',
          secret: 'test_secret',
          order_ref: 'ORD-MIN',
        },
      });

      expect(result).toBeNull();
    });

    it('should reject replayed webhook with same txid', async () => {
      const firstResult = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000000',
          txid: 'tx-replay-test',
          secret: 'test_secret',
          order_ref: 'ORD-REPLAY',
        },
      });

      expect(firstResult).not.toBeNull();

      // Second attempt with same txid should be rejected
      const secondResult = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000000',
          txid: 'tx-replay-test',
          secret: 'test_secret',
          order_ref: 'ORD-REPLAY',
        },
      });

      expect(secondResult).toBeNull();
    });
  });

  describe('refund', () => {
    it('should throw error because crypto is irreversible', async () => {
      await expect(provider.refund('tx123', 100)).rejects.toThrow(
        'Las transacciones crypto no pueden ser reembolsadas'
      );
    });
  });
});
