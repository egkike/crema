import { PaymentProvider, PaymentResponse } from '../PaymentProvider';
import { config } from '../../../config';

export class SimulatorProvider implements PaymentProvider {
  async createPreference(data: any): Promise<PaymentResponse> {
    // El simulador simplemente redirige a una ruta interna de tu frontend
    const url = `${config.frontendUrl}/simulator/pay?ref=${data.externalReference}&amount=${data.amount}&currency=${data.currency}`;
    return { initPoint: url };
  }
}
