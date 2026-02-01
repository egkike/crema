import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { orderRepository } from '../repositories/order.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { refundRepository } from '../repositories/refund.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export class RefundService {
  static async processRefund(orderId: string, reason: string = 'Reembolso solicitado') {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener orden con bloqueo para evitar colisiones
      const order = await orderRepository.getById(orderId, client);
      if (!order) throw new AppError('La orden no existe', 404);
      if (order.status === 'refunded') throw new AppError('La orden ya fue reembolsada', 400);

      // Regla de Oro: Solo se reembolsa si el dinero sigue "congelado" (Pending)
      if (order.balance_released) {
        throw new AppError(
          'El saldo ya fue liberado al creador. El reembolso debe gestionarse por soporte.',
          400
        );
      }

      const orderCurrency = order.currency;

      // 2. DESCONTAR AL AFILIADO
      const commissions = await commissionRepository.getByOrderId(orderId);
      const affiliateComm = commissions.find(c => c.affiliate_id === order.affiliate_id);

      if (affiliateComm && affiliateComm.status === 'pending') {
        const affAmount = Number(affiliateComm.amount);
        await balanceRepository.deductPendingEarnings(
          affiliateComm.affiliate_id,
          affAmount,
          orderCurrency,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: affiliateComm.affiliate_id,
          order_id: orderId, // Usamos snake_case según tu Repo
          amount: -affAmount,
          currency: orderCurrency,
          type: 'refund' as any,
          description: `Deducción por reembolso: Orden #${orderId}`,
        });
      }

      // 3. DESCONTAR AL CREADOR (Buscamos el registro exacto en el historial)
      const creatorEntry = await client.query(
        `SELECT amount FROM "${schema}".balance_history 
         WHERE order_id = $1 AND user_id = $2 AND type = 'sale_creator'`,
        [orderId, order.seller_id || order.creator_id]
      );

      if (creatorEntry.rows[0]) {
        const creatorAmount = Math.abs(Number(creatorEntry.rows[0].amount));

        await balanceRepository.deductPendingEarnings(
          order.seller_id || order.creator_id,
          creatorAmount,
          orderCurrency,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: order.seller_id || order.creator_id,
          order_id: orderId,
          amount: -creatorAmount,
          currency: orderCurrency,
          type: 'refund' as any,
          description: `Deducción por reembolso: Orden #${orderId}`,
        });
      }

      // 4. Actualizar estados en cascada
      await orderRepository.updateStatus(orderId, 'refunded', client);
      await commissionRepository.updateStatusByOrder(orderId, 'refunded', client);

      // 5. Auditoría de Reembolso
      await refundRepository.create(
        {
          orderId,
          sellerId: order.seller_id || order.creator_id,
          buyerId: order.buyer_id,
          amount: Number(order.amount),
          currency: orderCurrency,
          reason,
        },
        client
      );

      await client.query('COMMIT');
      logger.info({ orderId }, 'Reembolso procesado y saldos pendientes revertidos');

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId }, 'Fallo en proceso de reembolso');
      throw error instanceof AppError ? error : new AppError('Error interno en reembolso', 500);
    } finally {
      client.release();
    }
  }
}
