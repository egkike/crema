import { Request, Response, NextFunction } from 'express';

import { subscriptionRepository } from '../repositories/subscription.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';

export const getMySubscriptionStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req; 
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Obtener la suscripción activa y beneficios del plan
    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    if (!subscription) {
      throw new AppError('No se encontró una suscripción activa para este usuario.', 404);
    }

    // 2. Obtener uso actual
    const currentProducts = await productRepository.getProductsByCreator(user.id);
    const currentStorageBytes = await subscriptionRepository.getUserStorageUsage(user.id);

    // 3. Formatear respuesta para el frontend
    const limits = subscription.features; // { max_products, storage_mb, ... }
    const storageUsedMB = (currentStorageBytes / (1024 * 1024)).toFixed(2);

    res.status(200).json({
      success: true,
      data: {
        planName: subscription.plan_name,
        status: subscription.status,
        expiresAt: subscription.current_period_end,
        usage: {
          products: {
            used: currentProducts.length,
            limit: limits.max_products,
            remaining: Math.max(0, limits.max_products - currentProducts.length),
          },
          storage: {
            usedMB: Number(storageUsedMB),
            limitMB: limits.storage_mb,
            remainingMB: Number((limits.storage_mb - Number(storageUsedMB)).toFixed(2)),
          },
        },
        allowedTypes: subscription.allowed_types,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const subscriptionController = {
  getMySubscriptionStatus,
};
