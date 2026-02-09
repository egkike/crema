import jwt from 'jsonwebtoken';

import { config } from '../config/index';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';

import { EmailService } from './email.service';


export class PayoutMethodService {
  /**
   * Genera un token de confirmación y lo envía por email
   */
  static async requestChange(userId: string, currency: string, type: any, data: any) {
    const user = await userRepository.getById(userId);
    if (!user) throw new AppError('Usuario no encontrado', 404);

    // Creamos un token que expire en 15 minutos con la "payload" de los nuevos datos
    const confirmToken = jwt.sign(
      { userId, currency, type, data, action: 'confirm_payout_method' },
      config.jwt.secret,
      { expiresIn: '15m' }
    );

    const confirmLink = `${config.frontendUrl}/payout-methods/confirm?token=${confirmToken}`;

    await EmailService.sendPayoutMethodChangeEmail(
      user.email,
      user.fullname,
      currency,
      confirmLink
    );

    return { message: 'Se ha enviado un link de confirmación a tu email.' };
  }

  /**
   * Valida el token y aplica el cambio en la DB
   */
  static async confirmChange(token: string) {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;

      if (decoded.action !== 'confirm_payout_method') {
        throw new AppError('Token de confirmación inválido', 400);
      }

      const updatedMethod = await payoutMethodRepository.upsert(
        decoded.userId,
        decoded.currency,
        decoded.type,
        decoded.data
      );

      return updatedMethod;
    } catch {
      throw new AppError('El link de confirmación es inválido o ha expirado', 400);
    }
  }
}
