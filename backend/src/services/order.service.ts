import { MercadoPagoConfig, Payment } from 'mercadopago';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

import { EmailService } from './email.service';
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

      // IMPORTANTE: Buscamos por la referencia externa que guardamos en el controlador
      const externalRef = payment.external_reference;
      const status = payment.status;

      if (!externalRef) {
        logger.warn({ paymentId }, 'Pago de MP sin external_reference (Order ID)');
        return;
      }

      // 2. Buscar la orden en nuestra DB usando la referencia externa
      const order = await orderRepository.getByExternalRef(externalRef);
      if (!order) throw new AppError('Orden no encontrada en DB', 404);

      // 3. Actuar según el estado del pago
      switch (status) {
        case 'approved': {
          // Bloque con llaves para permitir declaraciones de variables seguras (Metadata)
          const tempPassword = payment.metadata?.temp_password;
          await this.completeOrder(order, tempPassword);
          break;
        }

        case 'refunded':
        case 'cancelled':
          await RefundService.processRefund(order.id, `MP Status: ${status}`);
          break;

        default:
          logger.info({ orderId: order.id, status }, 'Pago recibido en estado no procesable aún');
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
  private static async completeOrder(order: any, tempPassword?: string) {
    if (order.status === 'paid') return;

    try {
      const product = await productRepository.getProductById(order.product_id);
      if (!product) throw new AppError('Producto no encontrado', 404);

      // 1. Obtener datos del comprador
      const buyer = await userRepository.getById(order.buyer_id);
      if (!buyer) throw new AppError('Comprador no encontrado', 404);

      // 2. Si el usuario es nuevo (active: 0), lo activamos por su compra
      if (buyer.active === 0) {
        await userRepository.updUser({ id: buyer.id, input: { active: 1 } });
      }

      // 3. Lógica de envío de Email (Silent Registration vs Usuario Existente)
      if (tempPassword) {
        // Caso: El usuario se registró durante el checkout
        await EmailService.sendWelcomePurchaseEmail(
          buyer.email,
          buyer.fullname,
          tempPassword,
          product.title
        );
        logger.info({ email: buyer.email }, 'Email de bienvenida enviado (Silent Reg)');
      } else {
        // Caso: El usuario ya tenía cuenta y estaba logueado
        await EmailService.sendPurchaseConfirmationEmail(
          buyer.email,
          buyer.fullname,
          product.title
        );
        logger.info({ email: buyer.email }, 'Email de confirmación enviado (Existing User)');
      }

      // 4. Actualizar estado de la orden y procesar comisiones
      await orderRepository.updateStatus(order.id, 'paid');
      await CommissionService.processOrderCommissions(order, product);

      logger.info(
        { orderId: order.id },
        '✅ Orden completada, usuario verificado y comisiones repartidas'
      );
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, 'Error en completeOrder');
      throw error;
    }
  }
}
