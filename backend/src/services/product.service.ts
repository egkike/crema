import { configRepository } from '../repositories/config.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { productRepository, ProductInput } from '../repositories/product.repository';
import { payoutMethodRepository } from '../repositories/payout_method.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class ProductService {
  /**
   * Crea un nuevo producto orquestando validaciones, generación de slug
   * y manejo de contenido estructurado.
   */
  static async create(creatorId: string, data: any) {
    // --- VALIDACIÓN DE MONEDA PARA EL CREADOR ---
    const userMethods = await payoutMethodRepository.getByUserId(creatorId);
    if (!userMethods || userMethods.length === 0) {
      throw new AppError(
        'Debes configurar al menos un método de cobro antes de crear productos.',
        400
      );
    }

    const userCurrencies = userMethods.map(m => m.currency);
    
    // Validamos que TODAS las monedas de los precios cargados en el producto
    // existan en el perfil del creador.
    if (data.prices && Array.isArray(data.prices)) {
      for (const price of data.prices) {
        if (!userCurrencies.includes(price.currency)) {
          throw new AppError(
            `No puedes crear un precio en ${price.currency} porque no tienes ese método de cobro configurado.`,
            400
          );
        }
      }
    } else {
      throw new AppError('El producto debe tener al menos un precio definido.', 400);
    }

    // 1. Validar límites de comisión si se proporcionan
    if (data.commissionPercent !== undefined) {
      await this.validateCommissionLimits(creatorId, data.commissionPercent);
    }

    // 2. Generar Slug básico (puedes usar una librería como 'slugify')
    const slug = data.title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // 3. Determinar lógica de contenido
    // Si el tipo es 'course' o vienen módulos, marcamos como estructurado
    const isStructured = data.type === 'course' || (data.modules && data.modules.length > 0);

    // 4. Mapear al input del Repositorio
    const productInput: ProductInput = {
      creatorId,
      title: data.title,
      slug: `${slug}-${Date.now().toString().slice(-4)}`, // Evita colisiones rápidas
      type: data.type,
      prices: data.prices,
      description: data.description,
      contentUrl: isStructured ? null : data.contentUrl, // Si es curso, la URL principal es nula
      commissionPercent: data.commissionPercent,
      status: data.status || 'draft',
      sizeBytes: data.sizeBytes,
      guaranteeDays: data.guaranteeDays,
      hasStructuredContent: isStructured,
      modules: data.modules, // El repo se encarga de iterarlos si existen
    };

    try {
      const newProduct = await productRepository.createProduct(productInput);
      logger.info(
        { productId: newProduct.id, type: newProduct.type },
        'Producto creado exitosamente'
      );
      return newProduct;
    } catch (error: any) {
      // Error de violación de unicidad (Slug duplicado)
      if (error.code === '23505') {
        throw new AppError(
          'Ya existe un producto con un título similar. Prueba uno distinto.',
          400
        );
      }
      throw error;
    }
  }

  /**
   * Valida que el porcentaje de comisión esté dentro de los límites legales y financieros.
   * Evita que la suma de comisiones supere el 100% del valor del producto.
   */
  static async validateCommissionLimits(creatorId: string, requestedComm: number): Promise<void> {
    try {
      // 1. Obtener configuraciones base
      const platformCurrency = await configRepository.getSetting('platform_currency', 'ARS');
      const platformConfigs = await configRepository.getConfigsByCurrency(platformCurrency);

      // 2. Obtener el mínimo global de afiliados (Default 10%)
      const rawMinComm = await configRepository.getSetting('min_global_affiliate_commission', '10');
      const minAffiliateComm = Number(rawMinComm);

      // 3. Obtener el porcentaje de fee de la plataforma
      // --- Fee dinámico por plan ---
      const subscription = await subscriptionRepository.getActiveSubscription(creatorId);

      let platformFeePercent =
        platformConfigs && platformConfigs['fee_percent']
          ? Number(platformConfigs['fee_percent']) * 100
          : 10;

      if (subscription?.features?.custom_fee_percent !== undefined) {
        platformFeePercent = Number(subscription.features.custom_fee_percent) * 100;
      }
      // -------------------------------------------

      // 4. VALIDACIÓN 1: Contra el mínimo global (Protección al Afiliado)
      if (requestedComm < minAffiliateComm) {
        throw new AppError(
          `La comisión mínima permitida para afiliados es del ${minAffiliateComm}%.`,
          400
        );
      }

      // 5. VALIDACIÓN 2: Techo máximo (Protección de integridad financiera)
      // Dejamos un margen mínimo del 5% para el creador para cubrir posibles variaciones
      const minimumCreatorMargin = 5;
      const maxPossibleAffiliateComm = 100 - platformFeePercent - minimumCreatorMargin;

      if (requestedComm > maxPossibleAffiliateComm) {
        throw new AppError(
          `Comisión excesiva. El máximo permitido es ${Math.floor(maxPossibleAffiliateComm)}% ` +
            `(deduciendo ${platformFeePercent}% de plataforma y margen de seguridad).`,
          400
        );
      }
    } catch (error: any) {
      if (error instanceof AppError) throw error;

      logger.error({ error: error.message }, 'Error al validar límites de comisión');
      throw new AppError('No se pudieron validar los límites de comisión en este momento.', 500);
    }
  }

  /**
   * Vincula a un afiliado con un producto validando compatibilidad de moneda
   */
  static async joinAffiliateProgram(affiliateId: string, productId: string) {
    const { productRepository } = await import('../repositories/product.repository');
    const { payoutMethodRepository } = await import('../repositories/payout_method.repository');
    const { affiliateRepository } = await import('../repositories/affiliate.repository');

    // 1. Obtener el producto y los métodos de cobro del usuario
    const [product, userMethods] = await Promise.all([
      productRepository.getProductById(productId),
      payoutMethodRepository.getByUserId(affiliateId),
    ]);

    if (!product) throw new AppError('El producto no existe.', 404);

    // 2. Extraer monedas
    const productCurrencies = product.prices.map(p => p.currency);
    const userCurrencies = userMethods.map(m => m.currency);

    // 3. Validar: ¿El afiliado puede cobrar en alguna de las monedas del producto?
    const hasMatch = productCurrencies.some(curr => userCurrencies.includes(curr));

    if (!hasMatch) {
      throw new AppError(
        `No puedes afiliarte. El producto se vende en (${productCurrencies.join(', ')}) ` +
          `y tú solo tienes configurado cobrar en (${userCurrencies.join(', ')}).`,
        403
      );
    }

    // 4. Guardar en el portfolio (usando el repo que ya tienes)
    return await affiliateRepository.addToPortfolio(affiliateId, productId);
  }
}
