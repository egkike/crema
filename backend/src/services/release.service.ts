import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { historyRepository } from '../repositories/history.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

export const ReleaseService = {
  /**
   * Procesa la liberación de saldos de 'pending' a 'available'.
   * @param force - Si es true, ignora la garantía de 7 días (útil para tests).
   */
  async processPendingBalances(force: boolean = false) {
    const schema = config.db?.schema || 'public';
    const daysOfGuarantee = config.daysOfGuarantee || 7;

    const client = await pool.connect();

    const stats = {
      count: 0,
      releasedToUsers: {} as Record<string, number>,
    };

    try {
      const timeCondition = force ? '0 seconds' : `${daysOfGuarantee} days`;

      // Seleccionamos órdenes que ya cumplieron el plazo de garantía
      const query = `
        SELECT o.id, o.amount, o.currency 
        FROM "${schema}".orders o
        WHERE o.status = 'paid' 
        AND o.commissions_calculated = TRUE 
        AND o.balance_released = FALSE
        AND o.updated_at <= NOW() - INTERVAL '${timeCondition}'
        FOR UPDATE OF o SKIP LOCKED;
      `;

      const { rows: ordersToRelease } = await client.query(query);

      if (ordersToRelease.length === 0) {
        logger.info('No hay órdenes pendientes de liberación.');
        return stats;
      }

      logger.info(`Iniciando liberación de ${ordersToRelease.length} órdenes.`);

      for (const order of ordersToRelease) {
        try {
          await client.query('BEGIN');

          // 1. Obtener comisiones asociadas a la orden
          const commissions = await commissionRepository.getByOrderId(order.id);

          for (const comm of commissions) {
            if (comm.status === 'pending') {
              // 2. Mover de pending_balance a available_balance
              await balanceRepository.releaseBalance(
                comm.userId,
                Number(comm.netAmount),
                order.currency,
                client
              );

              // 3. REGISTRAR EN EL HISTORIAL DE BALANCES
              await historyRepository.createRecordWithClient(client, {
                userId: comm.userId,
                order_id: order.id,
                amount: Number(comm.netAmount),
                currency: order.currency,
                type: 'sale_creator',
                description: `Garantía cumplida: Saldo liberado de la orden #${order.id.substring(0, 8)}`,
              });

              stats.releasedToUsers[order.currency] =
                (stats.releasedToUsers[order.currency] || 0) + Number(comm.netAmount);
            }
          }

          // 4. Actualizar estado de comisiones a 'paid'
          await commissionRepository.updateStatusByOrder(order.id, 'paid', client);

          // 5. Marcar orden como liberada
          await client.query(
            `UPDATE "${schema}".orders SET balance_released = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [order.id]
          );

          await client.query('COMMIT');
          stats.count++;
        } catch (error: any) {
          await client.query('ROLLBACK');
          logger.error(
            { orderId: order.id, error: error.message },
            'Error liberando orden individual'
          );
        }
      }

      logger.info(stats, 'Proceso de liberación completado exitosamente');
      return stats;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fallo crítico en ReleaseService');
      throw error;
    } finally {
      client.release();
    }
  },
};
