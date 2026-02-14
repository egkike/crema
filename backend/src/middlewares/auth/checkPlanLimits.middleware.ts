import { Request, Response, NextFunction } from 'express';

import { subscriptionRepository } from '../../repositories/subscription.repository';
import { productRepository } from '../../repositories/product.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const checkPlanLimits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { type, sizeBytes } = req.body;

    // 1. Validar que sea un Creador (Nivel 3).
    // Los Afiliados (Nivel 2) no pueden crear productos en absoluto.
    if (user.level < 3) {
      throw new AppError('Tu nivel de cuenta no permite la creación de productos.', 403);
    }

    // 2. Obtener la suscripción activa
    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    if (!subscription) {
      throw new AppError('No posees una suscripción activa para realizar esta operación.', 403);
    }

    const limits = subscription.features; // JSONB: { max_products, storage_mb }
    const allowedTypes = subscription.allowed_types || [];

    // 3. VALIDACIÓN A: Tipo de Producto
    // Si la tabla plan_allowed_types tiene registros, validamos contra ellos.
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      throw new AppError(`Tu plan actual no permite crear productos del tipo: ${type}`, 403);
    }

    // 4. VALIDACIÓN B: Cantidad de Productos
    const productsCount = await productRepository.countProductsByCreator(user.id);
    if (productsCount >= limits.max_products) {
      throw new AppError(
        `Límite de productos alcanzado (${limits.max_products}). Sube de plan para publicar más.`,
        403
      );
    }

    // 5. VALIDACIÓN C: Almacenamiento (MB a Bytes)
    const storageLimitBytes = Number(limits.storage_mb) * 1024 * 1024;
    const currentStorageUsed = await subscriptionRepository.getUserStorageUsage(user.id);
    const incomingSize = Number(sizeBytes || 0);

    if (currentStorageUsed + incomingSize > storageLimitBytes) {
      throw new AppError(
        'Espacio de almacenamiento insuficiente. Libera espacio o mejora tu plan.',
        403
      );
    }

    // Si todo está ok, registramos el intento exitoso y seguimos
    logger.info({ userId: user.id, type }, 'Límites de plan verificados con éxito');
    next();
  } catch (error) {
    next(error);
  }
};
