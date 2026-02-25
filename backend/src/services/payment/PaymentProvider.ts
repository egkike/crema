export interface PaymentResponse {
  initPoint: string; // URL a donde redirigir al usuario
  providerReference?: string; // ID interno de la pasarela
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

  // Método para procesar devoluciones
  refund(transactionId: string, amount: number): Promise<void>;
}
