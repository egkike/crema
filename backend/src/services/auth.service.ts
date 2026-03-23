import { userRepository } from '../repositories/user.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { configRepository } from '../repositories/config.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { CaptchaService } from './captcha.service';
import { EmailService } from './email.service';

export class AuthService {
  static async registerPartner(userData: any, captchaToken: string) {
    // 1. Validar Captcha
    const isHuman = await CaptchaService.verifyToken(captchaToken);
    if (!isHuman) throw new AppError('Validación de seguridad fallida', 400);

    // 2. Validar niveles permitidos para registro manual
    const requestedLevel = Number(userData.level || 1);

    // Bloqueamos niveles administrativos o rangos inválidos
    const levels = await configRepository.getUserLevels();
    if (requestedLevel >= levels.STAFF || requestedLevel < levels.USER) {
      throw new AppError('Nivel de usuario no permitido para registro manual.', 403);
    }

    // 3. Verificar si ya existe el email
    const existing = await userRepository.findByCredentials(userData.email);
    if (existing) throw new AppError('El email ya se encuentra registrado.', 400);

    try {
      // 4. Crear en DB
      // Todos los registros manuales nacen inactivos (active: 0) para pedir verificación vía email
      const newUser = await userRepository.createUser({
        email: userData.email,
        password: userData.password,
        fullname: userData.fullname,
        level: requestedLevel,
        active: 0,
      });

      // 5. LÓGICA DE SUSCRIPCIÓN: Solo para Creadores (Nivel 3)
      if (requestedLevel === levels.CREATOR) {
        const defaultPlanId = await configRepository.getSetting('default_creator_plan_id');

        if (defaultPlanId && defaultPlanId.trim() !== '') {
          // Default to ARS currency for new creator subscriptions
          await subscriptionRepository.createInitialSubscription(newUser.id, defaultPlanId, 'ARS');
          logger.info(
            { userId: newUser.id, planId: defaultPlanId },
            'Suscripción gratuita de creador asignada automáticamente'
          );
        } else {
          logger.warn(
            { userId: newUser.id },
            'No se encontró default_creator_plan_id para el nuevo creador'
          );
        }
      }

      // 6. Email de bienvenida y verificación
      // Dependiendo del nivel, podrías usar templates distintos si lo deseas en EmailService
      await EmailService.sendPartnerWelcomeEmail(
        newUser.email,
        newUser.fullname,
        requestedLevel,
        newUser.verificationToken
      );

      // Limpiamos datos sensibles
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, verificationToken, ...publicUser } = newUser;
      return publicUser;
    } catch (error: any) {
      logger.error({ error: error.message, email: userData.email }, 'Error en registro de usuario');
      throw error instanceof AppError ? error : new AppError('Error al procesar el registro', 500);
    }
  }
}
