import pool from '../db/postgres';
import { config } from '../config/index';
import { configRepository } from '../repositories/config.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

const schema = config.db.schema;

/**
 * Utilidad para redondeo financiero a 2 decimales.
 * El uso de Number.EPSILON asegura que 1.005 redondee a 1.01 y no a 1.00
 */
const roundToTwo = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export class CommissionService {
  static async processOrderCommissions(order: any, product: any) {
    if (order.commissions_calculated) return;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Bloqueo de fila para evitar condiciones de carrera
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      // 2. Actualizar estado de la orden (Atomicidad)
      await client.query(
        `UPDATE "${schema}".orders SET status = 'paid', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [order.id]
      );

      const orderCurrency = order.currency;
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);

      if (!configs || Object.keys(configs).length === 0) {
        throw new AppError(
          `No se encontró configuración de comisiones para la moneda: ${orderCurrency}`,
          500
        );
      }

      const totalAmount = Number(order.amount);

      // Parámetros de la plataforma obtenidos de platform_configs
      const percentValue = Number(configs['fee_percent']);
      const threshold = Number(configs['price_threshold']);
      const lowFee = Number(configs['fixed_fee_low']);
      const highFee = Number(configs['fixed_fee_high']);

      if (isNaN(percentValue) || isNaN(threshold)) {
        throw new AppError(`Parámetros de comisión incompletos para ${orderCurrency}`, 500);
      }

      // 3. CÁLCULO DE COMISIÓN DE PLATAFORMA (REDONDEADO)
      const variableFee = roundToTwo(totalAmount * percentValue);
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalPlatformFee = roundToTwo(variableFee + fixedFee);

      // Calculamos el sobrante neto inicial
      let remainingNet = roundToTwo(totalAmount - totalPlatformFee);

      // 4. Registro de Ganancias de Plataforma
      await client.query(
        `INSERT INTO "${schema}".platform_earnings 
         (order_id, variable_amount, fixed_amount, total_amount, currency, status) 
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [order.id, variableFee, fixedFee, totalPlatformFee, orderCurrency]
      );

      // 5. Lógica de Afiliado (Si aplica)
      let affiliateAmount = 0;
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        // Redondeamos la comisión del afiliado
        affiliateAmount = roundToTwo(
          remainingNet * (Number(product.affiliate_commission_percent) / 100)
        );

        await commissionRepository.create(
          {
            userId: order.affiliate_id,
            orderId: order.id,
            amount: totalAmount,
            feeApplied: 0,
            netAmount: affiliateAmount,
            currency: orderCurrency,
            type: 'affiliate',
            status: 'pending',
          },
          client
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
          description: `Comisión afiliado: ${product.title}`,
        });

        // Actualizamos el remanente después de pagar al afiliado (Redondeado)
        remainingNet = roundToTwo(remainingNet - affiliateAmount);
      }

      // 6. Registro de Ganancia del Creador (Lo que queda finalmente)
      await commissionRepository.create(
        {
          userId: product.creator_id,
          orderId: order.id,
          amount: totalAmount,
          feeApplied: totalPlatformFee,
          netAmount: remainingNet,
          currency: orderCurrency,
          type: 'creator',
          status: 'pending',
        },
        client
      );

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

      // 7. Cierre definitivo de la orden
      await client.query(
        `UPDATE "${schema}".orders 
         SET commissions_calculated = TRUE, commission_amount = $1 
         WHERE id = $2`,
        [totalPlatformFee, order.id]
      );

      await client.query('COMMIT');
      logger.info(
        { orderId: order.id, platformFee: totalPlatformFee, creatorNet: remainingNet },
        'Distribución completada exitosamente con redondeo financiero'
      );

      return { platformFee: totalPlatformFee, creatorNet: remainingNet };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId: order.id }, 'Error en CommissionService');
      throw error instanceof AppError ? error : new AppError('Error al procesar comisiones', 500);
    } finally {
      client.release();
    }
  }
}
