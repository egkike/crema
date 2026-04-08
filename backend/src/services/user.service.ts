import { userRepository } from '../repositories/user.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { configRepository } from '../repositories/config.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';
import { SpecialValidators } from '../utils/validators.util';

import { EmailService } from './email.service';

interface PayoutMethodData {
  tax_id?: string;
  account_number?: string;
  alias?: string;
  bank_name?: string;
  account_type?: string;
}

interface PayoutData {
  currency: string;
  type: string;
  data: PayoutMethodData;
}

export class UserService {
  /**
   * Procesa el upgrade de un usuario a Afiliado (2) o Creador (3)
   * Valida datos bancarios, niveles dinámicos y asigna planes iniciales.
   */
  static async upgradeLevel(userId: string, targetLevel: number, payoutData?: PayoutData) {
    // 1. Obtener usuario y niveles configurados
    const [user, levels] = await Promise.all([
      userRepository.getById(userId),
      configRepository.getUserLevels(),
    ]);

    if (!user) throw new AppError('Usuario no encontrado', 404);

    // 2. Validar que el upgrade sea hacia adelante
    if (targetLevel <= user.level) {
      throw new AppError(
        `Tu cuenta ya tiene nivel ${user.level}. No puedes bajar de nivel o repetir el actual.`,
        400
      );
    }

    // 3. Seguridad: Evitar upgrades manuales a niveles de Staff/Admin
    if (targetLevel >= levels.STAFF) {
      throw new AppError('Nivel de destino no permitido para upgrade manual.', 403);
    }

    // 4. Validación obligatoria de Datos de Cobro (Payout Methods)
    // Para ser Afiliado (2) o Creador (3), necesitamos saber dónde pagarle.
    // --- VALIDACIÓN FISCAL Y BANCARIA ---
    if (targetLevel >= levels.AFFILIATE) {
      if (!payoutData || !payoutData.currency || !payoutData.type || !payoutData.data) {
        throw new AppError(
          'Es obligatorio configurar tu método de retiro para subir de nivel.',
          400
        );
      }

      const currency = payoutData.currency.toUpperCase();
      const validators = SpecialValidators[currency];

      if (validators) {
        // 1. Validar CUIT/Tax ID si la moneda tiene validador (ARS)
        if (validators.tax_id && payoutData.data.tax_id) {
          if (!validators.tax_id(payoutData.data.tax_id)) {
            throw new AppError(
              `El CUIT/CUIL '${payoutData.data.tax_id}' no es válido.`,
              400
            );
          }
        }

        // 2. Validar CBU si es transferencia bancaria en ARS
        if (payoutData.type === 'BANK' && validators.cbu && payoutData.data.account_number) {
          if (!validators.cbu(payoutData.data.account_number)) {
            throw new AppError('El CBU ingresado no tiene un formato válido.', 400);
          }
        }
      }

      try {
        await payoutMethodRepository.upsert(userId, currency, payoutData.type, payoutData.data);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ userId, error: errorMessage }, 'Error guardando payout_method en upgrade');
        throw new AppError('Error al guardar los datos de cobro.', 500);
      }
    }

    // 5. Ejecutar el cambio de nivel en la base de datos
    const updatedUser = await userRepository.updUser({
      id: userId,
      input: { level: targetLevel },
    });

    if (!updatedUser) throw new AppError('Error al actualizar el nivel en base de datos', 500);

    // 6. Lógica de Suscripción para Creadores (Nivel 3)
    if (targetLevel === levels.CREATOR) {
      try {
        const defaultPlanId = await configRepository.getSetting('default_creator_plan_id');

        if (defaultPlanId && defaultPlanId.trim() !== '') {
          // 1. Obtenemos la moneda que el usuario acaba de configurar para sus cobros
          // Si por alguna razón no viene (aunque lo validamos arriba), usamos 'ARS' como fallback seguro
          const userCurrency = payoutData?.currency || 'ARS';

          // 2. AHORA PASAMOS LOS 3 ARGUMENTOS: userId, planId, currency
          await subscriptionRepository.createInitialSubscription(
            userId,
            defaultPlanId,
            userCurrency
          );

          logger.info(
            { userId, planId: defaultPlanId, currency: userCurrency },
            'Suscripción gratuita asignada al nuevo creador'
          );
        } else {
          logger.warn(
            { userId },
            'Upgrade a Creador sin plan asignado: default_creator_plan_id no configurado'
          );
        }
      } catch (subError: unknown) {
        const errorMessage = subError instanceof Error ? subError.message : String(subError);
        logger.error(
          { userId, error: errorMessage },
          'Fallo al asignar suscripción inicial en upgrade'
        );
      }
    }

    // 7. Notificaciones vía Email
    // No bloqueamos la respuesta esperando el email
    EmailService.sendUpgradeSuccessEmail(
      updatedUser.email,
      updatedUser.fullname,
      targetLevel
    ).catch(err =>
      logger.error({ userId, err: err.message }, 'Error enviando email de éxito en upgrade')
    );

    logger.info(
      { userId, from: user.level, to: targetLevel },
      'Upgrade de nivel procesado exitosamente'
    );

    return updatedUser;
  }
}
