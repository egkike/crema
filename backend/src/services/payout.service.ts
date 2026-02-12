import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { configRepository } from '../repositories/config.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

export class PayoutService {
  /**
   * Solicita un nuevo retiro usando un método de pago pre-configurado.
   */
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    payoutMethodId: string // <--- Ahora recibimos el ID del método guardado
  ) {
    // 1. Validaciones básicas de monto
    // >>> Sanitización de decimales para evitar errores de precisión financiera <<<
    const sanitizedAmount = Math.floor(amount * 100) / 100;

    if (sanitizedAmount <= 0) {
      throw new AppError('El monto del retiro debe ser mayor a cero', 400);
    }

    // 2. Obtener el método de pago guardado y validar
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

    // 2.1 Preparar la "foto" de los datos del método (JSONB -> Campos planos para la tabla payouts)
    const { data } = method;
    const payoutData = {
      destination_account: data.cbu || data.address || data.alias,
      bank_name: data.bank_name || null,
      account_holder: data.holder || data.account_holder || null,
      tax_id: data.tax_id || null,
      alias: data.alias || null,
    };

    // 3. Obtener configuraciones de la DB para la moneda específica
    const configs = await configRepository.getConfigsByCurrency(currency);

    // 3.1 Validación de Monto Mínimo
    const minAmount = Number(configs['min_payout_amount'] ?? 1000);
    // >>> Usamos sanitizedAmount para la comparación <<<
    if (sanitizedAmount < minAmount) {
      throw new AppError(`El monto mínimo de retiro para ${currency} es ${minAmount}`, 400);
    }

    // 3.2 Validación de Frecuencia (Límite por día)
    const dailyLimit = Number(configs['payout_frequency_limit'] ?? 1);
    const alreadyRequested = await payoutRepository.hasRecentPayout(userId);

    if (alreadyRequested) {
      throw new AppError(
        `Has alcanzado el límite de ${dailyLimit} solicitud(es) de retiro por día.`,
        400
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 4. Restar saldo disponible
      // >>> Restamos el monto sanitizado <<<
      await balanceRepository.subtractAvailableBalance(userId, sanitizedAmount, currency, client);

      // 5. Crear registro de retiro (Copiamos los datos del método actual)
      const payout = await payoutRepository.create(
        {
          userId,
          amount: sanitizedAmount,
          currency,
          ...payoutData,
        },
        client
      );

      // 6. Historial de movimiento
      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: -Math.abs(sanitizedAmount),
        currency,
        type: 'payout_request' as any,
        description: `Retiro pendiente (${currency}) a: ${payoutData.alias || payoutData.destination_account}`,
      });

      await client.query('COMMIT');

      // 7. Calcular mensaje de fecha estimada
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

      logger.info({ userId, amount: sanitizedAmount, payoutId: payout.id }, '💰 Retiro solicitado exitosamente');

      return {
        ...payout,
        estimated_date: dateStr,
        message: `Tu solicitud ha sido recibida. El plazo estimado de procesamiento es de ${processingDays} días hábiles (Aprox. ${dateStr}).`,
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
   * Actualiza el estado de un retiro (Uso para Administradores).
   * Mantenemos este método igual ya que opera sobre registros de payouts ya creados.
   */
  static async updatePayoutStatus(
    payoutId: string,
    status: 'completed' | 'rejected',
    adminId: string,
    adminNotes?: string,
    transactionReceipt?: string // <-- Recibimos el comprobante del controlador
  ) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const payout = await payoutRepository.getByIdForUpdate(payoutId, client);
      if (!payout) throw new AppError('Registro de retiro no encontrado', 404);
      if (payout.status !== 'pending')
        throw new AppError('Este retiro ya ha sido procesado anteriormente', 400);

      const user = await userRepository.getById(payout.user_id);

      if (status === 'completed') {
        // REGLA DE NEGOCIO: Obligatorio el recibo para marcar como completado
        if (!transactionReceipt) {
          throw new AppError(
            'Debes proporcionar el número de comprobante o ID de transacción bancaria',
            400
          );
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
          // Ajustamos el email para que incluya el comprobante
          EmailService.sendPayoutCompletedEmail(
            user.email,
            user.fullname,
            Number(payout.amount),
            payout.currency,
            payout.alias || payout.destination_account,
            transactionReceipt // <--- Enviar el comprobante al usuario para su tranquilidad
          );
        }

        logger.info({ payoutId, adminId, transactionReceipt }, '✅ Retiro completado con éxito');
      } else if (status === 'rejected') {
        // ... (Lógica de reversión de saldo que ya tenías)
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

        // Registro en historial (como ya tenías)
        await historyRepository.createRecordWithClient(client, {
          userId: payout.user_id,
          order_id: null,
          amount: Number(payout.amount),
          currency: payout.currency,
          type: 'payout_refund' as any,
          description: `Reintegro por retiro rechazado: ${adminNotes || 'S/M'}`,
        });

        await client.query('COMMIT'); // Cerramos transacción

        if (user) {
          EmailService.sendSecurityAlert(
            user.email,
            'Solicitud de retiro rechazada',
            `Tu solicitud de retiro por ${payout.amount} ${payout.currency} ha sido rechazada. 
             Motivo: ${adminNotes || 'No especificado'}. 
             Los fondos han sido reintegrados a tu saldo disponible.`
          );
        }

        logger.warn({ payoutId, adminId }, '❌ Retiro rechazado y fondos reintegrados');
      }

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
