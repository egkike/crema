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

  cancelSubscription?(subscriptionId: string): Promise<void>;

  // Método para procesar devoluciones
  refund(transactionId: string, amount: number): Promise<void>;
}
