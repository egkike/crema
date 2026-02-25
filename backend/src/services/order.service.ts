import pool from '../db/postgres';
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

    const finalStatuses = ['paid', 'approved', 'authorized'];
    // Si la orden ya está pagada y llega un "approved", simplemente ignoramos.
    if (finalStatuses.includes(order.status)) {
      logger.info(
        { externalReference, status },
        'ℹ️ Webhook ignorado: La orden ya está en un estado final.'
      );
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

  private static async completeOrder(order: Order, tempPassword?: string) {
    if (order.status === 'paid' || order.commissions_calculated) {
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Bloqueo de fila para evitar condiciones de carrera
      const lockedOrder = await orderRepository.getById(order.id, client);

      if (!lockedOrder || lockedOrder.status === 'paid' || lockedOrder.commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      const product = await productRepository.getProductById(lockedOrder.product_id);
      const buyer = await userRepository.getById(lockedOrder.buyer_id);

      if (!product || !buyer) {
        throw new AppError('Datos de producto o comprador no encontrados', 500);
      }

      // 2. Resolver días de garantía
      const guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);

      await orderRepository.updateByExternalRef(
        lockedOrder.external_reference,
        { days_of_guarantee_applied: guaranteeDays },
        client
      );

      // 3. Actualizar estado de la orden
      await orderRepository.updateStatus(lockedOrder.id, 'paid', client);

      // 4. Procesar comisiones pasando el cliente de la transacción
      await CommissionService.processOrderCommissions(lockedOrder, product, client);

      // 5. Activación de usuario si corresponde
      if (buyer.active === 0) {
        await userRepository.updUser(
          {
            id: buyer.id,
            input: { active: 1 },
          },
          client
        );
      }

      await client.query('COMMIT');

      // --- PROCESOS POST-TRANSACCIÓN (Solo si el COMMIT fue exitoso) ---

      // 6. Liberación inmediata si la garantía es 0
      if (guaranteeDays === 0) {
        this.triggerImmediateRelease(lockedOrder.id);
      }

      // 7. Envío de correos según el caso
      if (tempPassword) {
        await EmailService.sendWelcomePurchaseEmail(
          buyer.email,
          buyer.fullname,
          tempPassword,
          product.title
        );
      } else {
        await EmailService.sendPurchaseConfirmationEmail(
          buyer.email,
          buyer.fullname,
          product.title
        );
      }

      // Buscamos los datos del creador para enviarle su notificación
      const creator = await userRepository.getById(product.creator_id);
      if (creator) {
        await EmailService.sendSaleNotificationEmail(
          creator.email,
          product.title,
          lockedOrder.amount,
          lockedOrder.currency
        );
      }

      logger.info({ orderId: order.id }, '✅ Flujo de venta finalizado');
    } catch (error: any) {
      // Rollback explícito en caso de error para liberar bloqueos
      await client.query('ROLLBACK');
      logger.error({ orderId: order.id, error: error.message }, '💥 Error al completar la orden');
    } finally {
      // Liberar la conexión al pool siempre
      client.release();
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
