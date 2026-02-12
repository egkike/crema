import { orderRepository } from '../repositories/order.repository';
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
  /**
   * Procesa la notificación de la pasarela y decide si completar o reembolsar.
   */
  static async processPaymentNotification(data: {
    externalReference: string;
    status: string;
    transactionId?: string;
    tempPassword?: string;
  }) {
    const { externalReference, status, transactionId, tempPassword } = data;

    // Los repositorios ya fueron corregidos para manejar el schema dinámicamente
    const order = await orderRepository.getByExternalRef(externalReference);

    if (!order) {
      logger.error({ externalReference }, '❌ Orden no encontrada en el webhook');
      return;
    }

    // Ajuste de Idempotencia: Si ya está pagada en nuestra DB, ignoramos webhooks duplicados
    if ((order.status === 'paid' || order.status === 'approved') && status === 'approved') {
      logger.info({ externalReference }, 'ℹ️ Orden ya procesada previamente, ignorando duplicado.');
      return;
    }

    // Actualizamos el ID de transacción de Mercado Pago si no lo tiene
    if (transactionId && order.transaction_id !== transactionId) {
      await orderRepository.updateByExternalRef(externalReference, {
        transaction_id: transactionId,
      });
    }

    // Lógica de estados: Mercado Pago usa 'approved', tu DB usará 'paid'
    if (status === 'approved' || status === 'paid') {
      await this.completeOrder(order, tempPassword);
    } else if (status === 'refunded' || status === 'cancelled') {
      await RefundService.processRefund(order.id, `Status: ${status}`);
    }
  }

  /**
   * Finaliza la venta: Reparte dinero, activa usuario y envía email.
   */
  private static async completeOrder(order: any, tempPassword?: string) {
    // Si ya está pagada o ya tiene comisiones, evitamos duplicidad
    if (order.status === 'paid' || order.commissions_calculated) {
      return;
    }

    try {
      // Obtenemos los datos necesarios usando los repositorios
      const product = await productRepository.getProductById(order.product_id);
      const buyer = await userRepository.getById(order.buyer_id);

      if (!product || !buyer) {
        throw new AppError('Datos de producto o comprador no encontrados', 500);
      }

      // >>> RESOLUCIÓN DE GARANTÍA ANTES DEL BLOQUEO <<<
      const guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);

      // >>> PERSISTIMOS LA GARANTÍA CAPTURADA EN LA ORDEN <<<
      await orderRepository.updateByExternalRef(order.external_reference, {
        days_of_guarantee_applied: guaranteeDays,
      });

      // Ajuste crítico: Actualizamos estado a 'paid' ANTES de las comisiones para bloquear otros hilos
      await orderRepository.updateStatus(order.id, 'paid');

      // 1. REPARTO DE COMISIONES
      // Importante: CommissionService ya está corregido, por lo que no lanzará error al importar
      await CommissionService.processOrderCommissions(order, product);

      // >>> LIBERACIÓN INMEDIATA SI LA GARANTÍA ES 0 <<<
      if (guaranteeDays === 0) {
        // Lo ejecutamos de forma asíncrona (sin await) para no bloquear la respuesta al webhook
        this.triggerImmediateRelease(order.id);
      }

      // 2. ACTIVACIÓN DEL USUARIO
      if (buyer.active === 0) {
        await userRepository.updUser({
          id: buyer.id,
          input: { active: 1 },
        });
        logger.info({ userId: buyer.id }, '👤 Usuario activado tras pago');
      }

      // 3. ENVÍO DE EMAIL ÚNICO
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

      logger.info({ orderId: order.id }, '✅ Flujo de venta finalizado con éxito');
    } catch (error: any) {
      logger.error({ orderId: order.id, error: error.message }, '💥 Error al completar la orden');
    }
  }

  /**
   * Intenta liberar el saldo inmediatamente si la garantía es 0.
   * Se ejecuta de forma asíncrona para no afectar el flujo del pago.
   */
  private static async triggerImmediateRelease(orderId: string) {
    try {
      logger.info({ orderId }, '⚡ Iniciando liberación inmediata (Garantía 0)');

      // Llamamos al ReleaseService, pero solo para esta orden.
      // Necesitaremos un pequeño ajuste en el ReleaseService para aceptar un orderId opcional.
      await ReleaseService.processPendingBalances(false, orderId);
    } catch (error: any) {
      logger.error({ orderId, error: error.message }, '💥 Fallo en liberación inmediata');
    }
  }
}
