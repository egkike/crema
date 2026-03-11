import { config } from '../config/index';
import { configRepository } from '../repositories/config.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { platformEarningsRepository } from '../repositories/platform_earnings.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { Order } from '../repositories/order.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { roundToTwo } from '../utils/rounder.util';

export class CommissionService {
  /**
   * Reparte el dinero de una orden entre Plataforma, Creador y Afiliado.
   * Hereda el release_at de la orden para platform_earnings.
   */
  static async processOrderCommissions(order: Order, product: any, client: any) {
    const schema = config.db?.schema || 'public';

    // Evitar doble procesamiento
    if (order.commissions_calculated) return;

    try {
      // Bloqueo de fila para seguridad en concurrencia
      const checkQuery = `SELECT commissions_calculated FROM "${schema}".orders WHERE id = $1 FOR UPDATE`;
      const { rows } = await client.query(checkQuery, [order.id]);

      if (!rows.length || rows[0].commissions_calculated) {
        return;
      }

      const orderCurrency = order.currency;
      const configs = await configRepository.getConfigsByCurrency(orderCurrency);
      const rules = await configRepository.getCurrencyValidationRules(orderCurrency);

      if (!configs || Object.keys(configs).length === 0) {
        throw new AppError(`Configuración inexistente para moneda: ${orderCurrency}`, 500);
      }

      // --- 1. LÓGICA FISCAL INICIAL ---
      const totalAmount = Number(order.amount);
      const taxConfig = rules?.tax_config;

      let calculationBase = totalAmount;
      if (taxConfig && taxConfig.enabled && taxConfig.calculation === 'inside') {
        const factor = Number(taxConfig.tax_factor || 1.21);
        calculationBase = roundToTwo(totalAmount / factor);
      }

      // --- 2. CÁLCULO DE COMISIÓN DE PLATAFORMA (BRUTA) ---
      const subscription = await subscriptionRepository.getActiveSubscription(product.creator_id);
      let percentValue = Number(configs['fee_percent'] || 0.1);

      if (subscription?.features?.custom_fee_percent !== undefined) {
        percentValue = Number(subscription.features.custom_fee_percent);
      }

      const threshold = Number(configs['price_threshold'] || 0);
      const lowFee = Number(configs['fixed_fee_low'] || 0);
      const highFee = Number(configs['fixed_fee_high'] || 0);

      const variableFee = roundToTwo(calculationBase * percentValue);
      const fixedFee = totalAmount <= threshold ? lowFee : highFee;
      const totalPlatformFee = roundToTwo(variableFee + fixedFee);

      // --- 3. REGISTRO DE GANANCIAS DE PLATAFORMA (FINANZAS REALES) ---
      let platformTaxAmount = 0;
      let platformNetBeforeGateway = totalPlatformFee;

      // Si el IVA es 'inside', extraemos el IVA que Crema debe pagar de su comisión
      if (taxConfig && taxConfig.enabled && taxConfig.calculation === 'inside') {
        const factor = Number(taxConfig.tax_factor || 1.21);
        platformNetBeforeGateway = roundToTwo(totalPlatformFee / factor);
        platformTaxAmount = roundToTwo(totalPlatformFee - platformNetBeforeGateway);
      }

      // Rentabilidad Real de Crema = (Comisión Bruta sin IVA) - Costos de Pasarela
      const realNetProfit = roundToTwo(
        platformNetBeforeGateway - (order.gateway_fee || 0) - (order.gateway_tax || 0)
      );

      // Validamos que exista la fecha de liberación
      if (!order.release_at) {
        throw new AppError(
          'No se puede registrar la ganancia: Falta fecha de liberación de la orden.',
          500
        );
      }

      await platformEarningsRepository.recordEarning(
        {
          orderId: order.id,
          variableAmount: variableFee,
          fixedAmount: fixedFee,
          taxAmount: platformTaxAmount,
          totalAmount: totalPlatformFee,
          netProfit: realNetProfit,
          currency: orderCurrency,
          releaseAt: order.release_at,
        },
        client
      );

      // Sumamos la comisión bruta al balance pendiente de la plataforma
      await platformBalanceRepository.addToPending(totalPlatformFee, orderCurrency, client);

      // --- 4. LÓGICA DE AFILIADO ---
      let affiliateAmount = 0;
      if (order.affiliate_id) {
        const rawMinComm = await configRepository.getSetting(
          'min_global_affiliate_commission',
          '5'
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
              type: 'affiliate' as any,
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
            type: 'sale_affiliate' as any,
            description: `Comisión afiliado: ${product.title}${order.discount_applied > 0 ? ' (Cupón aplicado)' : ''}`,
          });
        }
      }

      // --- 5. REGISTRO DE GANANCIA DEL CREADOR (REMANENTE) ---
      const creatorNetAmount = roundToTwo(totalAmount - totalPlatformFee - affiliateAmount);

      if (creatorNetAmount < 0) {
        throw new AppError('Error matemático: las comisiones superan el total de la venta.', 500);
      }

      await commissionRepository.create(
        {
          userId: product.creator_id,
          orderId: order.id,
          amount: totalAmount,
          feeApplied: totalPlatformFee,
          netAmount: creatorNetAmount,
          currency: orderCurrency,
          type: 'creator' as any,
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
        type: 'sale_creator' as any,
        description: `Venta: ${product.title}${order.discount_applied > 0 ? ` (Dcto: ${order.discount_applied})` : ''}`,
      });

      // --- 6. FINALIZAR Y ACTUALIZAR ORDEN ---
      // Aquí guardamos el realNetProfit que acabamos de calcular con precisión
      await client.query(
        `UPDATE "${schema}".orders 
         SET commissions_calculated = TRUE, 
             commission_amount = $1, 
             net_platform_profit = $2,
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [totalPlatformFee, realNetProfit, order.id]
      );

      return { platformFee: totalPlatformFee, creatorNet: creatorNetAmount };
    } catch (error: any) {
      logger.error({ error: error.message, orderId: order.id }, '💥 Error en CommissionService');
      throw error instanceof AppError ? error : new AppError('Error al procesar comisiones', 500);
    }
  }
}
