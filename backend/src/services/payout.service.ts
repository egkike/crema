import pool from '../db/postgres';
import { balanceRepository } from '../repositories/balance.repository';
import { payoutRepository, Payout } from '../repositories/payout.repository';
import { historyRepository } from '../repositories/history.repository';
import { configRepository } from '../repositories/config.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { userRepository } from '../repositories/user.repository';
import { platformBalanceRepository } from '../repositories/platform_balance.repository';
import { platformWithdrawalRepository } from '../repositories/platform_withdrawal.repository';
import { SpecialValidators } from '../utils/validators.util';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { mainQueue } from '../queues/scheduler';
import { roundToTwo } from '../utils/rounder.util';

export class PayoutService {
  /**
   * Solicita un nuevo retiro usando un método de pago pre-configurado.
   */
  static async requestPayout(
    userId: string,
    amount: number,
    currency: string,
    payoutMethodId: string,
    userLevel: number
  ): Promise<Payout & { estimated_date: string; message: string }> {
    const sanitizedAmount = roundToTwo(amount);

    // 1. VALIDACIÓN DE NIVEL:
    // Traemos los niveles dinámicos
    const levels = await configRepository.getUserLevels();

    // Los Compradores (Nivel 1 / levels.USER) no pueden retirar dinero.
    // Solo niveles >= AFFILIATE (Nivel 2)
    if (userLevel < levels.AFFILIATE) {
      throw new AppError(
        'Tu nivel de cuenta no permite realizar retiros. Debes ser Afiliado o Creador.',
        403
      );
    }

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
    if (!method.is_active || !method.is_verified) {
      throw new AppError(
        'El método de retiro seleccionado no está verificado o se encuentra inactivo.',
        400
      );
    }
    if (method.currency !== currency) {
      throw new AppError(`Este método de retiro no coincide con la moneda ${currency}`, 400);
    }

    // 1. Obtenemos qué campos requiere esta moneda según la DB
    const requiredFields = await configRepository.getRequiredFieldsByCurrency(currency);

    // 2. Construimos el snapshot de datos basado en los requerimientos
    const dynamicData: Record<string, any> = {};
    requiredFields.forEach(field => {
      dynamicData[field] = method.data[field] || null;
    });

    // 3. Mantenemos compatibilidad con columnas fijas y definimos la cuenta de destino principal
    const payoutData = {
      ...dynamicData, // Inyectamos dinámicamente cbu, address, network, etc.
      destination_account:
        dynamicData.cbu || dynamicData.address || dynamicData.alias || 'Ver detalle',
      bank_name: method.data.bank_name || null,
      account_holder: method.data.holder || method.data.account_holder || null,
      tax_id: method.data.tax_id || null,
      alias: method.data.alias || null,
    };

    const configs = await configRepository.getConfigsByCurrency(currency);
    const minAmount = Number(configs['min_payout_amount'] ?? 1000);

    if (sanitizedAmount < minAmount) {
      throw new AppError(`El monto mínimo de retiro para ${currency} es ${minAmount}`, 400);
    }

    const maxAmount = configs['max_payout_amount'] ? Number(configs['max_payout_amount']) : null;
    if (maxAmount && sanitizedAmount > maxAmount) {
      throw new AppError(`El monto máximo permitido para ${currency} es ${maxAmount}.`, 400);
    }

    const freqLimit = Number(configs['payout_frequency_limit'] ?? 1);
    // Solo validamos si no es STAFF o ADMIN
    if (userLevel < (levels.STAFF || 10)) {
      const limitReached = await payoutRepository.hasMonthlyPayoutLimitReached(
        userId,
        currency,
        freqLimit
      );

      if (limitReached) {
        throw new AppError(
          `Has alcanzado tu límite de ${freqLimit} retiro(s) mensuales para ${currency}. Podrás solicitar otro el próximo mes.`,
          403
        );
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Obtener reglas de la DB (para el Regex de formato)
      const rules = await configRepository.getCurrencyValidationRules(currency);

      // 2. Validación Dinámica de Tax ID
      if (payoutData.tax_id) {
        // A. Validación de Formato (Regex desde DB)
        if (rules?.tax_id_validation?.pattern) {
          const regex = new RegExp(rules.tax_id_validation.pattern);
          if (!regex.test(payoutData.tax_id)) {
            throw new AppError(`Formato de ID fiscal inválido para ${currency}.`, 400);
          }
        }

        // B. Validación de Algoritmo Específico (Desde tu validators.ts)
        // Buscamos si existe un validador para esta moneda y este campo (tax_id)
        const validator = SpecialValidators[currency]?.tax_id;

        if (validator && !validator(payoutData.tax_id)) {
          throw new AppError(
            `El ID fiscal (${payoutData.tax_id}) no es válido para ${currency}.`,
            400
          );
        }
      }

      // 1. BLOQUEO DE SEGURIDAD: Obtenemos el saldo actual y bloqueamos la fila
      const balance = await balanceRepository.getBalanceForUpdate(userId, currency, client);

      // 2. VALIDACIÓN: Ahora que la fila está bloqueada, validamos con el valor real
      if (!balance || balance.available_balance < sanitizedAmount) {
        throw new AppError('Saldo insuficiente para realizar el retiro.', 400);
      }

      // 3. OPERACIÓN: Restamos el saldo (usando el mismo client)
      await balanceRepository.subtractAvailableBalance(userId, sanitizedAmount, currency, client);

      // 4. CREACIÓN: Creamos el registro del retiro
      const payout = await payoutRepository.create(
        {
          userId,
          amount: sanitizedAmount,
          currency,
          ...payoutData,
        },
        client
      );

      if (!payout) throw new AppError('Error al crear la solicitud', 500);

      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: -Math.abs(sanitizedAmount),
        currency,
        type: 'payout_request' as any,
        description: `Retiro pendiente (${currency}) a: ${payoutData.alias || payoutData.destination_account}`,
      });

      await client.query('COMMIT');

      // Notificación Email
      if (mainQueue) {
        const user = await userRepository.getById(userId);
        if (user) {
          await mainQueue.add(
            'send-email',
            {
              type: 'PAYOUT_REQUESTED',
              to: user.email,
              data: {
                fullname: user.fullname,
                amount: sanitizedAmount,
                currency,
                destination: payoutData.alias || payoutData.destination_account,
              },
            },
            { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
          );
        }
      }

      // --- Lógica de Días Hábiles ---
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
      logger.error({ error: error.message, userId }, 'Error en requestPayout');
      if (error.code === '23514' || error.message.includes('balance')) {
        throw new AppError('Saldo insuficiente para realizar el retiro.', 400);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  static async cancelUserPayout(payoutId: string, userId: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const payout = await payoutRepository.getByIdForUpdate(payoutId, client);

      if (!payout) throw new AppError('No encontrado', 404);
      if (payout.user_id !== userId) throw new AppError('No autorizado', 403);
      if (payout.status !== 'pending') throw new AppError('No es anulable', 400);

      await balanceRepository.addAvailableBalance(userId, payout.amount, payout.currency, client);
      await payoutRepository.updateStatus(
        payoutId,
        'cancelled',
        'Anulado por usuario',
        null,
        userId,
        client
      );

      await historyRepository.createRecordWithClient(client, {
        userId,
        order_id: null,
        amount: payout.amount,
        currency: payout.currency,
        type: 'payout_cancel' as any,
        description: `Retiro anulado: +${payout.amount}`,
      });

      await client.query('COMMIT');

      if (mainQueue) {
        const user = await userRepository.getById(userId);
        if (user) {
          await mainQueue.add('send-email', {
            type: 'PAYOUT_CANCELLED',
            to: user.email,
            data: { fullname: user.fullname, amount: payout.amount, currency: payout.currency },
          });
        }
      }

      return {
        success: true,
        message: 'Solicitud anulada y saldo reintegrado.',
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, payoutId }, 'Error en cancelUserPayout');
      throw error;
    } finally {
      client.release();
    }
  }

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
      if (!payout) throw new AppError('No encontrado', 404);
      if (payout.status !== 'pending') throw new AppError('Ya procesado', 400);

      if (status === 'completed') {
        if (!transactionReceipt) throw new AppError('Falta comprobante', 400);
        await payoutRepository.updateStatus(
          payoutId,
          'completed',
          adminNotes,
          transactionReceipt,
          adminId,
          client
        );
        await client.query('COMMIT');

        if (mainQueue) {
          const user = await userRepository.getById(payout.user_id);
          if (user) {
            await mainQueue.add('send-email', {
              type: 'PAYOUT_COMPLETED',
              to: user.email,
              data: {
                fullname: user.fullname,
                amount: payout.amount,
                currency: payout.currency,
                destination: payout.alias || payout.destination_account,
                receipt: transactionReceipt,
              },
            });
          }
        }
      } else {
        await balanceRepository.addAvailableBalance(
          payout.user_id,
          payout.amount,
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
        // REGISTRO EN HISTORIAL: Descripción más prominente
        const rejectionReason = adminNotes ? `: ${adminNotes}` : '';

        await historyRepository.createRecordWithClient(client, {
          userId: payout.user_id,
          order_id: null,
          amount: payout.amount,
          currency: payout.currency,
          type: 'payout_refund' as any,
          description: `RETIRO RECHAZADO${rejectionReason} (Monto reintegrado)`,
        });
        await client.query('COMMIT');

        if (mainQueue) {
          const user = await userRepository.getById(payout.user_id);
          if (user) {
            await mainQueue.add('send-email', {
              type: 'PAYOUT_REJECTED',
              to: user.email,
              data: {
                fullname: user.fullname,
                amount: payout.amount,
                currency: payout.currency,
                reason: adminNotes,
              },
            });
          }
        }
      }
      return { success: true };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, payoutId }, 'Error en updatePayoutStatus');
      throw error;
    } finally {
      client.release();
    }
  }

  static async requestPlatformPayout(
    amount: number,
    currency: string,
    description: string,
    transactionReceipt: string,
    adminId: string
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await platformBalanceRepository.deductFromAvailable(amount, currency, client);
      const withdrawal = await platformWithdrawalRepository.create(
        {
          adminId,
          amount,
          currency,
          description,
          transactionReceipt,
        },
        client
      );
      await client.query('COMMIT');
      return { success: true, data: withdrawal };
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error({ error: error.message, adminId }, 'Error en platform payout');
      throw new AppError('Error en retiro plataforma', 400);
    } finally {
      client.release();
    }
  }

  /**
   * Revisa la liquidez de la plataforma comparando balances contra thresholds dinámicos.
   * Cero hardcode: consulta las monedas activas en la base de datos.
   */
  static async checkPlatformLiquidity() {
    interface LiquidityAlert {
      currency: string;
      balance: number;
      threshold: number;
    }
    
    // 1. Obtenemos solo las monedas que están marcadas como IS_ACTIVE = TRUE
    const activeCurrencies = await configRepository.getEnabledCurrencies();
    const alerts: LiquidityAlert[] = [];

    for (const currencyData of activeCurrencies) {
      const currency = currencyData.code; // 'ARS', 'USDT', etc.

      // 2. Obtenemos el balance real actual en la plataforma
      const balance = await platformBalanceRepository.getAvailable(currency);

      // 3. Obtenemos la configuración de esta moneda (min_payout_amount)
      const configs = await configRepository.getConfigsByCurrency(currency);

      // Definimos un umbral: por ejemplo, 3 veces el retiro mínimo permitido
      // Si no hay configuración, usamos un fallback seguro
      const minPayout = Number(configs['min_payout_amount'] ?? 0);
      const threshold = minPayout * 3;

      // 4. Si el balance es menor al umbral y el umbral es mayor a 0 (evitar falsos positivos)
      if (minPayout > 0 && balance < threshold) {
        alerts.push({ currency, balance, threshold });

        if (mainQueue) {
          await mainQueue.add('send-email', {
            type: 'SECURITY_ALERT',
            to: 'admin@crema.com', // Esto también podrías traerlo de system_settings ('admin_email')
            data: {
              subject: `⚠️ LIQUIDEZ CRÍTICA: ${currency}`,
              message: `Atención: El balance disponible en ${currency} (${balance}) es inferior al umbral de seguridad (${threshold}).`,
            },
          });
        }
      }
    }
    return alerts;
  }

  /**
   * Notifica al administrador sobre retiros que llevan más de 24hs pendientes.
   */
  static async notifyAdminPendingPayouts() {
    const pendingCount = await payoutRepository.countByStatus('pending');

    if (pendingCount > 0) {
      if (mainQueue) {
        await mainQueue.add('send-email', {
          type: 'SECURITY_ALERT',
          to: 'admin@crema.com',
          data: {
            subject: `📋 Auditoría de Retiros: ${pendingCount} pendientes`,
            message: `Hay ${pendingCount} solicitudes de retiro esperando ser procesadas por un administrador.`,
          },
        });
      }
    }
    return { pendingCount };
  }
}
