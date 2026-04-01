import crypto from 'crypto';

import { MercadoPagoConfig, Preference, PaymentRefund, PreApproval, Payment } from 'mercadopago';

import { config } from '../../../config';
import {
  PaymentProvider,
  PaymentResponse,
  SubscriptionData,
  WebhookResult,
  CreditPreferenceData,
} from '../PaymentProvider';
import logger from '../../../utils/logger';

export class MercadoPagoProvider implements PaymentProvider {
  private client = new MercadoPagoConfig({
    accessToken: config.mercadoPago?.accessToken || 'dummy_token',
  });

  async createPreference(data: { product: Record<string, unknown>; amount: number; currency: string; externalReference: string; email: string; tempPassword?: string }): Promise<PaymentResponse> {
    const preference = new Preference(this.client);

    const response = await preference.create({
      body: {
        items: [
          {
            id: String(data.product['id']),
            title: String(data.product['title']),
            quantity: 1,
            unit_price: Number(data.amount),
            currency_id: data.currency,
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
          pending: `${config.frontendUrl}/checkout/pending`,
        },
        external_reference: data.externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/webhook/mercadopago`,
        statement_descriptor: 'CREMA',
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
        body: { amount: amount },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Error en Mercado Pago Refund: ${message}`);
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

  async createCreditPreference(data: CreditPreferenceData): Promise<PaymentResponse> {
    const preference = new Preference(this.client);

    // Formato: CREDITS:{userId}:{packageId}:{timestamp}
    const externalReference = `CREDITS:${data.userId}:${data.packageId}:${Date.now()}`;

    const response = await preference.create({
      body: {
        items: [
          {
            id: `credits-${data.packageId}`,
            title: data.packageName,
            description: `${data.credits} Créditos AI`,
            quantity: 1,
            unit_price: Number(data.amount),
            currency_id: data.currency,
          },
        ],
        payer: {
          email: data.email,
        },
        metadata: {
          userId: data.userId,
          packageId: data.packageId,
          credits: data.credits,
        },
        back_urls: {
          success: `${config.frontendUrl}/ai/credits/success`,
          failure: `${config.frontendUrl}/ai/credits/error`,
          pending: `${config.frontendUrl}/ai/credits/pending`,
        },
        external_reference: externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/webhook/mercadopago`,
        statement_descriptor: 'CREMA CREDITS',
      },
    });

    if (!response.init_point) {
      throw new Error('No se pudo obtener el init_point de Mercado Pago');
    }

    return { initPoint: response.init_point };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const preApproval = new PreApproval(this.client);
    await preApproval.update({
      id: subscriptionId,
      body: { status: 'cancelled' },
    });
  }

  async handleWebhook({ body, headers, query }: { body: Record<string, unknown>; headers: Record<string, string>; query: Record<string, string> }): Promise<WebhookResult | null> {
    const { action, type, data } = body;
    const xSignature = headers['x-signature'] as string;
    const xRequestId = headers['x-request-id'] as string;

    // 1. VALIDACIÓN DE SEGURIDAD
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
          const resourceId = (data?.id || query.id || body.id) as string;
          if (resourceId) {
            const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;
            const hmac = crypto
              .createHmac('sha256', config.mercadoPago.webhookSecret)
              .update(manifest)
              .digest('hex');

            if (hmac !== hash) {
              logger.warn({ xRequestId, resourceId }, '⚠️ Firma de Webhook MP inválida.');
              return null;
            }
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error({ err: message }, 'Error validando firma');
        return null;
      }
    }

    // 2. OBTENCIÓN DEL ID DEL RECURSO
    const rawId = (data?.id || query.id) as string;
    if (!rawId) return null;

    try {
      // CASO A: Pago Único
      if (type === 'payment' || (action && action.startsWith('payment.'))) {
        const paymentInstance = new Payment(this.client);
        const payment = await paymentInstance.get({ id: rawId });

        // --- DESGLOSE DE COMISIONES MP ---
        let gatewayFee = 0;
        let gatewayTax = 0;

        if (payment.fee_details && Array.isArray(payment.fee_details)) {
          payment.fee_details.forEach((fee: Record<string, unknown>) => {
            // MP clasifica como 'mercadopago_fee' su comisión bruta
            if (fee.type === 'mercadopago_fee') {
              gatewayFee += Number(fee.amount || 0);
            }
            // Clasifica como 'tax' las retenciones impositivas (ej: IVA)
            else if (fee.type === 'tax') {
              gatewayTax += Number(fee.amount || 0);
            }
            // Otros cargos (financiamiento, etc) se consideran costo de pasarela
            else {
              gatewayFee += Number(fee.amount || 0);
            }
          });
        }

        return {
          externalReference: payment.external_reference || '',
          status: payment.status || 'pending',
          transactionId: String(payment.id),
          metadata: payment.metadata,
          type: 'payment',
          gatewayFee, // Nuevo: Enviamos el costo operativo
          gatewayTax, // Nuevo: Enviamos los impuestos retenidos
        };
      }

      // CASO B: Suscripción
      if (
        type === 'subscription_preapproval' ||
        (action && action.startsWith('subscription_preapproval.'))
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(
        { rawId, error: message },
        'No se pudo verificar el recurso en la API de MP'
      );
      return null;
    }

    return null;
  }
}
