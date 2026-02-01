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

      // 1. Bloqueo de fila (Pessimistic Locking) para evitar Race Conditions
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      const orderCurrency = order.currency;
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);
      const totalAmount = Number(order.amount);

      // 2. Obtención de parámetros de la plataforma
      const percentValue = configs['fee_percent'] ?? 0.099; // 9.9%
      const threshold = configs['price_threshold'] ?? 22500;
      const lowFee = configs['fixed_fee_low'] ?? 150.0;
      const highFee = configs['fixed_fee_high'] ?? 750.0;

      // 3. Cálculo de la "Mordida" de la plataforma
      const variableFee = totalAmount * percentValue;
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalCremaFee = variableFee + fixedFee;

      // Monto que queda para repartir entre Creador y Afiliado
      let remainingNet = totalAmount - totalCremaFee;

      // 4. Registro de Ganancias de Plataforma
      await client.query(
        `INSERT INTO "${schema}".platform_earnings (order_id, variable_amount, fixed_amount, total_amount, currency, status) 
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [order.id, variableFee, fixedFee, totalCremaFee, orderCurrency]
      );

      // 5. Lógica de Afiliado (si aplica)
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliateAmount = remainingNet * (Number(product.affiliate_commission_percent) / 100);

        // Creamos registro de comisión pendiente
        await client.query(
          `INSERT INTO "${schema}".commissions (affiliate_id, order_id, amount, currency, status) 
           VALUES ($1, $2, $3, $4, 'pending')`,
          [order.affiliate_id, order.id, affiliateAmount, orderCurrency]
        );

        // Sumamos al saldo PENDIENTE del afiliado (No disponible aún)
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
          description: `Comisión pendiente por venta de: ${product.title}`,
        });

        remainingNet -= affiliateAmount;
      }

      // 6. Ganancia del Creador (Lo que sobra va al creador)
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
        description: `Venta directa de: ${product.title}`,
      });

      // 7. Marcamos la orden como procesada
      await client.query(
        `UPDATE "${schema}".orders SET commissions_calculated = TRUE, commissions_amount = $1 WHERE id = $2`,
        [totalCremaFee, order.id]
      );

      await client.query('COMMIT');
      logger.info(
        { orderId: order.id, currency: orderCurrency },
        '💰 Dinero repartido en saldos pendientes'
      );

      return { cremaFee: totalCremaFee, creatorNet: remainingNet };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId: order.id }, 'Error repartiendo comisiones');
      throw new AppError('Error interno al repartir comisiones', 500);
    } finally {
      client.release();
    }
  }
}
