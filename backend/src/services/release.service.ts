import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { historyRepository } from '../repositories/history.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

import { EmailService } from './email.service';

export const ReleaseService = {
  async processPendingBalances(force: boolean = false, targetOrderId?: string) {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    const stats = {
      count: 0,
      releasedToUsers: {} as Record<string, number>,
      releasedToPlatform: {} as Record<string, number>,
    };

    try {
      const intervalSql = force
        ? "INTERVAL '0 seconds'"
        : "(o.days_of_guarantee_applied || ' days')::INTERVAL";

      // JOIN con la tabla products para obtener p.creator_id
      const query = `
        SELECT o.id, o.amount, o.currency, p.creator_id, o.days_of_guarantee_applied
        FROM "${schema}".orders o
        JOIN "${schema}".products p ON o.product_id = p.id
        WHERE o.status = 'paid' 
        AND o.commissions_calculated = TRUE 
        AND o.balance_released = FALSE
        AND o.created_at <= NOW() - ${intervalSql}
        ${targetOrderId ? `AND o.id = $1` : ''}
        FOR UPDATE OF o SKIP LOCKED;
      `;

      const queryParams = targetOrderId ? [targetOrderId] : [];
      const { rows: ordersToRelease } = await client.query(query, queryParams);

      if (ordersToRelease.length === 0) {
        logger.debug('No hay órdenes pendientes de liberación.');
        return stats;
      }

      logger.info(`Iniciando liberación de ${ordersToRelease.length} órdenes.`);

      for (const order of ordersToRelease) {
        try {
          await client.query('BEGIN');

          const commissions = await commissionRepository.getByOrderId(order.id);

          for (const comm of commissions) {
            // ✅ IMPORTANTE: Aquí usamos comm.userId y comm.netAmount
            // porque tu repositorio ya hace el mapeo de snake_case a camelCase.
            if (comm.status === 'pending') {
              const amountToRelease = Math.floor(Number(comm.netAmount) * 100) / 100;

              await balanceRepository.releaseBalance(
                comm.userId,
                amountToRelease,
                order.currency,
                client
              );

              const isCreator = comm.userId === order.creator_id;
              const historyType = isCreator ? 'sale_creator' : 'sale_affiliate';

              await historyRepository.createRecordWithClient(client, {
                userId: comm.userId,
                order_id: order.id,
                amount: amountToRelease,
                currency: order.currency,
                type: historyType as any,
                description: `Garantía cumplida: Saldo liberado (Orden #${order.id.substring(0, 8)})`,
              });

              stats.releasedToUsers[order.currency] =
                (stats.releasedToUsers[order.currency] || 0) + amountToRelease;

              this.notifyUser(comm.userId, amountToRelease, order.currency, schema);
            }
          }

          const platformEarningsQuery = `
            SELECT total_amount, currency 
            FROM "${schema}".platform_earnings 
            WHERE order_id = $1 AND balance_released = FALSE AND status = 'active'
            FOR UPDATE;
          `;
          const { rows: pEarnings } = await client.query(platformEarningsQuery, [order.id]);

          if (pEarnings.length > 0) {
            const pAmount = Number(pEarnings[0].total_amount);

            await platformBalanceRepository.ensureBalanceExists(order.currency, client);
            await platformBalanceRepository.releaseBalance(pAmount, order.currency, client);

            await client.query(
              `UPDATE "${schema}".platform_earnings 
               SET balance_released = TRUE, released_at = CURRENT_TIMESTAMP 
               WHERE order_id = $1`,
              [order.id]
            );

            stats.releasedToPlatform[order.currency] =
              (stats.releasedToPlatform[order.currency] || 0) + pAmount;
          }

          await commissionRepository.updateStatusByOrder(order.id, 'paid', client);

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

  async notifyUser(userId: string, amount: number, currency: string, schema: string) {
    try {
      const res = await pool.query(`SELECT email, fullname FROM "${schema}".users WHERE id = $1`, [
        userId,
      ]);
      const user = res.rows[0];
      if (user) {
        EmailService.sendBalanceReleasedEmail(user.email, user.fullname, amount, currency);
      }
    } catch (err: any) {
      logger.error(`Error en notificación: ${err.message}`);
    }
  },
};
