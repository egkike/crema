import { userRepository } from '../repositories/user.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { configRepository } from '../repositories/config.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

export class UserService {
  /**
   * Procesa el upgrade de un usuario a Afiliado (2) o Creador (3)
   * Valida datos bancarios, niveles dinámicos y asigna planes iniciales.
   */
  static async upgradeLevel(userId: string, targetLevel: number, payoutData?: any) {
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
    if (targetLevel >= levels.AFFILIATE) {
      if (!payoutData || !payoutData.currency || !payoutData.type || !payoutData.data) {
        throw new AppError(
          'Para subir de nivel es obligatorio configurar tu primer método de retiro (Banco o Crypto).',
          400
        );
      }

      try {
        // Guardamos el método de cobro inicial
        await payoutMethodRepository.upsert(
          userId,
          payoutData.currency,
          payoutData.type,
          payoutData.data
        );
        logger.info(
          { userId, currency: payoutData.currency },
          'Método de cobro registrado durante upgrade'
        );
      } catch (error: any) {
        logger.error({ userId, error: error.message }, 'Error guardando payout_method en upgrade');
        throw new AppError('Error al guardar los datos de cobro. Inténtalo de nuevo.', 500);
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
          await subscriptionRepository.createInitialSubscription(userId, defaultPlanId);
          logger.info(
            { userId, planId: defaultPlanId },
            'Suscripción gratuita asignada al nuevo creador'
          );
        } else {
          logger.warn(
            { userId },
            'Upgrade a Creador sin plan asignado: default_creator_plan_id no configurado'
          );
        }
      } catch (subError: any) {
        // Logueamos el error pero no revertimos el upgrade, para no romper la experiencia
        logger.error(
          { userId, error: subError.message },
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
