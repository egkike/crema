import pool from '../db/postgres';
import { config } from '../config/index';
import { configRepository } from '../repositories/config.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

const schema = config.db.schema;

export class CommissionService {
  static async processOrderCommissions(order: any, product: any) {
    if (order.commissions_calculated) return;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Bloqueo de fila para evitar condiciones de carrera (Race Conditions)
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      const orderCurrency = order.currency;
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);
      const totalAmount = Number(order.amount);

      // 2. Parámetros de la plataforma (Fees)
      const percentValue = Number(configs['fee_percent'] ?? 0.099); // 9.9%
      const threshold = Number(configs['price_threshold'] ?? 22500);
      const lowFee = Number(configs['fixed_fee_low'] ?? 150.0);
      const highFee = Number(configs['fixed_fee_high'] ?? 750.0);

      // 3. Cálculo de la comisión de la plataforma
      const variableFee = totalAmount * percentValue;
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalPlatformFee = variableFee + fixedFee;

      let remainingNet = totalAmount - totalPlatformFee;

      // 4. Registro de Ganancias de Plataforma
      await client.query(
        `INSERT INTO "${schema}".platform_earnings 
         (order_id, variable_amount, fixed_amount, total_amount, currency, status) 
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [order.id, variableFee, fixedFee, totalPlatformFee, orderCurrency]
      );

      // 5. Lógica de Afiliado
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliateAmount = remainingNet * (Number(product.affiliate_commission_percent) / 100);

        await client.query(
          `INSERT INTO "${schema}".commissions (affiliate_id, order_id, amount, currency, status) 
           VALUES ($1, $2, $3, $4, 'pending')`,
          [order.affiliate_id, order.id, affiliateAmount, orderCurrency]
        );

        await balanceRepository.addPendingBalance(
          order.affiliate_id,
          affiliateAmount,
          orderCurrency,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: order.affiliate_id,
          order_id: order.id,
          amount: affiliateAmount,
          currency: orderCurrency,
          type: 'sale_affiliate',
          description: `Comisión pendiente: ${product.title}`,
        });

        remainingNet -= affiliateAmount;
      }

      // 6. Ganancia del Creador
      await balanceRepository.addPendingBalance(
        product.creator_id,
        remainingNet,
        orderCurrency,
        client
      );

      await historyRepository.createRecordWithClient(client, {
        userId: product.creator_id,
        order_id: order.id,
        amount: remainingNet,
        currency: orderCurrency,
        type: 'sale_creator',
        description: `Venta directa: ${product.title}`,
      });

      // 7. Cierre de la orden - ATENCIÓN: En tu tabla la columna es 'commission_amount' (sin la 's')
      await client.query(
        `UPDATE "${schema}".orders 
         SET commissions_calculated = TRUE, commission_amount = $1 
         WHERE id = $2`,
        [totalPlatformFee, order.id]
      );

      await client.query('COMMIT');
      logger.info({ orderId: order.id }, 'Dinero distribuido exitosamente');

      return { platformFee: totalPlatformFee, creatorNet: remainingNet };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId: order.id }, 'Error en CommissionService');
      throw new AppError('Error al procesar comisiones', 500);
    } finally {
      client.release();
    }
  }
}
