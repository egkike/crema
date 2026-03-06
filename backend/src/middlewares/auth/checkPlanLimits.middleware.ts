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
  status?: string;
}

export const checkPlanLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user, params } = req;
    const { type, sizeBytes, content_url, currency, status } = req.body as CreateProductBody;
    const productId = params.productId as string;

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
    const storageLimitMB = Number(features.storage_mb || 0);
    const storageLimitBytes = storageLimitMB * 1024 * 1024;

    // --- Validación proactiva de tamaño mediante Headers ---
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    // 4. VALIDACIÓN: Tipo de Producto
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      throw new AppError(
        `Tu plan "${planLimits.planName}" no permite productos de tipo: ${type}`,
        403
      );
    }

    // 5. VALIDACIÓN CRÍTICA: Cantidad de Productos ACTIVOS (Published)
    if (status === 'published') {
      let isAlreadyPublished = false;

      // Si es un UPDATE (hay productId), verificamos el estado previo
      if (productId) {
        const currentStatus = await productRepository.getProductStatus(productId);
        isAlreadyPublished = currentStatus === 'published';
      }

      // Si NO estaba publicado (es nuevo o cambia de draft/archived -> published), validamos cupo
      if (!isAlreadyPublished) {
        const publishedCount = await productRepository.countPublishedByCreator(user.id);

        if (publishedCount >= (features.max_products || 0)) {
          throw new AppError(
            `Límite de productos publicados alcanzado (${features.max_products}). ` +
              `Desactiva o archiva un producto existente para poder publicar uno nuevo.`,
            403
          );
        }
      }
    }

    // 6. VALIDACIÓN CRÍTICA: Almacenamiento (La regla del 0 MB)
    if (storageLimitMB === 0) {
      // Bloqueamos si el header indica que viene un archivo o si se declara un sizeBytes
      if (contentLength > 50000 || Number(sizeBytes || 0) > 0) {
        throw new AppError(
          'Tu plan actual no permite el alojamiento de archivos (0 MB). Usa links externos.',
          403
        );
      }

      if (type === 'course' && !content_url) {
        throw new AppError(
          'Para cursos en el plan gratuito, debes proporcionar una URL de video externa.',
          400
        );
      }
    } else {
      // Para planes con espacio (Pro), validamos el tamaño entrante
      const incomingSize = Number(sizeBytes || 0) || (contentLength > 50000 ? contentLength : 0);

      if (currentStorageBytes + incomingSize > storageLimitBytes) {
        throw new AppError(
          `Espacio insuficiente. Te quedan ${((storageLimitBytes - currentStorageBytes) / (1024 * 1024)).toFixed(2)} MB.`,
          403
        );
      }
    }

    logger.info({ userId: user.id, productId, plan: planLimits.planName, type }, 'Límites verificados');
    next();
  } catch (error) {
    next(error);
  }
};
