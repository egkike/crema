export interface PaymentResponse {
  initPoint: string; // URL a donde redirigir al usuario
  providerReference?: string | undefined; // ID interno de la pasarela
}

export interface SubscriptionData {
  planName: string;
  amount: number;
  currency: string;
  externalReference: string;
  email: string;
}

export interface CreditPreferenceData {
  packageId: string;
  packageName: string;
  credits: number;
  amount: number;
  currency: string;
  userId: string;
  email: string;
}

export interface WebhookResult {
  externalReference: string;
  status: string;
  transactionId: string;
  metadata?: any;
  type: 'payment' | 'subscription';
  gatewayFee?: number;
  gatewayTax?: number;
}

export interface PaymentProvider {
  createPreference(data: {
    product: any;
    amount: number;
    currency: string;
    externalReference: string;
    email: string;
    tempPassword?: string | undefined;
  }): Promise<PaymentResponse>;

  // Método para suscripciones
  createSubscription?(data: SubscriptionData): Promise<PaymentResponse>;

  // Método para créditos AI
  createCreditPreference?(data: CreditPreferenceData): Promise<PaymentResponse>;

  cancelSubscription?(subscriptionId: string): Promise<void>;

  // Método para procesar devoluciones
  refund(transactionId: string, amount: number): Promise<void>;

  handleWebhook(payload: { body: any; headers: any; query: any }): Promise<WebhookResult | null>;
}
