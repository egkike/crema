import { MercadoPagoConfig, Payment } from 'mercadopago';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

import { CommissionService } from './commission.service';
import { RefundService } from './refund.service';

// Configuración de MP para validar pagos reales
const client = new MercadoPagoConfig({ accessToken: config.mercadoPago.accessToken });

export class OrderService {
  /**
   * Procesa la notificación de un pago desde el Webhook
   */
  static async handlePaymentWebhook(paymentId: string) {
    try {
      // 1. Consultar el estado real en Mercado Pago
      const payment = await new Payment(client).get({ id: paymentId });

      const orderId = payment.external_reference; // Aquí debes haber guardado tu Order ID
      const status = payment.status;

      if (!orderId) {
        logger.warn({ paymentId }, 'Pago de MP sin external_reference (Order ID)');
        return;
      }

      // 2. Buscar la orden en nuestra DB
      const order = await orderRepository.getById(orderId);
      if (!order) throw new AppError('Orden no encontrada en DB', 404);

      // 3. Actuar según el estado del pago
      switch (status) {
        case 'approved':
          await this.completeOrder(order);
          break;

        case 'refunded':
        case 'cancelled':
          await RefundService.processRefund(order.id, `MP Status: ${status}`);
          break;

        default:
          logger.info({ orderId, status }, 'Pago recibido en estado no procesable aún');
          break;
      }
    } catch (error: any) {
      logger.error({ error: error.message, paymentId }, 'Error procesando handlePaymentWebhook');
      throw error;
    }
  }

  /**
   * Finaliza la orden y dispara el reparto de comisiones
   */
  private static async completeOrder(order: any) {
    if (order.status === 'paid') return; // Ya procesada

    try {
      // 1. Obtener datos del producto para saber las comisiones
      const product = await productRepository.getProductById(order.product_id);
      if (!product) throw new AppError('Producto no encontrado', 404);

      // 2. Actualizar estado de la orden a 'paid'
      await orderRepository.updateStatus(order.id, 'paid');

      // 3. DISPARAR EL REPARTO DE DINERO
      await CommissionService.processOrderCommissions(order, product);

      logger.info({ orderId: order.id }, '✅ Orden completada y comisiones repartidas');
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, 'Error en completeOrder');
      throw error;
    }
  }
}
