import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const ReleaseService = {
  async processPendingBalances() {
    const daysOfGuarantee = 7;
    // Usamos el pool para obtener el cliente de la consulta de selección
    const client = await pool.connect();

    try {
      // 1. Buscamos órdenes candidatas a liberación
      const query = `
        SELECT id, product_id, creator_id, affiliate_id, amount, currency 
        FROM "${schema}".orders 
        WHERE status = 'paid' 
        AND commissions_calculated = TRUE 
        AND balance_released = FALSE
        AND updated_at <= NOW() - INTERVAL '${daysOfGuarantee} days'
        FOR UPDATE SKIP LOCKED;
      `;

      const { rows: ordersToRelease } = await client.query(query);

      if (ordersToRelease.length === 0) {
        return;
      }

      logger.info(`Iniciando liberación de saldos para ${ordersToRelease.length} órdenes.`);

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
                affiliateComm.amount,
                order.currency,
                client
              );
              // Actualizamos el estado de la comisión a 'paid'
              await commissionRepository.updateStatusByOrder(order.id, 'paid', client);
            }
          }

          // --- B. LIBERAR AL CREADOR ---
          // Usamos el creator_id que ya viene en la fila de la orden
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
          logger.info({ orderId: order.id }, '✅ Saldo liberado exitosamente');
        } catch (error: any) {
          await client.query('ROLLBACK');
          logger.error(
            { orderId: order.id, error: error.message },
            '❌ Error liberando orden individual'
          );
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fallo crítico en ReleaseService');
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
    const { rows } = await client.query(query, [order.id, order.creator_id]);
    return rows[0] ? Math.abs(Number(rows[0].amount)) : 0;
  },
};
