import { MercadoPagoConfig, Payment } from 'mercadopago';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

import { EmailService } from './email.service';
import { CommissionService } from './commission.service';
import { RefundService } from './refund.service';

export class OrderService {
  /**
   * Procesa la notificación de un pago desde el Webhook
   */
  static async handlePaymentWebhook(paymentId: string) {
    // Este log DEBE aparecer. Si no aparece, el problema es la ruta del import en el controller.
    logger.info({ paymentId }, '🔍 [DEBUG] Entrando a handlePaymentWebhook');

    try {
      // 1. Instanciamos la configuración dentro para capturar fallos de token
      const client = new MercadoPagoConfig({
        accessToken: config.mercadoPago.accessToken,
      });

      const paymentInstance = new Payment(client);

      // 2. Consultar el estado real
      logger.info('📡 Llamando a la API de Mercado Pago...');

      const payment = await paymentInstance.get({ id: paymentId });

      const externalRef = payment.external_reference;
      const status = payment.status;

      logger.info({ externalRef, status }, '📊 Datos obtenidos de MP');

      if (!externalRef) {
        logger.warn({ paymentId }, '⚠️ El pago no tiene external_reference');
        return;
      }

      // 3. Buscar la orden
      const order = await orderRepository.getByExternalRef(externalRef);

      if (!order) {
        logger.error({ externalRef }, '❌ Orden no encontrada en la base de datos');
        return;
      }

      logger.info({ orderId: order.id }, '📦 Orden encontrada, verificando estado de pago...');

      // 4. Lógica de estados
      if (status === 'approved') {
        logger.info('🚀 Pago APROBADO. Ejecutando completeOrder...');
        const tempPassword = payment.metadata?.temp_password;
        await this.completeOrder(order, tempPassword);
      } else if (status === 'refunded' || status === 'cancelled') {
        await RefundService.processRefund(order.id, `MP Status: ${status}`);
      } else {
        logger.info({ status }, 'ℹ️ El pago aún no está aprobado (está en proceso)');
      }
    } catch (error: any) {
      // Aquí atraparemos cualquier error de red, de token o del SDK
      logger.error(
        {
          message: error.message,
          paymentId,
          cause: error.cause || 'Desconocida',
          stack: error.stack,
        },
        '💥 ERROR CRÍTICO EN OrderService'
      );
    }
  }

  /**
   * Finaliza la orden y dispara el reparto de comisiones
   */
  private static async completeOrder(order: any, tempPassword?: string) {
    if (order.status === 'paid') {
      logger.info({ orderId: order.id }, 'La orden ya está marcada como pagada.');
      return;
    }

    try {
      // 1. Actualizar DB
      await orderRepository.updateStatus(order.id, 'paid');
      logger.info({ orderId: order.id }, '💳 DB ACTUALIZADA: status = paid');

      const productId = order.product_id || order.productId;
      const buyerId = order.buyer_id || order.buyerId;

      const product = await productRepository.getProductById(productId);
      const buyer = await userRepository.getById(buyerId);

      if (!product || !buyer) {
        logger.error('Faltan datos de producto o comprador para completar el flujo');
        return;
      }

      // 2. Activar usuario
      if (buyer.active === 0) {
        await userRepository.updUser({ id: buyer.id, input: { active: 1 } });
        logger.info({ buyerId }, 'Usuario activado');
      }

      // 3. Comisiones
      await CommissionService.processOrderCommissions(order, product);
      logger.info('Comisiones repartidas');

      // 4. Email
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
        logger.info('Email enviado');
      } catch (e: any) {
        logger.error({ err: e.message }, 'Fallo al enviar el email');
      }

      logger.info({ orderId: order.id }, '✅ FLUJO FINALIZADO CON ÉXITO');
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, 'Error en completeOrder');
    }
  }
}
