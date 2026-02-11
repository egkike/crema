import { configRepository } from '../repositories/config.repository';
import { AppError } from '../errors/AppError';

export class ProductService {
  /**
   * Valida que el porcentaje de comisión esté dentro de los límites legales y financieros.
   * @param requestedComm Porcentaje solicitado por el creador.
   * @throws AppError si la comisión es inválida.
   */
  static async validateCommissionLimits(requestedComm: number): Promise<void> {
    // 1. Obtener configuraciones de la moneda base
    const platformCurrency = await configRepository.getSetting('platform_currency', 'ARS');
    const platformConfigs = await configRepository.getConfigsByCurrency(platformCurrency);
    const rawMinComm = await configRepository.getSetting('min_global_affiliate_commission', '10');

    // 2. Parámetros numéricos
    const platformFeePercent = Number(platformConfigs['fee_percent']) * 100; // Ej: 9.9
    const minAffiliateComm = Number(rawMinComm);

    // 3. Validar contra el mínimo global (Protección al Afiliado)
    if (requestedComm < minAffiliateComm) {
      throw new AppError(`La comisión mínima para afiliados es del ${minAffiliateComm}%`, 400);
    }

    // 4. Calcular el techo máximo dinámico (Protección al Creador)
    const minimumCreatorMargin = 5;
    const maxPossibleAffiliateComm = 100 - platformFeePercent - minimumCreatorMargin;

    if (requestedComm > maxPossibleAffiliateComm) {
      throw new AppError(
        `La comisión de afiliado es demasiado alta. El máximo permitido es ${Math.floor(maxPossibleAffiliateComm)}% considerando los fees de plataforma.`,
        400
      );
    }
  }
}
