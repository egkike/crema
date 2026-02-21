import { Request, Response, NextFunction } from 'express';

import { subscriptionRepository } from '../../repositories/subscription.repository';
import { productRepository } from '../../repositories/product.repository';
import { configRepository } from '../../repositories/config.repository';
import { payoutMethodRepository } from '../../repositories/payout_method.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const checkPlanLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { type, sizeBytes } = req.body;
    const { currency } = req.body; // El front debe enviar la moneda del producto

    if (!user || !user.id) {
      throw new AppError('Usuario no autenticado o sesión inválida.', 401);
    }

    // 1. Validar nivel dinámicamente
    const levels = await configRepository.getUserLevels();
    if (!user || user.level < levels.CREATOR) {
      throw new AppError('Tu nivel de cuenta no permite la creación de productos.', 403);
    }

    // Validar Moneda del usuario
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

    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    if (!subscription) {
      throw new AppError('No posees una suscripción activa para realizar esta operación.', 403);
    }

    const limits = subscription.features || { max_products: 0, storage_mb: 0 };
    const allowedTypes = subscription.allowed_types || [];

    // 2. VALIDACIÓN A: Tipo de Producto
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      throw new AppError(`Tu plan actual no permite crear productos del tipo: ${type}`, 403);
    }

    // 3. VALIDACIÓN B: Cantidad de Productos
    const productsCount = await productRepository.countProductsByCreator(user.id);
    if (productsCount >= (limits.max_products || 0)) {
      throw new AppError(
        `Límite de productos alcanzado (${limits.max_products}). Sube de plan para publicar más.`,
        403
      );
    }

    // 4. VALIDACIÓN C: Almacenamiento
    const storageLimitBytes = Number(limits.storage_mb || 0) * 1024 * 1024;
    const currentStorageUsed = await subscriptionRepository.getUserStorageUsage(user.id);
    const incomingSize = Number(sizeBytes || 0);

    if (currentStorageUsed + incomingSize > storageLimitBytes) {
      throw new AppError('Espacio insuficiente. Libera espacio o mejora tu plan.', 403);
    }

    logger.info({ userId: user.id, type }, 'Límites de plan verificados con éxito');
    next();
  } catch (error) {
    next(error);
  }
};
