import { Request, Response, NextFunction } from 'express';

import { subscriptionRepository } from '../../repositories/subscription.repository';
import { productRepository } from '../../repositories/product.repository';
import { configRepository } from '../../repositories/config.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

interface CreateProductBody {
  type: string;
  sizeBytes?: number;
  content_url?: string;
  currency: string;
  title: string;
}

export const checkPlanLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { type, sizeBytes, content_url, currency } = req.body as CreateProductBody;

    if (!user || !user.id) {
      throw new AppError('Usuario no autenticado o sesión inválida.', 401);
    }

    // 1. Validar nivel dinámicamente
    const levels = await configRepository.getUserLevels();
    if (!user || user.level < levels.CREATOR) {
      throw new AppError('Tu nivel de cuenta no permite la creación de productos.', 403);
    }

    // 2. Validar Moneda del usuario
    if (currency) {
      const userMethods = await payoutMethodRepository.getByUserId(user.id);
      const hasCurrencyConfigured = userMethods.some(m => m.currency === currency);

      if (!hasCurrencyConfigured) {
        throw new AppError(
          `No puedes crear productos en ${currency} sin configurar antes un método de cobro para esa moneda.`,
          403
        );
      }
    }

    // 3. Obtener Límites del Plan (Usando el nuevo método optimizado)
    const planLimits = await subscriptionRepository.getCreatorPlanLimits(user.id);
    if (!planLimits) {
      throw new AppError('No posees una suscripción activa para operar.', 403);
    }

    const { features, allowedTypes, currentStorageBytes } = planLimits;
    const storageLimitBytes = Number(features.storage_mb || 0) * 1024 * 1024;
    const incomingSize = Number(sizeBytes || 0);

    // 4. VALIDACIÓN: Tipo de Producto
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      throw new AppError(
        `Tu plan "${planLimits.planName}" no permite productos de tipo: ${type}`,
        403
      );
    }

    // 5. VALIDACIÓN: Cantidad de Productos
    const productsCount = await productRepository.countProductsByCreator(user.id);
    if (productsCount >= (features.max_products || 0)) {
      throw new AppError(
        `Límite alcanzado (${features.max_products} productos). Mejora tu plan para publicar más.`,
        403
      );
    }

    // 6. VALIDACIÓN CRÍTICA: Almacenamiento (La regla del 0 MB)
    if (storageLimitBytes === 0) {
      // Si el plan es de 0MB, no puede haber sizeBytes (subida de archivos)
      if (incomingSize > 0) {
        throw new AppError(
          'Tu plan actual no permite el alojamiento de archivos. Por favor, utiliza un link externo o mejora tu plan.',
          403
        );
      }

      // Para cursos en plan gratuito, forzamos que el contenido sea un link (YouTube/Vimeo)
      if (type === 'course' && !content_url) {
        throw new AppError(
          'Para cursos en el plan gratuito, debes proporcionar una URL de video externa.',
          400
        );
      }
    } else {
      // Si el plan tiene espacio, validamos que no se pase del total
      if (currentStorageBytes + incomingSize > storageLimitBytes) {
        throw new AppError('Espacio de almacenamiento insuficiente en tu plan.', 403);
      }
    }

    logger.info({ userId: user.id, plan: planLimits.planName, type }, 'Límites verificados');
    next();
  } catch (error) {
    next(error);
  }
};
