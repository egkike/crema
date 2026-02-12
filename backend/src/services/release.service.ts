import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { historyRepository } from '../repositories/history.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

import { EmailService } from './email.service';

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
      // >>> FIX: Añadimos o.creator_id a la consulta para poder comparar en el loop <<<
      const query = `
        SELECT o.id, o.amount, o.currency, o.creator_id 
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
              // >>> Sanitización de precisión para evitar basura decimal <<<
              const amountToRelease = Math.floor(Number(comm.netAmount) * 100) / 100;

              await balanceRepository.releaseBalance(
                comm.userId,
                amountToRelease,
                order.currency,
                client
              );

              // 3. REGISTRAR EN EL HISTORIAL DE BALANCES
              // >>> Tipo de historial dinámico (Creador vs Afiliado) <<<
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

              // >>> FIX: Usamos el monto sanitizado para las estadísticas <<<
              stats.releasedToUsers[order.currency] =
                (stats.releasedToUsers[order.currency] || 0) + amountToRelease;
              // >>> NOTIFICACIÓN POR EMAIL <<<
              // Traemos el usuario para el envío (dentro de la transacción o justo después del release)
              // Nota: Se recomienda disparar el email después del COMMIT para evitar re-envíos si falla la DB
              client
                .query(`SELECT email, fullname FROM "${schema}".users WHERE id = $1`, [comm.userId])
                .then(res => {
                  const user = res.rows[0];
                  if (user) {
                    EmailService.sendBalanceReleasedEmail(
                      user.email,
                      user.fullname,
                      amountToRelease,
                      order.currency
                    );
                  }
                })
                .catch(err => logger.error(`Error buscando usuario para email: ${err.message}`));
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
