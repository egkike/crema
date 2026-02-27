import { MercadoPagoConfig, Preference, PaymentRefund, PreApproval } from 'mercadopago';

import { config } from '../../../config';
import { PaymentProvider, PaymentResponse, SubscriptionData } from '../PaymentProvider';

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
        notification_url: `${config.apiBaseUrl}/api/payments/mercadopago/webhook`,
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
}
