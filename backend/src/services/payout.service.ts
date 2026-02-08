import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { configRepository } from '../repositories/config.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class PayoutService {
  /**
   * Solicita un nuevo retiro.
   * Ajustado para los nuevos campos de transferencia (CBU, Alias, CUIT).
   */
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    payoutData: {
      destination_account: string;
      bank_name?: string | undefined;
      account_holder?: string | undefined;
      tax_id?: string | undefined;
      alias?: string | undefined;
    }
  ) {
    // 1. Validaciones básicas
    if (amount <= 0) {
      throw new AppError('El monto del retiro debe ser mayor a cero', 400);
    }

    // 2. Validación de Monto Mínimo desde Configuración
    const configs = await configRepository.getConfigsByCurrency(currency);
    const minAmount = Number(configs['min_payout_amount'] ?? 1000);

    if (amount < minAmount) {
      throw new AppError(`El monto mínimo de retiro para ${currency} es ${minAmount}`, 400);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 3. Restar saldo disponible (Usa el CHECK de la DB para validar saldo >= amount)
      await balanceRepository.subtractAvailableBalance(userId, amount, currency, client);

      // 4. Crear registro con los nuevos campos detallados
      const payout = await payoutRepository.create(
        {
          userId,
          amount,
          currency,
          ...payoutData, // Incluye destination_account, bank_name, tax_id, etc.
        },
        client
      );

      // 5. Historial de solicitud (Monto negativo en el historial)
      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: -Math.abs(amount),
        currency,
        type: 'payout_request' as any,
        description: `Retiro pendiente a: ${payoutData.alias || payoutData.destination_account}`,
      });

      await client.query('COMMIT');
      logger.info({ userId, amount, payoutId: payout.id }, '💰 Retiro solicitado exitosamente');

      return payout;
    } catch (error: any) {
      await client.query('ROLLBACK');
      // Capturamos el error del CHECK balance_available >= 0 de la tabla
      if (error.code === '23514' || error.message.includes('balance')) {
        throw new AppError('Saldo insuficiente para realizar el retiro.', 400);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza el estado de un retiro (Uso para Administradores).
   */
  static async updatePayoutStatus(
    payoutId: string,
    status: 'completed' | 'rejected',
    adminId: string,
    adminNotes?: string
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const payout = await payoutRepository.getByIdForUpdate(payoutId, client);
      if (!payout) throw new AppError('Registro de retiro no encontrado', 404);
      if (payout.status !== 'pending')
        throw new AppError('Este retiro ya ha sido procesado anteriormente', 400);

      if (status === 'completed') {
        // ✅ CORREGIDO: adminNotes va antes que client
        await payoutRepository.updateStatus(payoutId, 'completed', adminNotes, client);
        logger.info({ payoutId, adminId }, '✅ Retiro marcado como completado');
      } else if (status === 'rejected') {
        await balanceRepository.addAvailableBalance(
          payout.user_id,
          Number(payout.amount),
          payout.currency,
          client
        );

        // ✅ CORREGIDO: adminNotes va antes que client
        await payoutRepository.updateStatus(payoutId, 'rejected', adminNotes, client);

        await historyRepository.createRecordWithClient(client, {
          userId: payout.user_id,
          order_id: null,
          amount: Number(payout.amount),
          currency: payout.currency,
          type: 'payout_refund' as any,
          description: `Reintegro por retiro rechazado #${payoutId.substring(0, 8)}`,
        });

        logger.warn({ payoutId, adminId }, '❌ Retiro rechazado y fondos reintegrados');
      }

      await client.query('COMMIT');
      return { success: true, status };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error(
        { error: error.message, payoutId },
        'Error al procesar el cambio de estado del payout'
      );
      throw error;
    } finally {
      client.release();
    }
  }
}
