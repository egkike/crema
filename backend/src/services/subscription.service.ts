import { subscriptionRepository, PlatformPlan } from '../repositories/subscription.repository';
import { userRepository } from '../repositories/user.repository';
import { configRepository } from '../repositories/config.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { PaymentProviderFactory } from '../services/payment/PaymentProviderFactory';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

export class SubscriptionService {
  /**
   * Genera el link de suscripción para un plan Pro
   */
  static async createSubscriptionLink(
    userId: string,
    planId: string,
    payerEmail: string,
    gatewayId: string
  ) {
    // 1. Obtenemos todas las monedas habilitadas del Creador
    const payoutMethods = await payoutMethodRepository.getByUserId(userId);
    if (!payoutMethods || payoutMethods.length === 0) {
      throw new AppError(
        'Debes configurar tu moneda de cobro en el perfil antes de suscribirte.',
        400
      );
    }

    // 2. Buscamos el plan. Tipamos la variable como PlatformPlan o null
    let plan: PlatformPlan | null = null;

    for (const method of payoutMethods) {
      const foundPlan = await subscriptionRepository.getPlanById(planId, method.currency);
      if (foundPlan) {
        plan = foundPlan;
        break;
      }
    }

    // Si después del bucle sigue siendo null, lanzamos error
    if (!plan) {
      throw new AppError('No se encontró un plan compatible con tus monedas configuradas.', 404);
    }

    // 3. Validamos pasarela. Aquí TS ya sabe que 'plan' NO es null gracias al check de arriba
    const allowedGateways = await configRepository.getGatewaysByCurrency(plan.currency);
    if (!allowedGateways.some(g => g.id === gatewayId)) {
      throw new AppError(`La pasarela ${gatewayId} no es válida para ${plan.currency}`, 400);
    }

    const provider = PaymentProviderFactory.getProvider(gatewayId);

    if (!provider.createSubscription) {
      throw new AppError('Este método de pago no soporta suscripciones recurrentes', 400);
    }

    const response = await provider.createSubscription({
      planName: `Plan ${plan.name} - Crema`,
      amount: plan.amount,
      currency: plan.currency,
      externalReference: `SUB:${userId}:${planId}`,
      email: payerEmail,
    });

    return {
      init_point: response.initPoint,
      preapproval_id: response.providerReference,
    };
  }

  /**
   * Activa o renueva la suscripción en nuestra DB tras el pago exitoso
   */
  static async handleSubscriptionPayment(
    userId: string,
    planId: string,
    gatewaySubscriptionId: string
  ) {
    // 1. Buscamos el plan entre TODAS las monedas del usuario para no fallar
    const payoutMethods = await payoutMethodRepository.getByUserId(userId);

    let plan: PlatformPlan | null = null;
    for (const method of payoutMethods) {
      const foundPlan = await subscriptionRepository.getPlanById(planId, method.currency);
      if (foundPlan) {
        plan = foundPlan;
        break;
      }
    }

    if (!plan) {
      logger.error(
        { userId, planId },
        'Plan no encontrado en las monedas del usuario al procesar pago'
      );
      throw new Error('Plan no encontrado al procesar pago');
    }

    // 2. Actualizamos la suscripción (Pasando la moneda detectada del plan)
    await subscriptionRepository.upgradeUserPlan(
      userId,
      planId,
      gatewaySubscriptionId,
      plan.currency
    );

    // 3. Registramos la ganancia en la plataforma
    await subscriptionRepository.recordSubscriptionEarning(Number(plan.amount), plan.currency);

    logger.info(
      { userId, planId, amount: plan.amount, currency: plan.currency },
      'Suscripción y ganancia registradas con éxito'
    );
  }

  /**
   * Cancela una suscripción de forma agnóstica
   */
  static async cancelSubscription(userId: string, isWebhook: boolean = false) {
    const sub = await subscriptionRepository.getActiveSubscription(userId);

    if (!sub) {
      // Si no hay suscripción activa, forzamos el downgrade por seguridad y salimos
      await subscriptionRepository.forceDowngrade(userId);
      return { message: 'No se encontró una suscripción activa.' };
    }

    try {
      if (!isWebhook && sub.gateway_subscription_id) {
        const allowedGateways = await configRepository.getGatewaysByCurrency(sub.currency);
        const gatewayId = allowedGateways[0]?.id || 'simulator';
        const provider = PaymentProviderFactory.getProvider(gatewayId);

        if (provider.cancelSubscription) {
          await provider.cancelSubscription(sub.gateway_subscription_id);
          logger.info({ userId, gatewayId }, 'Suscripción cancelada en la pasarela');
        }
      }

      // El downgrade en DB siempre se hace
      await subscriptionRepository.forceDowngrade(userId);

      const user = await userRepository.getById(userId);
      if (user) {
        EmailService.sendDowngradeNotification(user.email, user.fullname).catch(err =>
          logger.error({ err: err.message, userId }, 'Error enviando email de downgrade')
        );
      }

      return { message: 'Suscripción cancelada exitosamente' };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'Error crítico al cancelar suscripción');
      if (!isWebhook) throw new AppError('No se pudo procesar la cancelación', 500);
    }
  }
}
