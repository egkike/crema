import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { orderRepository } from '../repositories/order.repository';
import { commissionRepository } from '../repositories/commission.repository'; // Importante para el afiliado
import { refundRepository } from '../repositories/refund.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class RefundService {
  static async processRefund(orderId: string, reason: string = 'Reembolso solicitado') {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Bloqueo de orden para evitar reembolsos duplicados simultáneos
      const order = await orderRepository.getById(orderId, client);
      if (!order) throw new AppError('La orden no existe', 404);
      if (order.status === 'refunded') throw new AppError('La orden ya fue reembolsada', 400);
      if (order.balance_released) {
        throw new AppError(
          'No se puede reembolsar una orden con saldo ya liberado. Contacte a soporte.',
          400
        );
      }

      const orderCurrency = order.currency;

      // 2. Obtener comisiones asociadas para saber a quién descontar
      const commissions = await commissionRepository.getByOrderId(orderId);

      // --- A. DESCONTAR AL AFILIADO (Si existe) ---
      const affiliateComm = commissions.find(c => c.affiliate_id === order.affiliate_id);
      if (affiliateComm) {
        await balanceRepository.deductPendingEarnings(
          affiliateComm.affiliate_id,
          affiliateComm.amount,
          orderCurrency,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: affiliateComm.affiliate_id,
          order_id: orderId,
          amount: -affiliateComm.amount,
          currency: orderCurrency,
          type: 'refund' as any,
          description: `Reembolso: Deducción de comisión por Orden #${orderId}`,
        });
      }

      // --- B. DESCONTAR AL CREADOR ---
      // Calculamos cuánto recibió el creador originalmente (Neto)
      // En tu sistema, el creador recibe: Total - Fees Plataforma - Comisión Afiliado
      const creatorEntry = await client.query(
        `SELECT amount FROM balance_history WHERE order_id = $1 AND user_id = $2 AND type = 'sale_creator'`,
        [orderId, order.creator_id]
      );

      if (creatorEntry.rows[0]) {
        const creatorAmount = Math.abs(Number(creatorEntry.rows[0].amount));

        await balanceRepository.deductPendingEarnings(
          order.creator_id,
          creatorAmount,
          orderCurrency,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: order.creator_id,
          order_id: orderId,
          amount: -creatorAmount,
          currency: orderCurrency,
          type: 'refund' as any,
          description: `Reembolso: Deducción de venta por Orden #${orderId}`,
        });
      }

      // 3. Actualizar estados
      await orderRepository.updateByExternalRef(
        order.external_reference,
        { status: 'refunded' },
        client
      );
      await commissionRepository.updateStatusByOrder(orderId, 'refunded', client);

      // 4. Crear registro en tabla refunds para auditoría
      await refundRepository.create(
        {
          orderId,
          sellerId: order.creator_id,
          buyerId: order.buyer_id,
          amount: Number(order.amount),
          currency: orderCurrency,
          reason,
        },
        client
      );

      await client.query('COMMIT');
      logger.info({ orderId }, '✅ Reembolso procesado en cascada correctamente');

      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId }, '❌ Error en processRefund');
      throw error instanceof AppError ? error : new AppError('Error al procesar reembolso', 500);
    } finally {
      client.release();
    }
  }
}
