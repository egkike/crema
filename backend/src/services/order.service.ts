import { orderRepository, Order } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { systemRepository } from '../repositories/system.repository';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

import { EmailService } from './email.service';
import { CommissionService } from './commission.service';
import { RefundService } from './refund.service';
import { ReleaseService } from './release.service';

export class OrderService {
  static async processPaymentNotification(data: {
    externalReference: string;
    status: string;
    transactionId?: string;
    tempPassword?: string;
  }) {
    const { externalReference, status, transactionId, tempPassword } = data;
    const order = await orderRepository.getByExternalRef(externalReference);

    if (!order) {
      logger.error({ externalReference }, '❌ Orden no encontrada en el webhook');
      return;
    }

    // Idempotencia: evitamos reprocesar
    if ((order.status === 'paid' || order.status === 'approved') && status === 'approved') {
      logger.info({ externalReference }, 'ℹ️ Orden ya procesada previamente.');
      return;
    }

    if (transactionId && order.transaction_id !== transactionId) {
      await orderRepository.updateByExternalRef(externalReference, {
        transaction_id: transactionId,
      });
    }

    if (status === 'approved' || status === 'paid') {
      await this.completeOrder(order, tempPassword);
    } else if (status === 'refunded' || status === 'cancelled') {
      await RefundService.processRefund(order.id, `Status: ${status}`);
    }
  }

  // ✅ Ahora recibe el tipo Order en lugar de any
  private static async completeOrder(order: Order, tempPassword?: string) {
    if (order.status === 'paid' || order.commissions_calculated) {
      return;
    }

    try {
      const product = await productRepository.getProductById(order.product_id);
      const buyer = await userRepository.getById(order.buyer_id);

      if (!product || !buyer) {
        throw new AppError('Datos de producto o comprador no encontrados', 500);
      }

      const guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);

      await orderRepository.updateByExternalRef(order.external_reference, {
        days_of_guarantee_applied: guaranteeDays,
      });

      // Bloqueamos estado
      await orderRepository.updateStatus(order.id, 'paid');

      // Comisiones (ya tipadas)
      await CommissionService.processOrderCommissions(order, product);

      if (guaranteeDays === 0) {
        this.triggerImmediateRelease(order.id);
      }

      // Activación segura con userRepository tipado
      if (buyer.active === 0) {
        await userRepository.updUser({
          id: buyer.id,
          input: { active: 1 },
        });
      }

      // Emails
      if (tempPassword) {
        await EmailService.sendWelcomePurchaseEmail(buyer.email, buyer.fullname, tempPassword, product.title);
      } else {
        await EmailService.sendPurchaseConfirmationEmail(buyer.email, buyer.fullname, product.title);
      }

      logger.info({ orderId: order.id }, '✅ Flujo de venta finalizado');
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, '💥 Error al completar la orden');
    }
  }

  private static async triggerImmediateRelease(orderId: string) {
    try {
      await ReleaseService.processPendingBalances(false, orderId);
    } catch (error: any) {
      logger.error({ orderId, error: error.message }, '💥 Fallo en liberación inmediata');
    }
  }
}
