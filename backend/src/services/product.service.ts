import slugify from 'slugify';

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
    // 0. Extraer datos
    const {
      title,
      type,
      prices,
      description,
      contentUrl,
      affiliate_commission_percent,
      sizeBytes = 0,
      guaranteeDays,
      modules = [],
      status = 'published',
    } = data;

    // 1. --- VALIDACIÓN DE MONEDA PARA EL CREADOR ---
    const userMethods = await payoutMethodRepository.getByUserId(creatorId);
    if (!userMethods || userMethods.length === 0) {
      throw new AppError(
        'Debes configurar al menos un método de cobro antes de crear productos.',
        400
      );
    }

    const userCurrencies = userMethods.map(m => m.currency);

    // 2. VALIDACIÓN DE PRECIOS (Moneda y Mínimo Factor x10)
    if (prices && Array.isArray(prices) && prices.length > 0) {
      for (const p of prices) {
        if (!userCurrencies.includes(p.currency)) {
          throw new AppError(`No tienes método de cobro para: ${p.currency}`, 400);
        }
        await this.validateMinimumPrice(p.currency, Number(p.amount));
      }
    } else {
      throw new AppError('El producto debe tener al menos un precio definido.', 400);
    }

    // 3. VALIDACIÓN DE COMISIÓN (Usamos la moneda del primer precio como referencia)
    const commToValidate = affiliate_commission_percent !== undefined ? Number(affiliate_commission_percent) : 0;
    const referenceCurrency = prices[0].currency;
    await this.validateCommissionLimits(creatorId, commToValidate, referenceCurrency);

    // 4. VALIDACIÓN: Integridad del contenido
    const isStructured = type === 'course' || (modules && modules.length > 0);

    if (!sizeBytes && !contentUrl && !isStructured) {
      throw new AppError(
        'El producto no tiene contenido. Sube un archivo, pon una URL o agrega módulos.',
        400
      );
    }

    // 5. Generar Slug único usando slugify (consistente con el controlador)
    const baseSlug = slugify(title, { lower: true, strict: true });
    const uniqueSlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 6. Preparar Input para el Repositorio
    const productInput: ProductInput = {
      creatorId,
      title,
      slug: uniqueSlug,
      type,
      prices,
      description: description || null,
      contentUrl: isStructured ? null : contentUrl,
      affiliate_commission_percent: commToValidate,
      status: status,
      sizeBytes: Number(sizeBytes),
      guaranteeDays: guaranteeDays || null,
      hasStructuredContent: isStructured,
      modules: modules,
    };

    try {
      const newProduct = await productRepository.createProduct(productInput);
      logger.info(
        { productId: newProduct.id, slug: newProduct.slug },
        'Producto creado exitosamente vía Service'
      );
      return newProduct;
    } catch (error: any) {
      // Error de violación de unicidad (Slug duplicado en DB)
      if (error.code === '23505') {
        throw new AppError(
          'Ya existe un producto con un título muy similar. Intenta variar el nombre.',
          400
        );
      }
      throw error;
    }
  }

  /**
   * Protege que el precio no sea inferior al umbral de rentabilidad.
   */
  public static async validateMinimumPrice(currency: string, amount: number): Promise<void> {
    const configs = await configRepository.getConfigsByCurrency(currency);

    const factor = configs?.['min_product_price_factor']
      ? Number(configs['min_product_price_factor'])
      : 10;
    const feeLow = configs?.['fixed_fee_low'] ? Number(configs['fixed_fee_low']) : 450;
    const minAllowed = feeLow * factor;

    if (amount < minAllowed) {
      throw new AppError(
        `El precio en ${currency} ($${amount}) es demasiado bajo. El mínimo es $${minAllowed}.`,
        400
      );
    }
  }

  /**
   * Valida que el porcentaje de comisión esté dentro de los límites legales y financieros.
   * Evita que la suma de comisiones supere el 100% del valor del producto.
   */
  static async validateCommissionLimits(
    creatorId: string,
    requestedComm: number,
    currency: string
  ): Promise<void> {
    try {
      // 1. Obtener configuraciones base
      const configs = await configRepository.getConfigsByCurrency(currency);

      // 2. Obtener el mínimo global de afiliados (Default 10%)
      const minAffiliateComm =
        configs && configs['min_global_affiliate_commission']
          ? Number(configs['min_global_affiliate_commission'])
          : 5;

      // 3. Obtener el porcentaje de fee de la plataforma
      const subscription = await subscriptionRepository.getCreatorPlanLimits(creatorId);

      let platformFeePercent =
        configs && configs['fee_percent'] ? Number(configs['fee_percent']) * 100 : 10;

      // Si el plan tiene un fee personalizado (ej: 5% en el Plan Pro), lo usamos
      if (subscription?.features?.custom_fee_percent !== undefined) {
        platformFeePercent = Number(subscription.features.custom_fee_percent) * 100;
      }

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
