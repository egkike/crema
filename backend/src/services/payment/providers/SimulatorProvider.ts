import crypto from 'crypto';

import { PaymentProvider, PaymentResponse, SubscriptionData, WebhookResult } from '../PaymentProvider';
import { config } from '../../../config';

export class SimulatorProvider implements PaymentProvider {
  async createPreference(data: any): Promise<PaymentResponse> {
    const url = `${config.frontendUrl}/simulator/pay?ref=${data.externalReference}&amount=${data.amount}&currency=${data.currency}`;
    return { initPoint: url };
  }

  async createSubscription(data: SubscriptionData): Promise<PaymentResponse> {
    // Simulamos una URL de suscripción
    const url = `${config.frontendUrl}/simulator/pay?ref=${data.externalReference}&type=subscription`;

    return {
      initPoint: url,
      // Generamos un ID con prefijo SIM para identificarlo en la DB
      providerReference: `SIM-SUB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // En el simulador simplemente logueamos la acción
    console.info(`[SIMULATOR] Suscripción cancelada exitosamente: ${subscriptionId}`);
    return Promise.resolve();
  }

  async refund(transactionId: string, amount: number): Promise<void> {
    console.info(`[SIMULATOR] Reembolso procesado para TX: ${transactionId} por ${amount}`);
    return Promise.resolve();
  }

  async handleWebhook({ body }: any): Promise<WebhookResult | null> {
    return {
      externalReference: body.externalReference,
      status: body.status || 'approved',
      transactionId: body.transactionId || `SIM-TX-${Date.now()}`,
      metadata: { temp_password: body.tempPassword },
      type: body.externalReference.startsWith('SUB:') ? 'subscription' : 'payment',
    };
  }
}
