import crypto from 'crypto';

import { MercadoPagoConfig, Preference, PaymentRefund, PreApproval, Payment } from 'mercadopago';

import { config } from '../../../config';
import { PaymentProvider, PaymentResponse, SubscriptionData, WebhookResult } from '../PaymentProvider';
import logger from '../../../utils/logger';

export class MercadoPagoProvider implements PaymentProvider {
  // Usamos el token de la config, con un fallback por seguridad
  private client = new MercadoPagoConfig({
    accessToken: config.mercadoPago?.accessToken || 'dummy_token',
  });

  async createPreference(data: any): Promise<PaymentResponse> {
    const preference = new Preference(this.client);

    const response = await preference.create({
      body: {
        items: [
          {
            id: String(data.product.id),
            title: String(data.product.title),
            quantity: 1, // El total ya viene calculado en data.amount (price * quantity)
            unit_price: Number(data.amount),
            currency_id: data.currency, // Dinámico según la compra
          },
        ],
        payer: {
          email: String(data.email || '').trim(),
        },
        metadata: {
          temp_password: data.tempPassword,
        },
        back_urls: {
          success: `${config.frontendUrl}/checkout/success`,
          failure: `${config.frontendUrl}/checkout/error`,
          pending: `${config.frontendUrl}/checkout/pending`, // Agregado para pagos en efectivo
        },
        external_reference: data.externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/webhook/mercadopago`,
        statement_descriptor: 'CREMA', // Identificador en el resumen bancario
      },
    });

    if (!response.init_point) {
      throw new Error('No se pudo obtener el init_point de Mercado Pago');
    }

    return { initPoint: response.init_point };
  }

  async refund(transactionId: string, amount: number): Promise<void> {
    try {
      const refundInstance = new PaymentRefund(this.client);
      await refundInstance.create({
        payment_id: Number(transactionId),
        body: {
          amount: amount,
        },
      });
    } catch (error: any) {
      throw new Error(`Error en Mercado Pago Refund: ${error.message}`);
    }
  }

  async createSubscription(data: SubscriptionData): Promise<PaymentResponse> {
    const preApproval = new PreApproval(this.client);

    const response = await preApproval.create({
      body: {
        reason: data.planName,
        external_reference: data.externalReference,
        payer_email: data.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: Number(data.amount),
          currency_id: data.currency,
        },
        back_url: `${config.frontendUrl}/dashboard/subscription/success`,
        status: 'pending',
      },
    });

    if (!response.init_point) {
      throw new Error('Error al crear suscripción en Mercado Pago');
    }

    return {
      initPoint: response.init_point,
      providerReference: response.id,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const preApproval = new PreApproval(this.client);
    await preApproval.update({
      id: subscriptionId,
      body: { status: 'cancelled' },
    });
  }

  /**
   * Procesa la notificación (Webhook) de Mercado Pago de forma dinámica.
   * Valida la firma de seguridad y normaliza el resultado para el controlador.
   */
  async handleWebhook({ body, headers, query }: any): Promise<WebhookResult | null> {
    const { action, type, data } = body;
    const xSignature = headers['x-signature'] as string;
    const xRequestId = headers['x-request-id'] as string;

    // 1. VALIDACIÓN DE SEGURIDAD (HMAC SHA256)
    // Solo validamos si tenemos el secreto configurado en las variables de entorno
    if (config.mercadoPago.webhookSecret && xSignature) {
      try {
        const parts = xSignature.split(',');
        let ts: string | undefined;
        let hash: string | undefined;

        parts.forEach(part => {
          const [key, value] = part.split('=');
          if (key === 'ts') ts = value;
          if (key === 'v1') hash = value;
        });

        if (ts && hash) {
          const resourceId = (data?.id || query.id) as string;
          // El manifiesto debe seguir el orden exacto que requiere MP
          const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;

          const hmac = crypto
            .createHmac('sha256', config.mercadoPago.webhookSecret)
            .update(manifest)
            .digest('hex');

          if (hmac !== hash) {
            logger.warn({ xRequestId }, '⚠️ Firma de Webhook MP inválida. Posible fraude.');
            return null;
          }
        }
      } catch (err) {
        logger.error({ err }, 'Error validando firma de Mercado Pago');
        return null;
      }
    }

    // 2. OBTENCIÓN DEL ID DEL RECURSO
    const rawId = (data?.id || query.id) as string;
    if (!rawId) return null;

    try {
      // CASO A: Pago Único (Product Purchase)
      if (type === 'payment' || action === 'payment.created' || action === 'payment.updated') {
        const paymentInstance = new Payment(this.client);
        const payment = await paymentInstance.get({ id: rawId });

        return {
          externalReference: payment.external_reference || '',
          status: payment.status || 'pending',
          transactionId: String(payment.id),
          metadata: payment.metadata, // Aquí viene temp_password si existe
          type: 'payment',
        };
      }

      // CASO B: Suscripción Mensual (PreApproval)
      if (
        type === 'subscription_preapproval' ||
        (action && action.startsWith('subscription_preapproval'))
      ) {
        const preApprovalClient = new PreApproval(this.client);
        const sub = await preApprovalClient.get({ id: rawId });

        return {
          externalReference: sub.external_reference || '',
          status: sub.status || '',
          transactionId: String(sub.id),
          type: 'subscription',
        };
      }
    } catch (error: any) {
      logger.error({ error: error.message, rawId, type }, 'Error consultando recurso en API de MP');
      throw error; // Re-lanzamos para que el controlador lo gestione
    }

    return null;
  }
}
