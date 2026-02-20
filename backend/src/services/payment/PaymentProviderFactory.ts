import { AppError } from '../../errors/AppError';

import { PaymentProvider } from './PaymentProvider';
import { MercadoPagoProvider } from './providers/MercadoPagoProvider';
import { SimulatorProvider } from './providers/SimulatorProvider';

export class PaymentProviderFactory {
  private static providers: Record<string, PaymentProvider> = {
    mercadopago: new MercadoPagoProvider(),
    simulator: new SimulatorProvider(),
  };

  static getProvider(gatewayId: string): PaymentProvider {
    const provider = this.providers[gatewayId];
    if (!provider) {
      throw new AppError(`Pasarela de pago no implementada: ${gatewayId}`, 400);
    }
    return provider;
  }
}
