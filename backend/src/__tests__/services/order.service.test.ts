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

    it('should update transaction and fees when provided', async () => {
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

      expect(orderRepository.updateByExternalRef).toHaveBeenCalledWith('ref-123', {
        transaction_id: 'txn-123',
        gateway_fee: 100,
        gateway_tax: 21,
      });
    });
  });
});
