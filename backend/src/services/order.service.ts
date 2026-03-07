import pool from '../db/postgres';
import { orderRepository, Order } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { systemRepository } from '../repositories/system.repository';
import { gatewayRepository } from '../repositories/gateway.repository';
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
    gatewayFee?: number | undefined;
    gatewayTax?: number | undefined;
  }) {
    const { externalReference, status, transactionId, tempPassword, gatewayFee, gatewayTax } = data;
    const order = await orderRepository.getByExternalRef(externalReference);

    if (!order) {
      logger.error({ externalReference }, '❌ Orden no encontrada en el webhook');
      return;
    }

    const finalStatuses = ['paid', 'approved', 'authorized'];
    if (finalStatuses.includes(order.status)) {
      logger.info(
        { externalReference, status },
        'ℹ️ Webhook ignorado: La orden ya está en un estado final.'
      );
      return;
    }

    // Actualizamos ID de transacción y fees si vienen en el webhook
    if (transactionId || gatewayFee !== undefined) {
      await orderRepository.updateByExternalRef(externalReference, {
        transaction_id: transactionId,
        gateway_fee: gatewayFee || 0,
        gateway_tax: gatewayTax || 0,
      });
    }

    if (status === 'approved' || status === 'paid') {
      // Pasamos los fees al método de completado
      await this.completeOrder(order, tempPassword, gatewayFee, gatewayTax);
    } else if (status === 'refunded' || status === 'cancelled') {
      await RefundService.processRefund(order.id, `Status: ${status}`);
    }
  }

  private static async completeOrder(
    order: Order,
    tempPassword?: string,
    gatewayFee: number = 0,
    gatewayTax: number = 0
  ) {
    if (order.status === 'paid' || order.commissions_calculated) {
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Bloqueamos la fila de la orden
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

      // --- 1. LÓGICA DE LA DOBLE LLAVE (GARANTÍA + LIQUIDEZ) ---
      const guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);
      const gatewayLiquidityDays = await gatewayRepository.getLiquidityDays(
        lockedOrder.payment_method
      );
      const finalDelayDays = Math.max(guaranteeDays, gatewayLiquidityDays);

      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + finalDelayDays);

      // --- 2. PERSISTENCIA OPERATIVA EN LA ORDEN ---
      // Eliminamos el cálculo de netPlatformProfit de aquí, ya que lo hará CommissionService
      await orderRepository.updateByExternalRef(
        lockedOrder.external_reference,
        {
          status: 'paid',
          days_of_guarantee_applied: guaranteeDays,
          gateway_liquidity_days_applied: gatewayLiquidityDays,
          release_at: releaseAt,
          gateway_fee: gatewayFee,
          gateway_tax: gatewayTax,
          // net_platform_profit se actualizará dentro de CommissionService
        },
        client
      );

      // Sincronizamos objeto en memoria para el siguiente paso
      lockedOrder.status = 'paid';
      lockedOrder.release_at = releaseAt;
      lockedOrder.gateway_fee = gatewayFee;
      lockedOrder.gateway_tax = gatewayTax;

      // --- 3. PROCESAR COMISIONES (EL CEREBRO FINANCIERO) ---
      // Pasamos el control a CommissionService para el cálculo de IVA, Fees fijos y Utilidad Real
      const commissionResult = await CommissionService.processOrderCommissions(
        lockedOrder,
        product,
        client
      );

      // --- 4. ACTIVACIÓN DE USUARIO ---
      if (buyer.active === 0) {
        await userRepository.updUser({ id: buyer.id, input: { active: 1 } }, client);
      }

      await client.query('COMMIT');

      // --- 5. PROCESOS POST-COMMIT ---
      const now = new Date();
      if (releaseAt <= now) {
        this.triggerImmediateRelease(lockedOrder.id);
      }

      // Notificaciones por Email
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

      const creator = await userRepository.getById(product.creator_id);
      if (creator) {
        await EmailService.sendSaleNotificationEmail(
          creator.email,
          product.title,
          lockedOrder.amount,
          lockedOrder.currency
        );
      }

      logger.info(
        {
          orderId: order.id,
          totalPlatformFee: commissionResult?.platformFee,
          releaseAt: releaseAt.toISOString(),
        },
        '✅ Orden completada y comisiones distribuidas'
      );
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ orderId: order.id, error: error.message }, '💥 Error al completar la orden');
      throw error; // Re-lanzamos para que el webhook sepa que falló
    } finally {
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
