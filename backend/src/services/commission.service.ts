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

      // Bloqueo de fila para evitar doble procesamiento
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      // 1. Moneda de la transacción
      const orderCurrency = order.currency;

      // 2. Obtener configuraciones ESPECÍFICAS para esta moneda
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);

      const totalAmount = Number(order.amount);

      // Si no existe configuración para la moneda, usamos fallback seguros
      // o podrías lanzar un error si prefieres no procesar monedas no configuradas.
      const percentValue = configs['fee_percent'] ?? 0.099;
      const threshold = configs['price_threshold'] ?? 15;
      const lowFee = configs['fixed_fee_low'] ?? 0.1;
      const highFee = configs['fixed_fee_high'] ?? 0.5;

      // 3. Cálculo de Fees de la Plataforma (Dinámico por moneda)
      const variableFee = totalAmount * percentValue;
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalCremaFee = variableFee + fixedFee;
      let remainingNet = totalAmount - totalCremaFee;

      // 4. Registro de Ganancias de Plataforma
      await client.query(
        `INSERT INTO "${schema}".platform_earnings (order_id, variable_amount, fixed_amount, total_amount, currency) 
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, variableFee, fixedFee, totalCremaFee, orderCurrency]
      );

      // 5. Lógica de Afiliado
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliateAmount = remainingNet * (Number(product.affiliate_commission_percent) / 100);

        await client.query(
          `INSERT INTO "${schema}".commissions (affiliate_id, order_id, amount, currency, status) 
           VALUES ($1, $2, $3, $4, 'paid')`,
          [order.affiliate_id, order.id, affiliateAmount, orderCurrency]
        );

        await balanceRepository.addEarnings(
          order.affiliate_id,
          affiliateAmount,
          client,
          orderCurrency
        );

        await historyRepository.createRecordWithClient(client, {
          userId: order.affiliate_id,
          order_id: order.id, // <-- Cambiar de orderId a order_id
          amount: affiliateAmount,
          currency: orderCurrency,
          type: 'sale_affiliate',
          description: `Comisión (${orderCurrency}) por venta de: ${product.title}`,
        });

        remainingNet -= affiliateAmount;
      }

      // 6. Ganancia del Creador
      await balanceRepository.addEarnings(product.creator_id, remainingNet, client, orderCurrency);

      await historyRepository.createRecordWithClient(client, {
        userId: product.creator_id,
        order_id: order.id, // <-- Cambiar de orderId a order_id
        amount: remainingNet,
        currency: orderCurrency,
        type: 'sale_creator',
        description: `Venta directa (${orderCurrency}) de: ${product.title}`,
      });
      
      // 7. Cierre de Orden
      await client.query(
        `UPDATE "${schema}".orders SET commissions_calculated = TRUE WHERE id = $1`,
        [order.id]
      );

      await client.query('COMMIT');

      logger.info(
        { orderId: order.id, currency: orderCurrency },
        'Comisiones procesadas exitosamente'
      );

      return { cremaFee: totalCremaFee, creatorNet: remainingNet, currency: orderCurrency };
    } catch (error: any) {
      if (client) await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId: order.id }, 'Error en CommissionService');
      throw new AppError('Error al procesar comisiones', 500);
    } finally {
      client.release();
    }
  }
}
