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
    // 1. Validación previa de seguridad
    if (order.commissions_calculated) {
      logger.warn({ orderId: order.id }, 'Intento de procesar comisiones ya calculadas');
      return; // Salimos silenciosamente para evitar errores 400 en webhooks reintentados
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 2. Bloqueo de fila para evitar condiciones de carrera (Race Conditions)
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length) throw new AppError('La orden no existe.', 404);
      if (rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      // 3. Determinar moneda de la transacción
      // Prioridad: 1. Moneda de la orden, 2. Moneda del producto, 3. Default ARS
      const orderCurrency = order.currency || product.currency || 'ARS';

      // 4. Obtener configuraciones de comisiones desde la DB
      const configs = await configRepository.getAllConfigs();

      const totalAmount = Number(order.amount);
      const percentValue = configs['fee_percent'] || 0.099;
      const threshold = configs['price_threshold'] || 15;
      const lowFee = configs['fixed_fee_low'] || 0.1;
      const highFee = configs['fixed_fee_high'] || 0.5;

      // Cálculo de Fees de la Plataforma
      const variableFee = totalAmount * percentValue;
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalCremaFee = variableFee + fixedFee;
      let remainingNet = totalAmount - totalCremaFee;

      // 5. Registro de Ganancias de Plataforma
      await client.query(
        `INSERT INTO "${schema}".platform_earnings (order_id, variable_amount, fixed_amount, total_amount, currency) 
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, variableFee, fixedFee, totalCremaFee, orderCurrency]
      );

      // 6. Lógica de Afiliado (Si aplica)
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliateAmount = remainingNet * (Number(product.affiliate_commission_percent) / 100);

        await client.query(
          `INSERT INTO "${schema}".commissions (affiliate_id, order_id, amount, currency, status) 
           VALUES ($1, $2, $3, $4, 'paid')`, // Marcamos como paid pues se suma al balance ahora
          [order.affiliate_id, order.id, affiliateAmount, orderCurrency]
        );

        // ✅ AJUSTE: Pasamos la moneda para que addEarnings use la PK correcta
        await balanceRepository.addEarnings(
          order.affiliate_id,
          affiliateAmount,
          client,
          orderCurrency
        );

        await historyRepository.createRecordWithClient(client, {
          userId: order.affiliate_id,
          order_id: order.id,
          amount: affiliateAmount,
          currency: orderCurrency,
          type: 'sale_affiliate',
          description: `Comisión por venta de: ${product.title || 'Producto'}`,
        });

        remainingNet -= affiliateAmount;
      }

      // 7. Ganancia del Creador
      if (!product.creator_id) {
        throw new AppError('El producto no tiene un creador asignado.', 500);
      }

      // ✅ AJUSTE: Pasamos la moneda también aquí
      await balanceRepository.addEarnings(product.creator_id, remainingNet, client, orderCurrency);

      await historyRepository.createRecordWithClient(client, {
        userId: product.creator_id,
        order_id: order.id,
        amount: remainingNet,
        currency: orderCurrency,
        type: 'sale_creator',
        description: `Venta directa de: ${product.title || 'Producto'}`,
      });

      // 8. Cierre de Orden
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

      logger.error(
        { error: error.message, orderId: order.id },
        'Error crítico en CommissionService'
      );

      if (error instanceof AppError) throw error;
      throw new AppError('Error interno al procesar las comisiones.', 500);
    } finally {
      client.release();
    }
  }
}
