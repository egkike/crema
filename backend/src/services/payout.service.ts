import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class PayoutService {
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    destination: string
  ) {
    // Validación preventiva de negocio
    if (amount <= 0) {
      throw new AppError('El monto del retiro debe ser mayor a cero', 400);
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      /**
       * 1. Validar y restar saldo disponible.
       * El balanceRepository debe ejecutar un UPDATE con un WHERE balance >= amount.
       * Si el rowCount es 0, significa que no hay saldo suficiente.
       */
      await balanceRepository.subtractAvailableBalance(userId, amount, currency, client);

      /**
       * 2. Crear el registro del payout.
       */
      const payout = await payoutRepository.create(
        {
          userId,
          amount,
          currency,
          destination,
        },
        client
      );

      /**
       * 3. Registrar en el historial de movimientos.
       * Guardamos el monto en negativo para que en el balance general sume restando.
       */
      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: -amount,
        currency,
        type: 'payout_request',
        description: `Retiro solicitado (${currency}) a cuenta: ${destination}`,
      });

      await client.query('COMMIT');

      logger.info({ userId, amount, currency, payoutId: payout.id }, 'Solicitud de retiro exitosa');

      return payout;
    } catch (error: any) {
      await client.query('ROLLBACK');

      // Capturamos el error específico de saldo insuficiente del repositorio
      if (error.message.includes('Saldo insuficiente')) {
        logger.warn({ userId, amount, currency }, 'Intento de retiro con saldo insuficiente');
        throw new AppError('Saldo insuficiente para realizar esta operación', 400);
      }

      logger.error({ error: error.message, userId }, 'Fallo crítico en requestPayout');

      if (error instanceof AppError) throw error;
      throw new AppError('Error interno al procesar el retiro. Intente nuevamente.', 500);
    } finally {
      client.release();
    }
  }
}
