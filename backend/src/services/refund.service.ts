import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';

import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { orderRepository } from '../repositories/order.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { refundRepository } from '../repositories/refund.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

export class RefundService {
  /**
   * Helper privado para inicializar el cliente de Mercado Pago.
   */
  private static getMPClient() {
    return new MercadoPagoConfig({
      accessToken: config.mercadoPago?.accessToken || 'dummy_token',
    });
  }

  /**
   * Procesa el reembolso de una orden de forma atómica.
   */
  static async processRefund(orderId: string, reason: string = 'Reembolso solicitado') {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener la orden con bloqueo FOR UPDATE para evitar colisiones con el proceso de liberación.
      // NOTA: Asegúrate que orderRepository.getById use FOR UPDATE cuando se le pasa el cliente.
      const order = await orderRepository.getById(orderId, client);

      if (!order) throw new AppError('La orden no existe', 404);
      if (order.status === 'refunded') throw new AppError('La orden ya fue reembolsada', 400);

      // VALIDACIÓN DE GARANTÍA
      const orderCreatedAt = new Date(order.created_at).getTime();
      const guaranteeDays = order.days_of_guarantee_applied || 7;
      const guaranteeMillis = guaranteeDays * 24 * 60 * 60 * 1000;
      const expirationDate = orderCreatedAt + guaranteeMillis;

      if (Date.now() > expirationDate) {
        throw new AppError(`El periodo de garantía de ${guaranteeDays} días ha expirado.`, 400);
      }

      // SEGURIDAD: Solo se reembolsa si el dinero no ha sido liberado al saldo disponible.
      if (order.balance_released) {
        throw new AppError(
          'El saldo ya fue liberado. El reembolso debe gestionarse manualmente.',
          400
        );
      }

      const orderCurrency = order.currency;

      // 2. REVERTIR COMISIONES DE USUARIOS (CREADOR Y AFILIADOS)
      const commissions = await commissionRepository.getByOrderId(orderId);

      for (const comm of commissions) {
        // Solo revertimos si la comisión está pendiente (no pagada aún)
        if (comm.status === 'pending') {
          const amountToDeduct = Math.floor(Number(comm.netAmount) * 100) / 100;

          await balanceRepository.deductPendingEarnings(
            comm.userId,
            amountToDeduct,
            orderCurrency,
            client
          );

          await historyRepository.createRecordWithClient(client, {
            userId: comm.userId,
            order_id: orderId,
            amount: -amountToDeduct,
            currency: orderCurrency,
            type: 'refund' as any,
            description: `Deducción por reembolso: Orden #${orderId.substring(0, 8)}`,
          });
        }
      }

      // 3. REVERTIR GANANCIAS DE LA PLATAFORMA
      const pEarningsQuery = `
        SELECT total_amount 
        FROM "${schema}".platform_earnings 
        WHERE order_id = $1 AND status = 'active'
        FOR UPDATE;
      `;
      const { rows: pEarnings } = await client.query(pEarningsQuery, [orderId]);

      if (pEarnings.length > 0) {
        const platformAmountToDeduct = Math.floor(Number(pEarnings[0].total_amount) * 100) / 100;

        await platformBalanceRepository.deductFromPending(
          platformAmountToDeduct,
          orderCurrency,
          client
        );

        await client.query(
          `UPDATE "${schema}".platform_earnings 
           SET status = 'refunded', updated_at = CURRENT_TIMESTAMP 
           WHERE order_id = $1`,
          [orderId]
        );
      }

      // 4. ACTUALIZAR ESTADOS DE LA ORDEN Y COMISIONES
      await orderRepository.updateStatus(orderId, 'refunded', client);
      await commissionRepository.updateStatusByOrder(orderId, 'refunded', client);

      // 5. REGISTRO DE AUDITORÍA
      // Ajuste: Usamos order.creator_id o el seller_id que venga del JOIN en el repositorio.
      await refundRepository.create(
        {
          orderId,
          sellerId: order.creator_id || order.seller_id,
          buyerId: order.buyer_id,
          amount: Number(order.amount),
          currency: orderCurrency,
          reason,
        },
        client
      );

      // 6. REEMBOLSO EN PASARELA (MERCADO PAGO)
      if (order.payment_method === 'mercadopago' && order.transaction_id) {
        try {
          const mpClient = this.getMPClient();
          const refundInstance = new PaymentRefund(mpClient);

          await refundInstance.create({
            payment_id: String(order.transaction_id) as any,
          });
          logger.info(`Mercado Pago: Reembolso exitoso para orden ${orderId}`);
        } catch (mpError: any) {
          logger.error({ mpError: mpError.message }, 'Error en API de Mercado Pago');
          // Lanzamos error para hacer ROLLBACK de todo si MP falla
          throw new AppError(`Error en Mercado Pago: ${mpError.message}`, 400);
        }
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId }, 'Fallo en RefundService');
      if (error instanceof AppError) throw error;
      throw new AppError(error.message || 'Error interno al procesar el reembolso', 500);
    } finally {
      client.release();
    }
  }
}
