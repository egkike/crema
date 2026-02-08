import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const ReleaseService = {
  /**
   * Procesa la liberación de saldos de 'pending' a 'available'.
   * @param force - Si es true, ignora la garantía de 7 días (útil para tests).
   */
  async processPendingBalances(force: boolean = false) {
    const client = await pool.connect();

    const stats = {
      count: 0,
      releasedToUsers: {} as Record<string, number>, // Dinero real entregado a creadores/afiliados
    };

    try {
      // Definimos la condición de tiempo (si force es true, el intervalo es de 0 segundos)
      const timeCondition = force ? '0 seconds' : `${config.daysOfGuarantee} days`;

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

      logger.info(
        `Iniciando liberación de ${ordersToRelease.length} órdenes. (Force mode: ${force})`
      );

      for (const order of ordersToRelease) {
        try {
          await client.query('BEGIN');

          // 1. OBTENER TODAS LAS COMISIONES DE LA ORDEN
          // El repositorio ya nos da netAmount (lo que el usuario debe recibir)
          const commissions = await commissionRepository.getByOrderId(order.id);

          for (const comm of commissions) {
            if (comm.status === 'pending') {
              // LIBERACIÓN: Mueve de pending_balance a available_balance en user_balances
              await balanceRepository.releaseBalance(
                comm.userId,
                Number(comm.netAmount), // <-- CORREGIDO: Usamos el monto neto, no el bruto de la orden
                order.currency,
                client
              );

              // Acumulamos en las estadísticas de la ejecución
              stats.releasedToUsers[order.currency] =
                (stats.releasedToUsers[order.currency] || 0) + Number(comm.netAmount);
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
