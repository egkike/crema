import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

import { EmailService } from './email.service';
import { CommissionService } from './commission.service';
import { RefundService } from './refund.service';

export class OrderService {
  /**
   * Este método es el PUNTO DE ENTRADA ÚNICO desde cualquier pasarela.
   * Ya no recibe un ID de MP, sino los datos ya normalizados.
   */
  static async processPaymentNotification(data: {
    externalReference: string;
    status: string;
    transactionId?: string;
    tempPassword?: string;
  }) {
    const { externalReference, status, transactionId, tempPassword } = data;

    logger.info({ externalReference, status }, '📦 Procesando notificación de pago');

    const order = await orderRepository.getByExternalRef(externalReference);

    if (!order) {
      logger.error({ externalReference }, '❌ Orden no encontrada en la base de datos');
      return;
    }

    // Guardamos el ID de transacción real de la pasarela para auditoría
    if (transactionId && order.transaction_id !== transactionId) {
      await orderRepository.updateByExternalRef(externalReference, {
        transaction_id: transactionId,
      });
    }

    // Lógica de estados según tu DB
    if (status === 'approved' || status === 'paid') {
      await this.completeOrder(order, tempPassword);
    } else if (status === 'refunded' || status === 'cancelled') {
      await RefundService.processRefund(order.id, `Gateway Status: ${status}`);
    } else {
      logger.info({ status, orderId: order.id }, 'ℹ️ Pago en estado no final (pending/processing)');
    }
  }

  /**
   * Finaliza la orden y dispara el reparto de comisiones (Core Business)
   */
  private static async completeOrder(order: any, tempPassword?: string) {
    if (order.status === 'paid') {
      logger.info({ orderId: order.id }, 'La orden ya está pagada.');
      return;
    }

    try {
      // 1. Obtenemos IDs normalizados
      const productId = order.product_id || order.productId;
      const buyerId = order.buyer_id || order.buyerId;

      const product = await productRepository.getProductById(productId);
      const buyer = await userRepository.getById(buyerId);

      if (!product || !buyer) {
        throw new AppError('Faltan datos de producto o comprador para completar el flujo', 500);
      }

      // 2. Activar usuario si es nuevo/inactivo
      if (buyer.active === 0) {
        await userRepository.updUser({ id: buyer.id, input: { active: 1 } });
        logger.info({ buyerId }, '👤 Usuario activado');
      }

      // 3. REPARTO DE COMISIONES (Aquí es donde entra la magia multimoneda)
      // El service usará order.currency para buscar configs en la DB
      await CommissionService.processOrderCommissions(order, product);
      logger.info('💰 Comisiones distribuidas exitosamente');

      // 4. Notificaciones
      try {
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
        logger.info('📧 Email de confirmación enviado');
      } catch (e: any) {
        logger.error({ err: e.message }, '⚠️ Error al enviar email (el flujo sigue)');
      }

      logger.info({ orderId: order.id }, '✅ FLUJO FINALIZADO CON ÉXITO');
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, '💥 Error en completeOrder');
    }
  }
}
