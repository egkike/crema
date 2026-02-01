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

    // Inicializamos el resumen para el logger del index.ts
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

          // --- A. LIBERAR AL AFILIADO ---
          if (order.affiliate_id) {
            const commissions = await commissionRepository.getByOrderId(order.id);
            const affiliateComm = commissions.find(c => c.affiliate_id === order.affiliate_id);

            if (affiliateComm && affiliateComm.status === 'pending') {
              await balanceRepository.releaseBalance(
                order.affiliate_id,
                Number(affiliateComm.amount),
                order.currency,
                client
              );
              await commissionRepository.updateStatusByOrder(order.id, 'paid', client);
            }
          }

          // --- B. LIBERAR AL CREADOR ---
          const creatorAmount = await this.calculateCreatorNet(order, client);

          if (creatorAmount > 0) {
            await balanceRepository.releaseBalance(
              order.creator_id,
              creatorAmount,
              order.currency,
              client
            );
          }

          // --- C. MARCAR ORDEN COMO LIBERADA ---
          await client.query(
            `UPDATE "${schema}".orders SET balance_released = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [order.id]
          );

          await client.query('COMMIT');

          // --- D. ACTUALIZAR ESTADÍSTICAS ---
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

      return stats; // Devolvemos el resultado al Cron del index.ts
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fallo crítico en ReleaseService');
      throw error;
    } finally {
      client.release();
    }
  },

  async calculateCreatorNet(order: any, client: any): Promise<number> {
    const query = `
      SELECT amount FROM "${schema}".balance_history 
      WHERE order_id = $1 AND user_id = $2 AND type = 'sale_creator' 
      LIMIT 1
    `;
    const db = client || pool;
    const { rows } = await db.query(query, [order.id, order.creator_id]);
    return rows[0] ? Math.abs(Number(rows[0].amount)) : 0;
  },
};
