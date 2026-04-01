import pool from '../db/postgres';
import { orderRepository, Order } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { userRepository } from '../repositories/user.repository';
import { systemRepository } from '../repositories/system.repository';
import { gatewayRepository } from '../repositories/gateway.repository';
import { couponRepository } from '../repositories/coupon.repository';
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
    transactionId?: string; // transaction_id is updated inside completeOrder within the transaction
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

    // Early return check moved inside completeOrder transaction to prevent race conditions.
    // Two concurrent webhooks could both pass this check while order is still 'pending',
    // then both attempt completeOrder. The definitive guard is inside the transaction
    // after acquiring the row lock (see completeOrder).

    // Validar que los fees no sean negativos ni infinitos (sanitize inputs)
    // Los fees se actualizan dentro de completeOrder (dentro de transacción)
    const safeGatewayFee = (gatewayFee !== undefined && Number.isFinite(gatewayFee) && gatewayFee >= 0) ? gatewayFee : 0;
    const safeGatewayTax = (gatewayTax !== undefined && Number.isFinite(gatewayTax) && gatewayTax >= 0) ? gatewayTax : 0;

    if (status === 'approved' || status === 'paid') {
      // Pasamos los fees sanitizados al método de completado
      await this.completeOrder(order, tempPassword, safeGatewayFee, safeGatewayTax, transactionId);
    } else if (status === 'refunded' || status === 'cancelled') {
      await RefundService.processRefund(order.id, `Status: ${status}`);
    }
  }

  private static async completeOrder(
    order: Order,
    tempPassword?: string,
    gatewayFee: number = 0,
    gatewayTax: number = 0,
    transactionId?: string
  ) {
    if (order.status === 'paid' || order.commissions_calculated) {
      return;
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Bloqueamos la fila de la orden
      const lockedOrder = await orderRepository.getById(order.id, client);

      // Final-status check INSIDE the transaction after row lock acquisition.
      // This prevents race conditions where two concurrent webhooks both pass the
      // pre-transaction check while the order is still 'pending'. Only the first
      // webhook to acquire the lock will proceed; the second will see status='paid'.
      const finalStatuses = ['paid', 'approved', 'authorized'];
      if (!lockedOrder || finalStatuses.includes(lockedOrder.status) || lockedOrder.commissions_calculated) {
        await client.query('ROLLBACK');
        logger.info(
          { orderId: order.id },
          'ℹ️ completeOrder ignorado: La orden ya está en un estado final (race condition guard).'
        );
        return;
      }

      // --- LÓGICA DE INCREMENTO DE USO DE CUPÓN ---
      if (lockedOrder.coupon_id) {
        try {
          await couponRepository.incrementUses(lockedOrder.coupon_id, client);
          logger.info(
            { couponId: lockedOrder.coupon_id, orderId: lockedOrder.id },
            '🎟️ Uso de cupón incrementado'
          );
        } catch {
          // Si el cupón llegó a su límite justo antes de este pago, lanzamos error para Rollback
          throw new AppError('No se pudo aplicar el cupón: límite de usos alcanzado.', 400);
        }
      }

      const product = await productRepository.getProductById(lockedOrder.product_id);
      const buyer = await userRepository.getById(lockedOrder.buyer_id);

      if (!product || !buyer) {
        throw new AppError('Datos de producto o comprador no encontrados', 500);
      }

      // --- 1. LÓGICA DE LA DOBLE LLAVE (GARANTÍA + LIQUIDEZ) ---
      // Si la pasarela no soporta refunds (ej: crypto), garantía = 0
      const supportsRefunds = await gatewayRepository.getSupportsRefunds(
        lockedOrder.payment_method
      );

      let guaranteeDays = 0;
      if (supportsRefunds) {
        guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);
      } else {
        logger.info(
          { orderId: lockedOrder.id, paymentMethod: lockedOrder.payment_method },
          '⚠️ Pasarela sin soporte de refunds - Garantía establecida en 0 días'
        );
      }

      const gatewayLiquidityDays = await gatewayRepository.getLiquidityDays(
        lockedOrder.payment_method
      );
      const finalDelayDays = Math.max(guaranteeDays, gatewayLiquidityDays);

      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + finalDelayDays);

      // --- 2. PERSISTENCIA OPERATIVA EN LA ORDEN ---
      // ACTUALIZACIÓN ATÓMICA:
      // Sincronizamos los fees que vienen del webhook directamente en la DB y en el objeto en memoria
      await orderRepository.updateByExternalRef(
        lockedOrder.external_reference,
        {
          status: 'paid',
          gateway_fee: gatewayFee, // Viene de la pasarela
          gateway_tax: gatewayTax, // Viene de la pasarela
          transaction_id: transactionId, // Hash de la transacción blockchain
          days_of_guarantee_applied: guaranteeDays,
          gateway_liquidity_days_applied: gatewayLiquidityDays,
          release_at: releaseAt,
        },
        client
      );

      // Actualizamos el objeto en memoria para que CommissionService vea los fees reales
      lockedOrder.status = 'paid';
      lockedOrder.gateway_fee = gatewayFee;
      lockedOrder.gateway_tax = gatewayTax;
      lockedOrder.release_at = releaseAt;

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
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ orderId: order.id, error: message }, '💥 Error al completar la orden');
      throw error; // Re-lanzamos para que el webhook sepa que falló
    } finally {
      client.release();
    }
  }

  private static async triggerImmediateRelease(orderId: string) {
    try {
      await ReleaseService.processPendingBalances(false, orderId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ orderId, error: message }, '💥 Fallo en liberación inmediata');
    }
  }
}
