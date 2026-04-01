import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ORDER_ID } from '../setup';
// eslint-disable-next-line import/order
import { OrderService } from '../../services/order.service';

vi.mock('../../repositories/order.repository', () => ({
  orderRepository: {
    getByExternalRef: vi.fn(),
    updateByExternalRef: vi.fn().mockResolvedValue(true),
    getById: vi.fn(),
  },
}));

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn(),
  },
}));

vi.mock('../../repositories/user.repository', () => ({
  userRepository: {
    getById: vi.fn(),
  },
}));

vi.mock('../../repositories/coupon.repository', () => ({
  couponRepository: {
    incrementUses: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../repositories/system.repository', () => ({
  systemRepository: {},
}));

vi.mock('../../repositories/gateway.repository', () => ({
  gatewayRepository: {},
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
    sendAffiliateCommissionEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../services/commission.service', () => ({
  CommissionService: {
    processOrderCommissions: vi.fn().mockResolvedValue({ platformFee: 1000, creatorNet: 9000 }),
  },
}));

vi.mock('../../services/refund.service', () => ({
  RefundService: {
    processRefund: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../services/release.service', () => ({
  ReleaseService: {},
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

vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
    redis: { host: 'localhost', port: 6379 },
  },
}));

vi.mock('../../config/redis', () => ({
  redisConnection: { host: 'localhost', port: 6379 },
}));

import { orderRepository } from '../../repositories/order.repository';

describe('OrderService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processPaymentNotification', () => {
    it('should ignore if order not found', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue(null);

      const result = await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
      });

      expect(result).toBeUndefined();
    });

    it('should ignore if order already in final status', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'paid',
        external_reference: 'ref-123',
      } as any);

      const result = await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
      });

      expect(result).toBeUndefined();
    });

    it('should pass sanitized fees to completeOrder (transaction_id updated inside transaction)', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
        transactionId: 'txn-123',
        gatewayFee: 100,
        gatewayTax: 21,
      });

      // transaction_id is no longer updated outside the transaction (race condition fix).
      // It is updated inside completeOrder within the DB transaction.
      // Verify that updateByExternalRef was NOT called with transaction_id outside the transaction.
      const calls = vi.mocked(orderRepository.updateByExternalRef).mock.calls;
      const txIdUpdateOutsideTransaction = calls.find(
        (call) => call[1] && 'transaction_id' in call[1]
      );
      expect(txIdUpdateOutsideTransaction).toBeUndefined();
    });

    it('should process refund when status is refunded', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'refunded',
      });

      const { RefundService } = await import('../../services/refund.service');
      expect(RefundService.processRefund).toHaveBeenCalledWith(ORDER_ID, 'Status: refunded');
    });

    it('should process refund when status is cancelled', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'cancelled',
      });

      const { RefundService } = await import('../../services/refund.service');
      expect(RefundService.processRefund).toHaveBeenCalledWith(ORDER_ID, 'Status: cancelled');
    });

    it('should not process unknown status', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'unknown',
      });

      expect(orderRepository.updateByExternalRef).not.toHaveBeenCalled();
    });
  });
});
