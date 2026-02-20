import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { historyRepository } from '../repositories/history.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/logger';
import { config } from '../config/index';
import { mainQueue } from '../queues/scheduler';

import { EmailService } from './email.service';

// Definimos una interfaz para las estadísticas del proceso
interface ReleaseStats {
  count: number;
  releasedToUsers: Record<string, number>;
  releasedToPlatform: Record<string, number>;
}

export const ReleaseService = {
  /**
   * Procesa la liberación de saldos pendientes que hayan superado el periodo de garantía.
   */
  async processPendingBalances(
    force: boolean = false,
    targetOrderId?: string
  ): Promise<ReleaseStats> {
    const schema = config.db?.schema || 'public';

    const stats: ReleaseStats = {
      count: 0,
      releasedToUsers: {},
      releasedToPlatform: {},
    };

    // 1. Buscamos las órdenes candidatas fuera de una transacción larga para no bloquear la DB entera
    const intervalSql = force
      ? "INTERVAL '0 seconds'"
      : "(COALESCE(o.days_of_guarantee_applied, 7) || ' days')::INTERVAL";

    const findOrdersQuery = `
      SELECT o.id, o.amount, o.currency, p.creator_id
      FROM "${schema}".orders o
      JOIN "${schema}".products p ON o.product_id = p.id
      WHERE o.status = 'paid' 
      AND o.commissions_calculated = TRUE 
      AND o.balance_released = FALSE
      AND o.created_at <= NOW() - ${intervalSql}
      ${targetOrderId ? `AND o.id = $1` : ''}
    `;

    try {
      const { rows: ordersToRelease } = await pool.query(
        findOrdersQuery,
        targetOrderId ? [targetOrderId] : []
      );

      if (ordersToRelease.length === 0) {
        return stats;
      }

      logger.info(`Iniciando liberación de ${ordersToRelease.length} órdenes.`);

      // 2. Procesamos cada orden con su propia transacción y su propio cliente del pool
      for (const order of ordersToRelease) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Bloqueamos la fila de la orden para evitar procesamientos duplicados (FOR UPDATE)
          const lockOrder = await client.query(
            `SELECT id FROM "${schema}".orders WHERE id = $1 AND balance_released = FALSE FOR UPDATE SKIP LOCKED`,
            [order.id]
          );

          if (lockOrder.rows.length === 0) {
            await client.query('ROLLBACK');
            continue;
          }

          // A. LIBERACIÓN A USUARIOS (Creador y Afiliados)
          const commissions = await commissionRepository.getByOrderId(order.id);

          for (const comm of commissions) {
            if (comm.status === 'pending') {
              const amountToRelease = Math.floor(Number(comm.netAmount) * 100) / 100;

              // Mueve de pending_balance a available_balance
              await balanceRepository.releaseBalance(
                comm.userId,
                amountToRelease,
                order.currency,
                client
              );

              const role = comm.userId === order.creator_id ? 'Creador' : 'Afiliado';

              await historyRepository.createRecordWithClient(client, {
                userId: comm.userId,
                order_id: order.id,
                amount: amountToRelease,
                currency: order.currency,
                type: 'balance_release' as any,
                description: `Saldo liberado (${role}) - Orden #${order.id.substring(0, 8)}`,
              });

              stats.releasedToUsers[order.currency] =
                (stats.releasedToUsers[order.currency] || 0) + amountToRelease;

              // Notificación asíncrona (fuera de la transacción para no demorar)
              this.notifyUser(comm.userId, amountToRelease, order.currency);
            }
          }

          // B. LIBERACIÓN A PLATAFORMA
          const platformEarningsQuery = `
            SELECT id, total_amount, tax_amount, variable_amount, fixed_amount 
            FROM "${schema}".platform_earnings 
            WHERE order_id = $1 AND balance_released = FALSE AND status = 'active'
            FOR UPDATE;
          `;
          const { rows: pEarnings } = await client.query(platformEarningsQuery, [order.id]);

          if (pEarnings.length > 0) {
            const earnings = pEarnings[0];
            const pAmount = Number(earnings.total_amount);

            // Seguimos usando pAmount para el balance disponible (incluye el impuesto)
            await platformBalanceRepository.ensureBalanceExists(order.currency, client);
            await platformBalanceRepository.releaseBalance(pAmount, order.currency, client);

            await client.query(
              `UPDATE "${schema}".platform_earnings 
               SET balance_released = TRUE, released_at = CURRENT_TIMESTAMP 
               WHERE id = $1`,
              [earnings.id]
            );

            // Log informativo más detallado
            logger.info(
              {
                orderId: order.id,
                netGain: Number(earnings.variable_amount) + Number(earnings.fixed_amount),
                taxCollected: Number(earnings.tax_amount),
              },
              '💰 Ganancia de plataforma liberada'
            );

            stats.releasedToPlatform[order.currency] =
              (stats.releasedToPlatform[order.currency] || 0) + pAmount;
          }

          // C. CIERRE DE LA ORDEN
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
        } finally {
          client.release();
        }
      }

      logger.info(stats, 'Proceso de liberación finalizado');
      return stats;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Fallo crítico en ReleaseService');
      throw error;
    }
  },

  /**
   * Notifica al usuario por email de forma segura.
   */
  async notifyUser(userId: string, amount: number, currency: string) {
    try {
      const user = await userRepository.getById(userId);

      if (user) {
        if (mainQueue) {
          // Encolamos la tarea para que el worker la procese después
          await mainQueue.add(
            'send-email',
            {
              type: 'BALANCE_RELEASED',
              to: user.email,
              data: {
                fullname: user.fullname,
                amount,
                currency,
              },
            },
            {
              attempts: 5,
              backoff: { type: 'exponential', delay: 2000 },
              removeOnComplete: true, // Limpieza automática de Redis
            }
          );
          logger.debug({ userId, orderId: '...' }, 'Email de liberación encolado en BullMQ');
        } else {
          // Fallback: Si por alguna razón BullMQ no está listo, enviamos directo
          // para no perder la notificación, aunque lo ideal es que BullMQ siempre esté.
          await EmailService.sendBalanceReleasedEmail(user.email, user.fullname, amount, currency);
        }
      }
    } catch (err: any) {
      logger.error({ userId, error: err.message }, 'Error procesando notificación de liberación');
    }
  },
};
