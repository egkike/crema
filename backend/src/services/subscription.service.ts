import { MercadoPagoConfig, PreApproval } from 'mercadopago';

import { config } from '../config/index';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { userRepository } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { EmailService } from './email.service';

const client = new MercadoPagoConfig({ accessToken: config.mercadoPago.accessToken });

export class SubscriptionService {
  /**
   * Genera el link de suscripción para un plan Pro
   */
  static async createSubscriptionLink(userId: string, planId: string, payerEmail: string) {
    try {
      // 1. Obtener datos del plan (precio, nombre)
      const plan = await subscriptionRepository.getPlanById(planId);
      if (!plan || plan.is_free) throw new AppError('Plan no válido para suscripción de pago', 400);

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
            transaction_amount: Number(plan.amount), // Precio del plan
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
      logger.error({ error: error.message, userId }, 'Error creando suscripción en MP');
      throw new AppError('No se pudo generar el plan de pago', 500);
    }
  }

  /**
   * Activa o renueva la suscripción en nuestra DB tras el pago exitoso
   */
  static async handleSubscriptionPayment(userId: string, planId: string, mpPreapprovalId: string) {
    // 1. Obtener datos del plan para saber cuánto cobrar
    const plan = await subscriptionRepository.getPlanById(planId);
    if (!plan) throw new Error('Plan no encontrado al procesar pago');

    // 2. Actualizamos la suscripción del usuario (lo que ya hacíamos)
    await subscriptionRepository.upgradeUserPlan(userId, planId, mpPreapprovalId);

    // 3. Registramos la plata en la billetera de la plataforma
    // Como es suscripción, el 100% (plan.amount) es ganancia
    await subscriptionRepository.recordSubscriptionEarning(
      Number(plan.amount),
      plan.currency || 'ARS'
    );

    logger.info({ userId, planId, amount: plan.amount }, 'Suscripción y ganancia registradas');
  }

/**
   * Cancela una suscripción recurrente en Mercado Pago y realiza el downgrade en DB
   * @param isWebhook Si es true, indica que la cancelación viene de MP y no debemos llamar a su API de vuelta.
   */
  static async cancelSubscription(userId: string, isWebhook: boolean = false) {
    // 1. Obtener la suscripción actual del usuario
    const sub = await subscriptionRepository.getActiveSubscription(userId);

    // Si no tiene una suscripción con ID de MP, no hay nada que cancelar
    if (!sub || !sub.mp_preapproval_id) {
      return { message: 'No hay suscripción activa para procesar.' };
    }

    try {
      // 2. Si la orden NO viene del Webhook (viene del usuario), notificamos a MP
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
      // Obtenemos los datos del usuario para el correo
      const user = await userRepository.getById(userId);
      if (user) {
        await EmailService.sendDowngradeNotification(user.email, user.fullname);
      }

      logger.info({ userId, mpId: sub.mp_preapproval_id }, 'Suscripción cancelada y usuario notificado');
      return { message: 'Suscripción cancelada exitosamente' };
      
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'Error al cancelar suscripción');
      // Si falló el Webhook, no lanzamos error de Express, solo logueamos.
      // Si falló la petición del usuario, sí lanzamos el error.
      if (!isWebhook) {
        throw new AppError('No se pudo procesar la cancelación con el proveedor de pagos', 500);
      }
    }
  }
}
