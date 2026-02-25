import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { orderRepository } from '../repositories/order.repository';
import { commissionRepository } from '../repositories/commission.repository';
import { refundRepository } from '../repositories/refund.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { PaymentProviderFactory } from '../services/payment/PaymentProviderFactory';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { config } from '../config/index';
import { roundToTwo } from '../utils/rounder';

export class RefundService {
  /**
   * Procesa el reembolso de una orden de forma atómica.
   */
  static async processRefund(orderId: string, reason: string = 'Reembolso solicitado') {
    const schema = config.db?.schema || 'public';
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener la orden con bloqueo FOR UPDATE
      const order = await orderRepository.getById(orderId, client);

      if (!order) throw new AppError('La orden no existe', 404);
      if (order.status === 'refunded') throw new AppError('La orden ya fue reembolsada', 400);

      // --- VALIDACIÓN SAFE-GUARD ---
      // Si el AccessService invalidó la garantía por consumo/descarga, detenemos aquí.
      if (!order.is_guarantee_eligible) {
        throw new AppError(
          'Esta orden ya no es elegible para reembolso debido al consumo del producto.',
          403
        );
      }

      // VALIDACIÓN CRONOLÓGICA
      // Calculamos con created_at + days.
      const now = new Date();
      const expirationDate = new Date(order.created_at);
      expirationDate.setDate(expirationDate.getDate() + (order.days_of_guarantee_applied || 7));

      if (expirationDate && now > expirationDate) {
        throw new AppError(
          `El periodo de garantía ha expirado el ${expirationDate.toLocaleDateString()}.`,
          400
        );
      }

      // SEGURIDAD: Solo se reembolsa si el dinero NO ha sido liberado
      if (order.balance_released) {
        throw new AppError(
          'El saldo ya fue liberado. El reembolso debe gestionarse manualmente.',
          400
        );
      }

      const orderCurrency = order.currency;

      // 2. REVERTIR COMISIONES DE USUARIOS
      const commissions = await commissionRepository.getByOrderId(orderId);

      for (const comm of commissions) {
        if (comm.status === 'pending') {
          // IMPORTANTE: Usar la misma lógica de redondeo que en CommissionService
          const amountToDeduct = roundToTwo(Number(comm.netAmount));

          await balanceRepository.deductPendingEarnings(
            comm.userId,
            amountToDeduct,
            orderCurrency,
            client
          );

          await historyRepository.createRecordWithClient(client, {
            userId: comm.userId,
            order_id: orderId,
            amount: -amountToDeduct,
            currency: orderCurrency,
            type: 'refund' as any,
            description: `Deducción por reembolso: Orden #${orderId.substring(0, 8)}`,
          });
        }
      }

      // 3. REVERTIR GANANCIAS DE LA PLATAFORMA
      const pEarningsQuery = `
        SELECT total_amount, tax_amount FROM "${schema}".platform_earnings 
        WHERE order_id = $1 AND status = 'active' FOR UPDATE;
      `;
      const { rows: pEarnings } = await client.query(pEarningsQuery, [orderId]);

      if (pEarnings.length > 0) {
        // IMPORTANTE: Usar la misma lógica de redondeo que en CommissionService
        const platformAmountToDeduct = roundToTwo(Number(pEarnings[0].total_amount));

        await platformBalanceRepository.deductFromPending(
          platformAmountToDeduct,
          orderCurrency,
          client
        );

        await client.query(
          `UPDATE "${schema}".platform_earnings SET status = 'refunded', updated_at = CURRENT_TIMESTAMP WHERE order_id = $1`,
          [orderId]
        );

        logger.info(
          { orderId, taxAnulled: pEarnings[0].tax_amount },
          'Impuestos y comisiones revertidos en plataforma'
        );
      }

      // 4. ACTUALIZAR ESTADOS
      await orderRepository.updateStatus(orderId, 'refunded', client);
      await commissionRepository.updateStatusByOrder(orderId, 'refunded', client);

      // 5. REGISTRO DE AUDITORÍA
      await refundRepository.create(
        {
          orderId,
          sellerId: order.creator_id,
          buyerId: order.buyer_id,
          amount: Number(order.amount),
          currency: orderCurrency,
          reason,
        },
        client
      );

      // 6. REEMBOLSO EN LA PASARELA (Agnóstico / Factory)
      if (order.transaction_id) {
        try {
          const provider = PaymentProviderFactory.getProvider(order.payment_method);

          // El servicio no sabe CÓMO se reembolsa, solo le ordena al provider que lo haga.
          await provider.refund(order.transaction_id, Number(order.amount));

          logger.info({ orderId, gateway: order.payment_method }, 'Reembolso en pasarela OK');
        } catch (gatewayError: any) {
          logger.error({ error: gatewayError.message }, 'Fallo en pasarela externa');
          throw new AppError(
            `Error en pasarela (${order.payment_method}): ${gatewayError.message}`,
            400
          );
        }
      }

      await client.query('COMMIT');
      logger.info({ orderId }, '✅ Reembolso procesado exitosamente');
      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, orderId }, '💥 Fallo en RefundService');
      throw error instanceof AppError ? error : new AppError(error.message, 500);
    } finally {
      client.release();
    }
  }
}
