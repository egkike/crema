import jwt from 'jsonwebtoken';

import { config } from '../config/index';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { userRepository } from '../repositories/user.repository';
import { configRepository } from '../repositories/config.repository';
import { productRepository } from '../repositories/product.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { balanceRepository } from '../repositories/balance.repository';
import { SpecialValidators } from '../utils/validators.util';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

import { EmailService } from './email.service';

export class PayoutMethodService {
  /**
   * Genera un token de confirmación y lo envía por email
   */
  static async requestChange(userId: string, currency: string, type: any, data: any) {
    // 1. Buscamos si el usuario tiene retiros en estado 'pending' o 'processing'
    const pendingPayouts = await payoutRepository.getByStatusAndUser(userId, [
      'pending',
      'processing',
    ]);

    if (pendingPayouts.length > 0) {
      throw new AppError(
        'No puedes modificar tus métodos de cobro mientras tengas retiros pendientes de procesar.',
        403
      );
    }

    // 2. ¿Tiene productos activos en esta moneda?
    const activeProductsCount = await productRepository.countActiveByCreatorAndCurrency(
      userId,
      currency
    );
    if (activeProductsCount > 0) {
      throw new AppError(
        `No puedes cambiar/eliminar la moneda ${currency} porque tienes ${activeProductsCount} productos activos usándola. Archiva o elimina los productos primero.`,
        400
      );
    }

    // 3. ¿Su suscripción Pro depende de esta moneda?
    const subscription = await subscriptionRepository.getActiveSubscription(userId);
    if (subscription && subscription.currency === currency && subscription.status === 'active') {
      throw new AppError(
        `Esta moneda (${currency}) es la base de tu suscripción actual. No puedes modificarla hasta que la suscripción finalice o cambies el método de pago de la misma.`,
        400
      );
    }

    // 4. ¿Hay saldo pendiente que deba ser liquidado en esta moneda?
    const balance = await balanceRepository.getByUserIdAndCurrency(userId, currency);
    if (balance && Number(balance.pending_balance) > 0) {
      throw new AppError(
        `Tienes saldos pendientes de liberación en ${currency}. Debes esperar a que se liberen y retirarlos antes de quitar esta moneda.`,
        400
      );
    }

    const user = await userRepository.getById(userId);
    if (!user) throw new AppError('Usuario no encontrado', 404);

    // 1. Obtener campos requeridos y reglas de validación desde la DB
    const requiredFields = await configRepository.getRequiredFieldsByCurrency(currency);
    const rules = await configRepository.getCurrencyValidationRules(currency);

    if (requiredFields.length === 0) {
      throw new AppError(`La moneda ${currency} no está configurada o no existe.`, 400);
    }

    // 2. Validar presencia de campos obligatorios
    const missingFields = requiredFields.filter(f => !data[f] || data[f].toString().trim() === '');
    if (missingFields.length > 0) {
      throw new AppError(`Faltan campos obligatorios: ${missingFields.join(', ')}`, 400);
    }

    // 3. VALIDACIÓN DINÁMICA DE REGLAS
    for (const field in rules) {
      // SEGURIDAD: Si la llave es 'tax_config', saltamos porque no es un campo del usuario
      if (field === 'tax_config') continue;

      // Solo validamos si el campo está presente en el objeto data enviado
      if (data[field] === undefined) continue;

      const value = data[field]?.toString() || '';
      const rule = rules[field];

      if (rule.minLength && value.length < rule.minLength) {
        throw new AppError(
          rule.errorMsg || `El campo ${field} debe tener al menos ${rule.minLength} caracteres`,
          400
        );
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        throw new AppError(
          rule.errorMsg || `El campo ${field} no puede exceder los ${rule.maxLength} caracteres`,
          400
        );
      }
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
        throw new AppError(rule.errorMsg || `El formato de ${field} es inválido`, 400);
      }

      // Buscamos si existe una función lógica para esta moneda y este campo
      const specialValidator = SpecialValidators[currency]?.[field];

      if (specialValidator && !specialValidator(value)) {
        throw new AppError(rule.errorMsg || `La validación lógica para ${field} ha fallado.`, 400);
      }
    }

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
      const decoded = jwt.verify(token, config.jwt.secret) as {
        action: string;
        userId: string;
        currency: string;
        methodData: Record<string, unknown>;
      };

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
    } catch (error: any) {
      logger.error({ error: error.message }, 'El link de confirmación es inválido o ha expirado');
      throw new AppError('El link de confirmación es inválido o ha expirado', 400);
    }
  }
}
