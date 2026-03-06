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

      // Bloqueamos la fila de la orden para evitar condiciones de carrera (Race Conditions)
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

      // --- 1. LÓGICA DE LA DOBLE LLAVE (GARANTÍA + LIQUIDEZ PASARELA) ---

      // Obtener días de garantía del producto/global
      const guaranteeDays = await systemRepository.resolveGuaranteeDays(product.id);

      // Obtener días de retención de la pasarela desde el nuevo gatewayRepository
      const gatewayLiquidityDays = await gatewayRepository.getLiquidityDays(
        lockedOrder.payment_method
      );

      // Determinamos el delay final (el mayor de ambos)
      const finalDelayDays = Math.max(guaranteeDays, gatewayLiquidityDays);

      // Calculamos la fecha meta de liberación
      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + finalDelayDays);

      // --- 2. CÁLCULO DE UTILIDAD NETA (Net Profit) ---

      // platformFee es lo que Crema cobra (comisión variable + fija)
      const platformFee = Number(lockedOrder.commission_amount || 0);
      const netPlatformProfit = platformFee - gatewayFee - gatewayTax;

      // --- 3. PERSISTENCIA DE DATOS FINANCIEROS EN LA ORDEN ---

      await orderRepository.updateByExternalRef(
        lockedOrder.external_reference,
        {
          status: 'paid',
          days_of_guarantee_applied: guaranteeDays,
          gateway_liquidity_days_applied: gatewayLiquidityDays,
          release_at: releaseAt,
          gateway_fee: gatewayFee,
          gateway_tax: gatewayTax,
          net_platform_profit: netPlatformProfit,
        },
        client
      );

      // Actualizamos el objeto en memoria para que CommissionService reciba la data fresca
      lockedOrder.status = 'paid';
      lockedOrder.days_of_guarantee_applied = guaranteeDays;
      lockedOrder.gateway_liquidity_days_applied = gatewayLiquidityDays;
      lockedOrder.release_at = releaseAt;
      lockedOrder.gateway_fee = gatewayFee;
      lockedOrder.gateway_tax = gatewayTax;
      lockedOrder.net_platform_profit = netPlatformProfit;

      // --- 4. PROCESAR COMISIONES ---
      // IMPORTANTE: CommissionService usará order.release_at para platform_earnings
      await CommissionService.processOrderCommissions(lockedOrder, product, client);

      // --- 5. ACTIVACIÓN DE USUARIO ---
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

      // --- 6. PROCESOS ASÍNCRONOS / POST-COMMIT ---

      // Solo disparamos liberación inmediata si el release_at es hoy o ya pasó
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
          netProfit: netPlatformProfit,
          releaseAt: releaseAt.toISOString(),
        },
        '✅ Orden completada: Fondos bloqueados hasta la fecha de liberación'
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
