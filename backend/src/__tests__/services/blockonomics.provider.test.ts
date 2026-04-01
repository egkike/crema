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

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('BlockonomicsProvider', () => {
  let provider: BlockonomicsProvider;

  beforeEach(() => {
    provider = new BlockonomicsProvider();
    vi.clearAllMocks();
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

      // Verify monitor-tx was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.blockonomics.co/api/monitor-tx',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            addr: '0xUSDTtest123',
            order_id: 'order-789',
            callback_url: 'https://test.crema.app/webhook',
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
        },
      });

      expect(result).not.toBeNull();
      expect(result?.status).toBe('completed');
      expect(result?.transactionId).toBe('0xabc123');
      expect(result?.externalReference).toBe('bc1qtest123');
      expect(result?.type).toBe('payment');
      expect(result?.gatewayTax).toBe(0);
    });

    it('should map pending status (0, 1) correctly', async () => {
      const result0 = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '0', addr: 'bc1qtest', value: '100', txid: 'tx1' },
      });

      const result1 = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '1', addr: 'bc1qtest', value: '100', txid: 'tx2' },
      });

      expect(result0?.status).toBe('pending');
      expect(result1?.status).toBe('pending');
    });

    it('should map cancelled status (-1) to failed', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '-1', addr: 'bc1qtest', value: '100', txid: 'tx3' },
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
          value: '100',
          txid: 'tx1',
          secret: 'test_secret',
        },
      });

      expect(result).not.toBeNull();
    });

    it('should return null when missing required fields', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: { status: '2' }, // missing addr and txid
      });

      expect(result).toBeNull();
    });

    it('should calculate estimated gateway fee (1%)', async () => {
      const result = await provider.handleWebhook({
        body: {},
        headers: {},
        query: {
          status: '2',
          addr: 'bc1qtest',
          value: '100000000', // 1 BTC
          txid: 'tx1',
        },
      });

      // 100000000 satoshis = 1 BTC, 1% = 0.01
      expect(result?.gatewayFee).toBe(0.01);
    });

    it('should read status from body when query is empty', async () => {
      const result = await provider.handleWebhook({
        body: {
          status: '2',
          addr: 'bc1qtest',
          value: '100',
          txid: 'tx1',
        },
        headers: {},
        query: {},
      });

      expect(result?.status).toBe('completed');
    });
  });

  describe('refund', () => {
    it('should throw error because crypto is irreversible', async () => {
      await expect(provider.refund('tx123', 100)).rejects.toThrow(
        'Las transacciones crypto no pueden ser reembolsadas'
      );
    });
  });

  describe('constructor', () => {
    it('should initialize without API key without throwing', async () => {
      // Temporarily override config
      vi.doMock('../../config/index', () => ({
        config: {
          blockonomics: {
            apiKey: '',
            callbackUrl: '',
            webhookSecret: '',
          },
        },
      }));

      // Should not throw even without API key
      expect(() => new BlockonomicsProvider()).not.toThrow();
    });
  });
});
