import { configRepository } from '../repositories/config.repository';
import { commissionRepository } from '../repositories/commission.repository';
import logger from '../utils/logger';

export class CommissionService {
  /**
   * Procesa el cálculo y registro de comisiones tras un pago aprobado.
   */
  static async processOrderCommissions(order: any, product: any) {
    try {
      const totalAmount = Number(order.amount);

      // 1. Obtener parámetros dinámicos desde la DB
      const configs = await configRepository.getAllConfigs();

      // Valores por defecto (fallback) si la tabla está vacía
      const feePercent = configs['fee_percent'] || 0.099; // 9.9%
      const priceThreshold = configs['price_threshold'] || 15.0;
      const fixedFeeLow = configs['fixed_fee_low'] || 0.1;
      const fixedFeeHigh = configs['fixed_fee_high'] || 0.5;

      // 2. Calcular Tarifa de la Plataforma (Crema Fee)
      const appliedFixedFee = totalAmount <= priceThreshold ? fixedFeeLow : fixedFeeHigh;
      const cremaFee = totalAmount * feePercent + appliedFixedFee;

      const netAfterCrema = totalAmount - cremaFee;

      logger.info(
        `[Crema-Commissions] Orden: ${order.external_reference} | Bruto: ${totalAmount} | Fee Crema: ${cremaFee.toFixed(2)} | Neto: ${netAfterCrema.toFixed(2)}`
      );

      // 3. Si existe un afiliado, calculamos su parte sobre el neto (después de Crema Fee)
      if (order.affiliate_id && Number(product.affiliate_commission_percent) > 0) {
        const affiliatePercent = Number(product.affiliate_commission_percent) / 100;
        const affiliateAmount = netAfterCrema * affiliatePercent;

        // 4. Registrar la comisión en la tabla 'commissions'
        await commissionRepository.create({
          affiliate_id: order.affiliate_id,
          order_id: order.id,
          amount: affiliateAmount,
          status: 'pending', // Pendiente hasta que pase el periodo de garantía
        });

        logger.info(
          `[Crema-Commissions] Comisión Afiliado registrada: ${affiliateAmount.toFixed(2)} para User: ${order.affiliate_id}`
        );
      }

      return {
        cremaFee,
        netAfterCrema,
        success: true,
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, orderId: order.id },
        'Error crítico en el motor de comisiones de Crema'
      );
      throw error;
    }
  }
}
