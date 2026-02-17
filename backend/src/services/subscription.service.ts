import { MercadoPagoConfig, PreApproval } from 'mercadopago';

import { config } from '../config/index';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

// Tipamos el cliente de forma global en el servicio
const client = new MercadoPagoConfig({
  accessToken: config.mercadoPago?.accessToken || 'dummy_token',
});

export class SubscriptionService {
  /**
   * Genera el link de suscripción para un plan Pro
   */
  static async createSubscriptionLink(userId: string, planId: string, payerEmail: string) {
    try {
      // 1. Obtener datos del plan (precio, nombre)
      const plan = await subscriptionRepository.getPlanById(planId);

      if (!plan || plan.is_free) {
        throw new AppError('Plan no válido para suscripción de pago', 400);
      }

      // 2. Crear la suscripción en Mercado Pago (PreApproval)
      const preApprovalClient = new PreApproval(client);

      const subscription = await preApprovalClient.create({
        body: {
          reason: `Plan ${plan.name} - Crema`,
          external_reference: `SUB:${userId}:${planId}`, // Clave para el Webhook
          payer_email: payerEmail,
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: Number(plan.amount), // Forzamos a número por seguridad
            currency_id: 'ARS',
          },
          back_url: `${config.frontendUrl}/dashboard/subscription/success`,
          status: 'pending',
        },
      });

      return {
        init_point: subscription.init_point,
        preapproval_id: subscription.id,
      };
    } catch (error: any) {
      logger.error(
        {
          error: error.message,
          userId,
          planId,
        },
        'Error creando suscripción en MP'
      );

      if (error instanceof AppError) throw error;
      throw new AppError('No se pudo generar el plan de pago con Mercado Pago', 500);
    }
  }

  /**
   * Activa o renueva la suscripción en nuestra DB tras el pago exitoso
   */
  static async handleSubscriptionPayment(userId: string, planId: string, mpPreapprovalId: string) {
    // 1. Obtener datos del plan para saber cuánto cobrar
    const plan = await subscriptionRepository.getPlanById(planId);
    if (!plan) {
      logger.error({ userId, planId }, 'Plan no encontrado al procesar pago de suscripción');
      throw new Error('Plan no encontrado al procesar pago');
    }

    // 2. Actualizamos la suscripción del usuario
    await subscriptionRepository.upgradeUserPlan(userId, planId, mpPreapprovalId);

    // 3. Registramos la ganancia en la plataforma
    await subscriptionRepository.recordSubscriptionEarning(
      Number(plan.amount),
      plan.currency || 'ARS'
    );

    logger.info(
      { userId, planId, amount: plan.amount },
      'Suscripción y ganancia registradas con éxito'
    );
  }

  /**
   * Cancela una suscripción recurrente en Mercado Pago y realiza el downgrade en DB
   */
  static async cancelSubscription(userId: string, isWebhook: boolean = false) {
    // 1. Obtener la suscripción actual del usuario
    const sub = await subscriptionRepository.getActiveSubscription(userId);

    // Si no tiene una suscripción con ID de MP, no hay nada que cancelar en la pasarela
    if (!sub || !sub.mp_preapproval_id) {
      // Si el usuario no tiene nada activo, solo aplicamos downgrade por si acaso y salimos
      await subscriptionRepository.forceDowngrade(userId);
      return { message: 'No hay suscripción activa en Mercado Pago para procesar.' };
    }

    try {
      // 2. Si la orden NO viene del Webhook, notificamos a MP
      if (!isWebhook) {
        const preApprovalClient = new PreApproval(client);
        await preApprovalClient.update({
          id: sub.mp_preapproval_id,
          body: { status: 'cancelled' },
        });
      }

      // 3. Ejecutar el downgrade en nuestra DB
      await subscriptionRepository.forceDowngrade(userId);

      // 4. Notificar al usuario por Email
      const user = await userRepository.getById(userId);
      if (user) {
        // No bloqueamos el flujo si falla el email, solo lo lanzamos como promesa
        EmailService.sendDowngradeNotification(user.email, user.fullname).catch(err =>
          logger.error({ err: err.message, userId }, 'Error enviando email de downgrade')
        );
      }

      logger.info({ userId, mpId: sub.mp_preapproval_id }, 'Suscripción cancelada correctamente');
      return { message: 'Suscripción cancelada exitosamente' };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'Error crítico al cancelar suscripción');

      if (!isWebhook) {
        throw new AppError('No se pudo procesar la cancelación con Mercado Pago', 500);
      }
    }
  }
}
