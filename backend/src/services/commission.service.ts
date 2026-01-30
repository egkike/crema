import pool from '../db/postgres';
import { config } from '../config/index';
import { configRepository } from '../repositories/config.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository'; // Importamos el nuevo repositorio
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

const schema = config.db.schema;

export class CommissionService {
  static async processOrderCommissions(order: any, product: any) {
    // 1. Validación previa (Idempotencia)
    if (order.commissions_calculated) {
      logger.warn({ orderId: order.id }, 'Intento de procesar comisiones ya calculadas');
      throw new AppError('Las comisiones de esta orden ya han sido procesadas.', 400);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 2. Doble verificación con bloqueo de fila
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length) throw new AppError('La orden no existe.', 404);
      if (rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        throw new AppError('Las comisiones ya fueron procesadas por otro proceso simultáneo.', 409);
      }

      // 3. Cálculos de negocio
      const totalAmount = Number(order.amount);
      const configs = await configRepository.getAllConfigs();

      const percentValue = configs['fee_percent'] || 0.099;
      const variableFee = totalAmount * percentValue;
      const fixedFee = totalAmount <= (configs['price_threshold'] || 15) ? 0.1 : 0.5;
      const totalCremaFee = variableFee + fixedFee;
      let remainingNet = totalAmount - totalCremaFee;

      // 4. Registro Platform Earnings
      await client.query(
        `INSERT INTO "${schema}".platform_earnings (order_id, variable_amount, fixed_amount, total_amount) 
         VALUES ($1, $2, $3, $4)`,
        [order.id, variableFee, fixedFee, totalCremaFee]
      );

      // 5. Lógica de Afiliado
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliateAmount = remainingNet * (Number(product.affiliate_commission_percent) / 100);

        await client.query(
          `INSERT INTO "${schema}".commissions (affiliate_id, order_id, amount, status) 
           VALUES ($1, $2, $3, 'pending')`,
          [order.affiliate_id, order.id, affiliateAmount]
        );

        // Sumar al saldo del afiliado
        await balanceRepository.addEarnings(order.affiliate_id, affiliateAmount, client);

        // REGISTRO EN HISTORIAL: Comisión para el afiliado
        await historyRepository.createRecordWithClient(client, {
          userId: order.affiliate_id,
          orderId: order.id,
          amount: affiliateAmount,
          type: 'sale_affiliate',
          description: `Comisión por venta de: ${product.name || 'Producto'}`,
        });

        remainingNet -= affiliateAmount;
      }

      // 6. Ganancia Creador
      if (!product.creator_id) {
        throw new AppError('El producto no tiene un creador asignado.', 500);
      }

      // Sumar al saldo del creador
      await balanceRepository.addEarnings(product.creator_id, remainingNet, client);

      // REGISTRO EN HISTORIAL: Venta propia para el creador
      await historyRepository.createRecordWithClient(client, {
        userId: product.creator_id,
        orderId: order.id,
        amount: remainingNet,
        type: 'sale_creator',
        description: `Venta directa de: ${product.name || 'Producto'}`,
      });

      // 7. Marcar orden como procesada
      await client.query(
        `UPDATE "${schema}".orders SET commissions_calculated = TRUE WHERE id = $1`,
        [order.id]
      );

      await client.query('COMMIT');
      return { cremaFee: totalCremaFee, creatorNet: remainingNet };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error instanceof AppError) throw error;
      logger.error(
        { error: error.message, orderId: order.id },
        'Error crítico en CommissionService'
      );
      throw new AppError('Error interno al procesar las comisiones.', 500);
    } finally {
      client.release();
    }
  }
}
