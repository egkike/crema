import { MercadoPagoConfig, PaymentRefund } from 'mercadopago';

import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { orderRepository } from '../repositories/order.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { refundRepository } from '../repositories/refund.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

export class RefundService {
  /**
   * Helper privado para inicializar el cliente de Mercado Pago solo cuando se necesita.
   */
  private static getMPClient() {
    return new MercadoPagoConfig({
      accessToken: config.mercadoPago?.accessToken || 'dummy_token',
    });
  }

  /**
   * Procesa el reembolso de una orden.
   * Revierte los saldos pendientes de todos los involucrados (creador y afiliados).
   */
  static async processRefund(orderId: string, reason: string = 'Reembolso solicitado') {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener la orden con bloqueo para evitar condiciones de carrera
      const order = await orderRepository.getById(orderId, client);
      if (!order) throw new AppError('La orden no existe', 404);
      if (order.status === 'refunded') throw new AppError('La orden ya fue reembolsada', 400);

      // REGLA DE SEGURIDAD: Solo se reembolsa si el dinero no ha sido liberado al disponible
      if (order.balance_released) {
        throw new AppError(
          'El saldo ya fue liberado al creador. El reembolso debe gestionarse manualmente por soporte.',
          400
        );
      }

      const orderCurrency = order.currency;

      // 2. OBTENER TODAS LAS COMISIONES (Creador y Afiliados)
      const commissions = await commissionRepository.getByOrderId(orderId);

      if (commissions.length === 0) {
        logger.warn({ orderId }, 'No se encontraron registros de comisiones para reembolsar');
      }

      // 3. REVERTIR SALDOS PARA CADA INVOLUCRADO
      for (const comm of commissions) {
        if (comm.status === 'pending') {
          const amountToDeduct = Number(comm.netAmount);

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
            description: `Deducción por reembolso: Orden #${orderId}`,
          });

          logger.info(
            { userId: comm.userId, amount: amountToDeduct },
            'Saldo pendiente revertido por reembolso'
          );
        }
      }

      // 4. ACTUALIZAR ESTADOS EN CASCADA
      await orderRepository.updateStatus(orderId, 'refunded', client);
      await commissionRepository.updateStatusByOrder(orderId, 'refunded', client);

      // 4.5 REVERTIR GANANCIAS DE LA PLATAFORMA
      await client.query(
        `UPDATE "${schema}".platform_earnings 
         SET status = 'refunded', updated_at = CURRENT_TIMESTAMP 
         WHERE order_id = $1`,
        [orderId]
      );

      // 5. REGISTRO DE AUDITORÍA EN TABLA DE REEMBOLSOS
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

      // --- PASO DE: REEMBOLSO AUTOMÁTICO EN MERCADO PAGO ---
      if (order.payment_method === 'mercadopago' && order.transaction_id) {
        try {
          logger.info(
            { transactionId: order.transaction_id },
            '🔄 Iniciando reembolso en Mercado Pago...'
          );

          // Inicialización bajo demanda
          const mpClient = this.getMPClient();
          const refundInstance = new PaymentRefund(mpClient);

          await refundInstance.create({
            payment_id: String(order.transaction_id) as any,
          });

          logger.info('✅ Mercado Pago procesó el reembolso correctamente');
        } catch (mpError: any) {
          logger.error({ mpError: mpError.message }, '❌ Error en API de Mercado Pago');
          throw new AppError(`Mercado Pago no pudo procesar el reembolso: ${mpError.message}`, 400);
        }
      }

      await client.query('COMMIT');
      logger.info({ orderId }, '✅ Proceso de reembolso completado exitosamente');

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId }, '❌ Fallo en el proceso de reembolso');

      if (error instanceof AppError) throw error;
      throw new AppError('Error interno al procesar el reembolso', 500);
    } finally {
      client.release();
    }
  }
}
