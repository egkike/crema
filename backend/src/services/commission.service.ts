import pool from '../db/postgres';
import { config } from '../config/index';
import { configRepository } from '../repositories/config.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Utilidad para redondeo financiero a 2 decimales para evitar errores de coma flotante.
 */
const roundToTwo = (num: number): number => {
  return Math.round((num + Number.EPSILON) * 100) / 100;
};

export class CommissionService {
  static async processOrderCommissions(order: any, product: any) {
    const schema = config.db?.schema || 'public';

    // Evitar procesamiento doble
    if (order.commissions_calculated) return;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Bloqueo de seguridad para evitar condiciones de carrera
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        await client.query('ROLLBACK');
        return;
      }

      const orderCurrency = order.currency;
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);

      if (!configs || Object.keys(configs).length === 0) {
        throw new AppError(`Configuración inexistente para moneda: ${orderCurrency}`, 500);
      }

      // 2. CÁLCULO DE COMISIÓN DE PLATAFORMA
      // --- Lógica de Plan ---
      const subscription = await subscriptionRepository.getActiveSubscription(product.creator_id);

      let percentValue = Number(configs['fee_percent']); // Default global (0.099)

      // Si el plan del usuario define una comisión específica (ej: 0.05 para 5%)
      if (subscription?.features?.custom_fee_percent !== undefined) {
        percentValue = Number(subscription.features.custom_fee_percent);
        logger.info(
          { userId: product.creator_id, plan: subscription.plan_name },
          'Aplicando comisión preferencial por plan'
        );
      }
      // ------------------------------------

      const totalAmount = Number(order.amount);
      const threshold = Number(configs['price_threshold']);
      const lowFee = Number(configs['fixed_fee_low']);
      const highFee = Number(configs['fixed_fee_high']);

      const variableFee = roundToTwo(totalAmount * percentValue);
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalPlatformFee = roundToTwo(variableFee + fixedFee);

      // 3. REGISTRO DE GANANCIAS DE LA PLATAFORMA
      await client.query(
        `INSERT INTO "${schema}".platform_earnings 
         (order_id, variable_amount, fixed_amount, total_amount, currency, status, balance_released) 
         VALUES ($1, $2, $3, $4, $5, 'active', FALSE)`,
        [order.id, variableFee, fixedFee, totalPlatformFee, orderCurrency]
      );

      await platformBalanceRepository.addToPending(totalPlatformFee, orderCurrency, client);

      // 4. LÓGICA DE AFILIADO
      let affiliateAmount = 0;
      if (order.affiliate_id) {
        const rawMinComm = await configRepository.getSetting(
          'min_global_affiliate_commission',
          '10'
        );
        const minGlobalComm = Number(rawMinComm);

        const productCommPercent = Number(product.affiliate_commission_percent || 0);
        const effectiveCommPercent = Math.max(productCommPercent, minGlobalComm);

        affiliateAmount = roundToTwo(totalAmount * (effectiveCommPercent / 100));

        if (affiliateAmount > 0) {
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
        }
      }

      // 5. REGISTRO DE GANANCIA DEL CREADOR
      // Usamos el mismo método de redondeo para consistencia absoluta
      const creatorNetAmount = roundToTwo(totalAmount - totalPlatformFee - affiliateAmount);

      if (creatorNetAmount < 0) {
        throw new AppError('Las comisiones superan el total de la venta.', 500);
      }

      await commissionRepository.create(
        {
          userId: product.creator_id,
          orderId: order.id,
          amount: totalAmount,
          feeApplied: totalPlatformFee,
          netAmount: creatorNetAmount,
          currency: orderCurrency,
          type: 'creator',
          status: 'pending',
        },
        client
      );

      await balanceRepository.addPendingBalance(
        product.creator_id,
        creatorNetAmount,
        orderCurrency,
        client
      );

      await historyRepository.createRecordWithClient(client, {
        userId: product.creator_id,
        order_id: order.id,
        amount: creatorNetAmount,
        currency: orderCurrency,
        type: 'sale_creator',
        description: `Venta directa: ${product.title}`,
      });

      // 6. ACTUALIZACIÓN FINAL DE LA ORDEN
      // Guardamos un snapshot de los días de garantía aplicados en este momento
      const currentGuaranteeDays = product.days_of_guarantee || 7;

      await client.query(
        `UPDATE "${schema}".orders 
         SET status = 'paid',
             commissions_calculated = TRUE, 
             commission_amount = $1,
             days_of_guarantee_applied = $2,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [totalPlatformFee, currentGuaranteeDays, order.id]
      );

      await client.query('COMMIT');

      logger.info({ orderId: order.id }, 'Comisiones distribuidas y garantía registrada');

      return { platformFee: totalPlatformFee, creatorNet: creatorNetAmount };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId: order.id }, 'Error en CommissionService');
      throw error instanceof AppError ? error : new AppError('Error al procesar comisiones', 500);
    } finally {
      client.release();
    }
  }
}
