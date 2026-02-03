import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const ReleaseService = {
  async processPendingBalances() {
    const daysOfGuarantee = 7;
    const client = await pool.connect();

    const stats = {
      count: 0,
      totalAmount: {} as Record<string, number>,
    };

    try {
      const query = `
        SELECT o.id, o.product_id, p.creator_id, o.affiliate_id, o.amount, o.currency 
        FROM "${schema}".orders o
        JOIN "${schema}".products p ON o.product_id = p.id
        WHERE o.status = 'paid' 
        AND o.commissions_calculated = TRUE 
        AND o.balance_released = FALSE
        AND o.updated_at <= NOW() - INTERVAL '${daysOfGuarantee} days'
        FOR UPDATE OF o SKIP LOCKED;
      `;

      const { rows: ordersToRelease } = await client.query(query);

      if (ordersToRelease.length === 0) return stats;

      logger.info(`Iniciando liberación de ${ordersToRelease.length} órdenes.`);

      for (const order of ordersToRelease) {
        try {
          await client.query('BEGIN');

          // 1. OBTENER TODAS LAS COMISIONES DE LA ORDEN
          // Usamos 'user_id' y 'type' que es lo que realmente tiene tu tabla commissions
          const commissions = await commissionRepository.getByOrderId(order.id);

          for (const comm of commissions) {
            if (comm.status === 'pending') {
              // Liberamos el saldo al usuario correspondiente (sea creador o afiliado)
              await balanceRepository.releaseBalance(
                comm.userId,
                Number(comm.amount),
                order.currency,
                client
              );
            }
          }

          // 2. ACTUALIZAR ESTADO DE COMISIONES A 'paid'
          await commissionRepository.updateStatusByOrder(order.id, 'paid', client);

          // 3. MARCAR ORDEN COMO LIBERADA
          await client.query(
            `UPDATE "${schema}".orders SET balance_released = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [order.id]
          );

          await client.query('COMMIT');

          stats.count++;
          stats.totalAmount[order.currency] =
            (stats.totalAmount[order.currency] || 0) + Number(order.amount);
        } catch (error: any) {
          await client.query('ROLLBACK');
          logger.error(
            { orderId: order.id, error: error.message },
            'Error liberando orden individual'
          );
        }
      }

      return stats;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fallo crítico en ReleaseService');
      throw error;
    } finally {
      client.release();
    }
  },
};
