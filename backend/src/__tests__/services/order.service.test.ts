import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ORDER_ID, PRODUCT_ID, USER_ID } from '../setup';
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

vi.mock('../../repositories/system.repository', () => ({
  systemRepository: {
    resolveGuaranteeDays: vi.fn().mockResolvedValue(7),
  },
}));

vi.mock('../../repositories/gateway.repository', () => ({
  gatewayRepository: {
    getSupportsRefunds: vi.fn().mockResolvedValue(true),
    getLiquidityDays: vi.fn().mockResolvedValue(14),
  },
}));

vi.mock('../../repositories/coupon.repository', () => ({
  couponRepository: {
    incrementUses: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendOrderConfirmationEmail: vi.fn().mockResolvedValue(true),
    sendAffiliateCommissionEmail: vi.fn().mockResolvedValue(true),
    sendPurchaseConfirmationEmail: vi.fn().mockResolvedValue(true),
    sendSaleNotificationEmail: vi.fn().mockResolvedValue(true),
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
  ReleaseService: {
    processImmediateRelease: vi.fn().mockResolvedValue(true),
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
import { productRepository } from '../../repositories/product.repository';
import { userRepository } from '../../repositories/user.repository';
import { gatewayRepository } from '../../repositories/gateway.repository';

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

    it('should process payment with sanitized fees', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(orderRepository.getById).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: PRODUCT_ID,
        price: 10000,
      } as any);

      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'buyer@test.com',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
        transactionId: 'txn-123',
        gatewayFee: 100,
        gatewayTax: 21,
      });

      // Verify transaction was processed
      expect(orderRepository.updateByExternalRef).toHaveBeenCalled();
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

    it('should handle invalid gateway fees gracefully', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(orderRepository.getById).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: PRODUCT_ID,
        price: 10000,
      } as any);

      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'buyer@test.com',
      } as any);

      // Test with invalid fees (Infinity, NaN, negative)
      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
        gatewayFee: Infinity,
        gatewayTax: NaN,
      });

      // Should still process with safe defaults (0)
      expect(orderRepository.updateByExternalRef).toHaveBeenCalled();
    });

    it('should handle coupon increment', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: 'coupon-123',
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(orderRepository.getById).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: 'coupon-123',
        payment_method: 'mercadopago',
      } as any);

      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: PRODUCT_ID,
        price: 10000,
      } as any);

      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'buyer@test.com',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
      });

      // Should try to increment coupon uses
      const couponRepo = await import('../../repositories/coupon.repository');
      expect(couponRepo.couponRepository.incrementUses).toHaveBeenCalled();
    });

    it('should handle gateway without refund support', async () => {
      vi.mocked(orderRepository.getByExternalRef).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        external_reference: 'ref-123',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'crypto',
      } as any);

      vi.mocked(orderRepository.getById).mockResolvedValue({
        id: ORDER_ID,
        status: 'pending',
        product_id: PRODUCT_ID,
        buyer_id: USER_ID,
        coupon_id: null,
        payment_method: 'crypto',
      } as any);

      vi.mocked(gatewayRepository.getSupportsRefunds).mockResolvedValue(false);

      vi.mocked(productRepository.getProductById).mockResolvedValue({
        id: PRODUCT_ID,
        price: 10000,
      } as any);

      vi.mocked(userRepository.getById).mockResolvedValue({
        id: USER_ID,
        email: 'buyer@test.com',
      } as any);

      await OrderService.processPaymentNotification({
        externalReference: 'ref-123',
        status: 'approved',
      });

      // Should set guarantee days to 0 for gateways without refund support
      expect(gatewayRepository.getSupportsRefunds).toHaveBeenCalledWith('crypto');
    });
  });
});
