import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { configRepository } from '../repositories/config.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { userRepository } from '../repositories/user.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { platformWithdrawalRepository } from '../repositories/platform_withdrawal.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

export class PayoutService {
  /**
   * Solicita un nuevo retiro usando un método de pago pre-configurado para usuarios.
   */
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    payoutMethodId: string
  ) {
    const sanitizedAmount = Math.floor(amount * 100) / 100;

    if (sanitizedAmount <= 0) {
      throw new AppError('El monto del retiro debe ser mayor a cero', 400);
    }

    const method = await payoutMethodRepository.getById(payoutMethodId);

    if (!method) {
      throw new AppError('El método de retiro seleccionado no existe', 404);
    }
    if (method.user_id !== userId) {
      throw new AppError('No tienes permiso para usar este método de retiro', 403);
    }
    if (method.currency !== currency) {
      throw new AppError(`Este método de retiro no coincide con la moneda ${currency}`, 400);
    }

    const { data } = method;
    const payoutData = {
      destination_account: data.cbu || data.address || data.alias,
      bank_name: data.bank_name || null,
      account_holder: data.holder || data.account_holder || null,
      tax_id: data.tax_id || null,
      alias: data.alias || null,
    };

    const configs = await configRepository.getConfigsByCurrency(currency);
    const minAmount = Number(configs['min_payout_amount'] ?? 1000);

    if (sanitizedAmount < minAmount) {
      throw new AppError(`El monto mínimo de retiro para ${currency} es ${minAmount}`, 400);
    }

    // Validación de Monto Máximo
    // Buscamos la key 'max_payout_amount' en el objeto configs
    const maxAmount = configs['max_payout_amount'] ? Number(configs['max_payout_amount']) : null;

    if (maxAmount && sanitizedAmount > maxAmount) {
      throw new AppError(
        `El monto máximo permitido por retiro para ${currency} es ${maxAmount}.`,
        400
      );
    }

    // Obtenemos el límite de frecuencia de la tabla de configs (ej: 1)
    const freqLimit = Number(configs['payout_frequency_limit'] ?? 1);

    const alreadyRequested = await payoutRepository.hasRecentPayout(userId, freqLimit);

    if (alreadyRequested) {
      throw new AppError(
        `Has alcanzado el límite de ${freqLimit} solicitud(es) de retiro por día.`,
        400
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await balanceRepository.subtractAvailableBalance(userId, sanitizedAmount, currency, client);

      const payout = await payoutRepository.create(
        {
          userId,
          amount: sanitizedAmount,
          currency,
          ...payoutData,
        },
        client
      );

      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: -Math.abs(sanitizedAmount),
        currency,
        type: 'payout_request' as any,
        description: `Retiro pendiente (${currency}) a: ${payoutData.alias || payoutData.destination_account}`,
      });

      await client.query('COMMIT');

      // >>> NOTIFICACIÓN POR EMAIL (Solicitud creada) <<<
      const user = await userRepository.getById(userId);
      if (user) {
        EmailService.sendPayoutRequestedEmail(
          user.email,
          user.fullname,
          sanitizedAmount,
          currency,
          payoutData.alias || payoutData.destination_account
        );
      }

      const processingDays = Number(configs['payout_processing_days'] ?? 3);
      const estimatedDate = new Date();
      let addedDays = 0;
      while (addedDays < processingDays) {
        estimatedDate.setDate(estimatedDate.getDate() + 1);
        if (estimatedDate.getDay() !== 0 && estimatedDate.getDay() !== 6) {
          addedDays++;
        }
      }
      const dateStr = estimatedDate.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

      return {
        ...payout,
        estimated_date: dateStr,
        message: `Solicitud recibida. Plazo estimado: ${processingDays} días hábiles (${dateStr}).`,
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      if (error.code === '23514' || error.message.includes('balance')) {
        throw new AppError('Saldo insuficiente para realizar el retiro.', 400);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Permite al usuario anular una solicitud propia que aún esté 'pending'.
   */
  static async cancelUserPayout(payoutId: string, userId: string) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener y bloquear el registro
      const payout = await payoutRepository.getByIdForUpdate(payoutId, client);

      if (!payout) throw new AppError('Solicitud de retiro no encontrada', 404);

      // 2. Validaciones de seguridad
      if (payout.user_id !== userId) {
        throw new AppError('No tienes permiso para anular esta solicitud', 403);
      }
      if (payout.status !== 'pending') {
        throw new AppError('Solo se pueden anular solicitudes en estado pendiente', 400);
      }

      // 3. Reintegrar el dinero al balance del usuario
      await balanceRepository.addAvailableBalance(
        userId,
        Number(payout.amount),
        payout.currency,
        client
      );

      // 4. Marcar como cancelado en la tabla de payouts
      await payoutRepository.updateStatus(
        payoutId,
        'cancelled',
        'Anulado por el usuario',
        null,
        userId, // En este caso el ejecutor es el usuario
        client
      );

      // 5. Registro en el historial de movimientos
      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: Number(payout.amount),
        currency: payout.currency,
        type: 'payout_cancel' as any,
        description: `Retiro anulado por el usuario: +${payout.amount} ${payout.currency}`,
      });

      await client.query('COMMIT');

      // 6. Notificar por Email
      const user = await userRepository.getById(userId);
      if (user) {
        await EmailService.sendPayoutCancelledEmail(
          user.email,
          user.fullname,
          Number(payout.amount),
          payout.currency
        );
      }

      return { success: true, message: 'Solicitud anulada y saldo reintegrado.' };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, payoutId }, 'Error al cancelar retiro');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza el estado de un retiro (Administradores).
   */
  static async updatePayoutStatus(
    payoutId: string,
    status: 'completed' | 'rejected',
    adminId: string,
    adminNotes?: string,
    transactionReceipt?: string
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const payout = await payoutRepository.getByIdForUpdate(payoutId, client);
      if (!payout) throw new AppError('Registro de retiro no encontrado', 404);
      if (payout.status !== 'pending') throw new AppError('Este retiro ya ha sido procesado', 400);

      const user = await userRepository.getById(payout.user_id);

      if (status === 'completed') {
        if (!transactionReceipt) {
          throw new AppError('Debes proporcionar el comprobante de transacción', 400);
        }

        await payoutRepository.updateStatus(
          payoutId,
          'completed',
          adminNotes,
          transactionReceipt,
          adminId,
          client
        );

        await client.query('COMMIT');

        if (user) {
          EmailService.sendPayoutCompletedEmail(
            user.email,
            user.fullname,
            Number(payout.amount),
            payout.currency,
            payout.alias || payout.destination_account,
            transactionReceipt
          );
        }
      } else if (status === 'rejected') {
        await balanceRepository.addAvailableBalance(
          payout.user_id,
          Number(payout.amount),
          payout.currency,
          client
        );
        await payoutRepository.updateStatus(
          payoutId,
          'rejected',
          adminNotes,
          null,
          adminId,
          client
        );

        await historyRepository.createRecordWithClient(client, {
          userId: payout.user_id,
          order_id: null,
          amount: Number(payout.amount),
          currency: payout.currency,
          type: 'payout_refund' as any,
          description: `Reintegro por retiro rechazado: ${adminNotes || 'S/M'}`,
        });

        await client.query('COMMIT');

        if (user) {
          EmailService.sendSecurityAlert(
            user.email,
            'Solicitud de retiro rechazada',
            `Tu solicitud por ${payout.amount} ${payout.currency} fue rechazada. Motivo: ${adminNotes || 'S/M'}`
          );
        }
      }

      return { success: true, status };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, payoutId }, 'Error al procesar el cambio de estado');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Retiro de fondos de la PLATAFORMA (Empresa).
   * Mueve dinero de platform_balances a platform_withdrawals.
   */
  static async requestPlatformPayout(
    amount: number,
    currency: string,
    description: string,
    transactionReceipt: string,
    adminId: string
  ) {
    const client = await pool.connect();
    const sanitizedAmount = Math.floor(amount * 100) / 100;

    if (sanitizedAmount <= 0) {
      throw new AppError('El monto debe ser mayor a cero', 400);
    }

    try {
      await client.query('BEGIN');

      // 1. Verificamos y descontamos del balance de la plataforma
      // Este método debe validar internamente que haya fondos suficientes
      await platformBalanceRepository.deductFromAvailable(sanitizedAmount, currency, client);

      // 2. Registramos el egreso oficial
      const withdrawal = await platformWithdrawalRepository.create(
        {
          adminId,
          amount: sanitizedAmount,
          currency,
          description,
          transactionReceipt,
        },
        client
      );

      // 3. Opcional: Notificamos al logger o auditoría interna
      logger.info(
        { adminId, amount: sanitizedAmount, currency, ref: transactionReceipt },
        '🏢 Retiro de fondos de plataforma procesado'
      );

      await client.query('COMMIT');
      return { success: true, data: withdrawal };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message }, 'Error crítico en retiro de plataforma');
      throw new AppError(
        error.message.includes('balance')
          ? 'La plataforma no tiene saldo disponible suficiente'
          : 'Error al procesar retiro de plataforma',
        400
      );
    } finally {
      client.release();
    }
  }
}
