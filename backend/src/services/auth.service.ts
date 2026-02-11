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

    // 2. Bloquear registro manual de Compradores (Level 1) o Admins (Level 10)
    const requestedLevel = Number(userData.level);
    if (requestedLevel !== 2 && requestedLevel !== 3) {
      throw new AppError('El registro manual es exclusivo para Afiliados y Creadores.', 403);
    }

    // 3. Verificar si ya existe (Buscamos por email directamente)
    const existing = await userRepository.findByCredentials(userData.email);
    if (existing) throw new AppError('El email ya se encuentra registrado.', 400);

    try {
      // 4. Crear en DB
      // Quitamos 'username: userData.username'. El repositorio lo generará automáticamente.
      const newUser = await userRepository.createUser({
        email: userData.email,
        password: userData.password,
        fullname: userData.fullname,
        level: requestedLevel,
        active: 0, // Los socios manuales nacen inactivos hasta que verifican email
      });

      // ✅ LÓGICA DE SUSCRIPCIÓN: Solo para Creadores
      if (requestedLevel === 3) {
        const defaultPlanId = await configRepository.getSetting('default_creator_plan_id');

        // Verificamos que el setting exista y no esté vacío
        if (defaultPlanId && defaultPlanId.trim() !== '') {
          await subscriptionRepository.createInitialSubscription(newUser.id, defaultPlanId);
          logger.info(
            { userId: newUser.id, planId: defaultPlanId },
            'Suscripción gratuita de creador asignada'
          );
        } else {
          logger.warn({ userId: newUser.id }, 'No se encontró default_creator_plan_id en settings');
        }
      }

      // 5. Email de bienvenida con token de verificación
      await EmailService.sendPartnerWelcomeEmail(
        newUser.email,
        newUser.fullname,
        requestedLevel,
        newUser.verificationToken
      );

      // Limpiamos datos sensibles antes de retornar al controlador
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password, verificationToken, ...publicUser } = newUser;
      return publicUser;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en registro de socio');
      throw error instanceof AppError ? error : new AppError('Error al procesar el registro', 500);
    }
  }
}
