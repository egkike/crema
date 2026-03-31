import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { PayoutService } from '../services/payout.service';
import { payoutRepository } from '../repositories/payout.repository';
import { userRepository } from '../repositories/user.repository';
import { TwoFactorService } from '../services/twoFactor.service';
import { EmailService } from '../services/email.service';
import { requestPayoutSchema } from '../schemas/payout.schema';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

class PayoutController {
  async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.id) throw new AppError('Usuario no autenticado', 401);

      // 1. Validar cuerpo con el nuevo esquema (ahora solo trae amount, currency y payoutMethodId)
      const validatedData = requestPayoutSchema.parse(req.body);

      // 2. SEGURIDAD FINANCIERA: Obtener datos completos de seguridad del usuario
      // Necesitamos saber si tiene 2FA activado y ver su historial reciente
      const fullUser = await userRepository.findByCredentials(user.email);
      if (!fullUser) throw new AppError('Información de usuario no encontrada', 404);

      // A. Verificación de 2FA (Si está activo, es obligatorio para retiros)
      if (fullUser.two_factor_enabled) {
        const tfaCode = req.headers['x-2fa-code'] as string;

        if (!tfaCode) {
          throw new AppError('Se requiere el código 2FA para autorizar este retiro.', 403);
        }

        const isValid2FA = TwoFactorService.verifyToken(tfaCode, fullUser.two_factor_secret!);
        if (!isValid2FA) {
          throw new AppError('Código 2FA inválido o expirado.', 401);
        }
      }

      // B. Cool-down de Seguridad (Verificar cambios sensibles en las últimas 24hs)
      const recentLogs = await userRepository.getActivityLogs(fullUser.id, 5);
      const criticalActions = ['PASSWORD_CHANGED', '2FA_DISABLED', 'EMAIL_CHANGED'];

      const hasRecentSecurityChange = recentLogs.some(log => {
        const isCritical = criticalActions.includes(log.action);
        const isRecent =
          new Date().getTime() - new Date(log.created_at).getTime() < 24 * 60 * 60 * 1000;
        return isCritical && isRecent;
      });

      if (hasRecentSecurityChange) {
        throw new AppError(
          'Por tu seguridad, los retiros están bloqueados durante 24hs tras un cambio de contraseña o configuración de seguridad.',
          403
        );
      }

      // C. VALIDACIÓN DE DISPOSITIVO (Fingerprinting dinámico)
      const currentIP = req.ip || req.socket.remoteAddress;
      const currentUA = req.headers['user-agent'];

      // Obtenemos las sesiones activas para comparar
      const activeSessions = await userRepository.getUserSessions(fullUser.id);

      // Verificamos si la solicitud actual "hace match" con alguna sesión registrada
      // Nota: Somos flexibles con la IP si el User-Agent es idéntico (por IPs dinámicas móviles)
      const isRecognizedSession = activeSessions.some(session => {
        const sameUA = session.user_agent === currentUA;
        const sameIP = session.ip_address === currentIP;
        return sameUA || sameIP; // Al menos uno debe coincidir perfectamente
      });

      if (!isRecognizedSession) {
        logger.warn(
          { userId: fullUser.id, currentIP, currentUA },
          '⚠️ Dispositivo no reconocido detectado en solicitud de retiro'
        );

        // Disparamos el email de advertencia (sin 'await' para no demorar la respuesta del API)
        const securityMessage = `Se ha solicitado un retiro de dinero desde un dispositivo o ubicación que no sueles usar (IP: ${currentIP}). Si no fuiste tú, por favor cambia tu contraseña y contacta a soporte inmediatamente.`;

        EmailService.sendSecurityAlert(
          fullUser.email,
          '⚠️ Actividad de retiro inusual - Crema',
          securityMessage
        ).catch(err => logger.error({ err }, 'Error enviando alerta de seguridad por email'));
      }

      // 3. Procesar el retiro
      logger.info(
        { userId: fullUser.id, amount: validatedData.amount, currency: validatedData.currency },
        '💰 Solicitud de retiro autorizada por seguridad'
      );

      const payout = await PayoutService.requestPayout(
        fullUser.id,
        validatedData.amount,
        validatedData.currency,
        validatedData.payoutMethodId,
        fullUser.level
      );

      res.status(201).json({
        success: true,
        message: 'Solicitud de retiro creada. El monto ha sido reservado de su saldo disponible.',
        data: payout,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('. ');
        return next(new AppError(`Error de validación: ${message}`, 400));
      }
      next(error);
    }
  }

  async getMyPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      const payouts = await payoutRepository.getByUserId(userId);

      res.status(200).json({
        success: true,
        data: payouts,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Permite al usuario cancelar su solicitud de retiro si aún está pendiente
   */
   async cancelPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const id = req.params.id;

      // Validate inputs
      if (!user?.id) throw new AppError('Usuario no autenticado', 401);
      if (!id || typeof id !== 'string') throw new AppError('ID de solicitud no proporcionado', 400);

      logger.info({ userId: user.id, payoutId: id }, 'Procesando cancelación de retiro por el usuario');

      const result = await PayoutService.cancelUserPayout(id, user.id);

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const payoutController = new PayoutController();
