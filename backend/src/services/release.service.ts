import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { productRepository } from '../repositories/product.repository';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const ReleaseService = {
  async processPendingBalances() {
    const daysOfGuarantee = 7;
    const client = await pool.connect();

    try {
      // 1. Buscamos órdenes con garantía vencida
      const query = `
        SELECT id, creator_id, affiliate_id, amount, currency 
        FROM "${schema}".orders 
        WHERE status = 'paid' 
        AND commissions_calculated = TRUE 
        AND balance_released = FALSE
        AND updated_at <= NOW() - INTERVAL '${daysOfGuarantee} days'
        FOR UPDATE SKIP LOCKED;
      `;

      const { rows: ordersToRelease } = await client.query(query);
      if (ordersToRelease.length === 0) return;

      logger.info(`Liberando saldos para ${ordersToRelease.length} órdenes.`);

      for (const order of ordersToRelease) {
        try {
          await client.query('BEGIN');

          // --- A. LIBERAR AL AFILIADO (Si existe) ---
          if (order.affiliate_id) {
            const commissions = await commissionRepository.getByOrderId(order.id);
            // Buscamos la comisión específica del afiliado en esta orden
            const affiliateComm = commissions.find(c => c.affiliate_id === order.affiliate_id);

            if (affiliateComm) {
              await balanceRepository.releaseBalance(
                order.affiliate_id,
                affiliateComm.amount,
                order.currency,
                client
              );
            }
          }

          // --- B. LIBERAR AL CREADOR ---
          // Necesitamos saber cuánto le quedó al creador después de comisiones y fees.
          // Para no recalcular todo, podemos sacarlo por diferencia o guardar el neto en 'orders'.
          // Aquí lo calculamos buscando el producto para obtener su creator_id.
          const product = await productRepository.getProductById(order.product_id);

          if (product && product.creator_id) {
            // El saldo pendiente del creador es el que quedó tras procesar la orden.
            // Usamos una función dedicada en el repo de balances para liberar TODO lo pendiente de esta orden
            // O calculamos el neto: (Total - Fees - Comisión Afiliado)
            // Por simplicidad en este ejemplo, liberamos basándonos en el registro de balance:

            // Nota: Aquí lo ideal es que tu tabla 'commissions' también guarde la parte del creador
            // o que la tabla 'orders' tenga una columna 'creator_net_amount'.
            // Si no, podemos hacer un query directo a los movimientos de balance history.

            // Para mantenerlo consistente con tu estructura actual:
            const creatorAmount = await this.calculateCreatorNet(order, client);
            await balanceRepository.releaseBalance(
              product.creator_id,
              creatorAmount,
              order.currency,
              client
            );
          }

          // C. MARCAR COMO COMPLETADO
          await client.query(
            `UPDATE "${schema}".orders SET balance_released = TRUE WHERE id = $1`,
            [order.id]
          );

          await client.query('COMMIT');
        } catch (error: any) {
          await client.query('ROLLBACK');
          logger.error(
            { orderId: order.id, error: error.message },
            'Fallo al liberar saldo de orden'
          );
        }
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en ReleaseService');
    } finally {
      client.release();
    }
  },

  // Función auxiliar para recuperar el monto neto que fue a parar al creador
  async calculateCreatorNet(order: any, client: any): Promise<number> {
    const query = `
      SELECT amount FROM "${schema}".balance_history 
      WHERE order_id = $1 AND type = 'sale_creator' 
      LIMIT 1
    `;
    const { rows } = await client.query(query, [order.id]);
    return rows[0] ? Number(rows[0].amount) : 0;
  },
};
