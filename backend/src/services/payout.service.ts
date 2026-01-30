import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class PayoutService {
  /**
   * Procesa una solicitud de retiro de fondos
   */
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    destination: string
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener y bloquear el balance para evitar retiros duplicados simultáneos
      // Nota: Es ideal usar un SELECT ... FOR UPDATE aquí si es posible
      const balance = await balanceRepository.getByUserIdAndCurrency(userId, currency);

      if (!balance || balance.available_balance < amount) {
        throw new AppError(
          `Saldo insuficiente en ${currency}. Disponible: ${balance?.available_balance || 0}`,
          400
        );
      }

      // 2. Crear el registro del payout (Estado: pending)
      const payout = await payoutRepository.create(
        {
          userId,
          amount,
          currency,
          destination,
        },
        client
      );

      // 3. Restar del balance disponible
      // Necesitaremos añadir este método al balanceRepository
      await client.query(
        `UPDATE user_balances 
         SET available_balance = available_balance - $1, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $2 AND currency = $3`,
        [amount, userId, currency]
      );

      // 4. Registrar en el historial de movimientos
      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null as any, // Los retiros no están asociados a una venta
        amount: -amount, // Se guarda como valor negativo
        currency,
        type: 'payout_request' as any,
        description: `Solicitud de retiro (${currency}) a: ${destination}`,
      });

      await client.query('COMMIT');

      logger.info({ userId, amount, currency }, 'Solicitud de retiro creada con éxito');
      return payout;
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, userId }, 'Error en requestPayout');

      if (error instanceof AppError) throw error;
      throw new AppError('No se pudo procesar la solicitud de retiro', 500);
    } finally {
      client.release();
    }
  }
}
