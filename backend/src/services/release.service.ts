import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { historyRepository } from '../repositories/history.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { userRepository } from '../repositories/user.repository';
import logger from '../utils/logger';
import { config } from '../config/index';
import { configService } from '../services/config.service';
import { mainQueue } from '../queues/scheduler';
import { roundToTwo } from '../utils/rounder.util';
import { AppError } from '../errors/AppError';

import { EmailService } from './email.service';

// Definimos una interfaz para las estadísticas del proceso
interface ReleaseStats {
  count: number;
  releasedToUsers: Record<string, number>;
  releasedToPlatform: Record<string, number>;
}

export const ReleaseService = {
  /**
   * Procesa la liberación de saldos pendientes que hayan superado el periodo de la Doble Llave.
   */
  async processPendingBalances(
    force: boolean = false,
    targetOrderId?: string
  ): Promise<ReleaseStats> {
    const schema = config.db?.schema || 'public';

    // Validate schema against allowlist (from config) to prevent SQL injection
    if (!config.allowedSchemas.includes(schema)) {
      throw new AppError('Invalid schema configuration', 400);
    }

    const stats: ReleaseStats = {
      count: 0,
      releasedToUsers: {},
      releasedToPlatform: {},
    };

    // --- LÓGICA SIMPLIFICADA ---
    // Ahora solo comparamos la columna release_at contra NOW()
    const findOrdersQuery = `
      SELECT o.id, o.amount, o.currency, o.release_at, p.creator_id
      FROM "${schema}".orders o
      JOIN "${schema}".products p ON o.product_id = p.id
      WHERE o.status = 'paid' 
      AND o.commissions_calculated = TRUE 
      AND o.balance_released = FALSE
      AND (
        ${
          force
            ? 'TRUE'
            : `
          o.release_at <= NOW() -- Caso A: Ya pasó el tiempo de la Doble Llave
          OR 
          (
            o.is_guarantee_eligible = FALSE -- Caso B: Garantía invalidada por consumo
            AND 
            (o.created_at + (o.gateway_liquidity_days_applied || ' days')::interval) <= NOW() -- Pero aún respetamos a la pasarela
          )
    `
        }
  )
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

      logger.info(`🚀 Iniciando liberación de ${ordersToRelease.length} órdenes.`);

      for (const order of ordersToRelease) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          // Bloqueo preventivo (SKIP LOCKED para evitar colisiones si hay varios cron corriendo)
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
              const amountToRelease = roundToTwo(Number(comm.netAmount));

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
                type: 'balance_release',
                description: `Saldo liberado (${role}) - Orden #${order.id.substring(0, 8)}`,
              });

              stats.releasedToUsers[order.currency] = roundToTwo(
                (stats.releasedToUsers[order.currency] || 0) + amountToRelease
              );

              this.notifyUser(comm.userId, amountToRelease, order.currency);
            }
          }

          // B. LIBERACIÓN A PLATAFORMA (Sincronizada con el release_at)
          const platformEarningsQuery = `
            SELECT id, total_amount, tax_amount, variable_amount, fixed_amount 
            FROM "${schema}".platform_earnings 
            WHERE order_id = $1 
            AND balance_released = FALSE 
            AND status = 'active'
            FOR UPDATE;
          `;
          const { rows: pEarnings } = await client.query(platformEarningsQuery, [order.id]);

          if (pEarnings.length > 0) {
            const earnings = pEarnings[0];
            const pAmount = roundToTwo(Number(earnings.total_amount));

            await platformBalanceRepository.ensureBalanceExists(order.currency, client);
            await platformBalanceRepository.releaseBalance(pAmount, order.currency, client);

            await client.query(
              `UPDATE "${schema}".platform_earnings 
               SET balance_released = TRUE, released_at = CURRENT_TIMESTAMP 
               WHERE id = $1`,
              [earnings.id]
            );

            stats.releasedToPlatform[order.currency] = roundToTwo(
              (stats.releasedToPlatform[order.currency] || 0) + pAmount
            );
          }

          // C. CIERRE DE LA ORDEN
          await commissionRepository.updateStatusByOrder(order.id, 'paid', client);

          await client.query(
            `UPDATE "${schema}".orders 
             SET balance_released = TRUE, updated_at = CURRENT_TIMESTAMP 
             WHERE id = $1`,
            [order.id]
          );

          await client.query('COMMIT');
          stats.count++;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          logger.error(
            { orderId: order.id, error: error instanceof Error ? error.message : String(error) },
            '💥 Error liberando orden individual'
          );
        } finally {
          client.release();
        }
      }

      logger.info(stats, '🏁 Proceso de liberación finalizado');
      return stats;
    } catch (error: unknown) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, '💥 Fallo crítico en ReleaseService');
      throw new AppError(error instanceof Error ? error.message : 'Critical error in ReleaseService', 500);
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
          const releaseDelay = await configService.getNumber('retry.release_delay', 2000);
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
              backoff: { type: 'exponential', delay: releaseDelay },
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
    } catch (err: unknown) {
      logger.error({ userId, error: err instanceof Error ? err.message : String(err) }, 'Error procesando notificación de liberación');
    }
  },
};
