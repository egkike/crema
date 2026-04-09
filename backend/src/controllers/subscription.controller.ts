import { Request, Response, NextFunction } from 'express';

import { subscriptionRepository } from '../repositories/subscription.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';

export const getMySubscriptionStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const subscription = await subscriptionRepository.getActiveSubscription(user.id);
    if (!subscription) {
      throw new AppError('No se encontró una suscripción activa para este usuario.', 404);
    }

    const currentProducts = await productRepository.getProductsByCreator(user.id);
    const currentStorageBytes = await subscriptionRepository.getUserStorageUsage(user.id);

    // 1. Extraemos features con un fallback para evitar el error de "undefined"
    // Definimos valores mínimos por si la DB no los tiene
    const limits = subscription.features || {
      max_products: 0,
      storage_mb: 0,
    };

    const storageUsedMB = (currentStorageBytes / (1024 * 1024)).toFixed(2);
    const storageUsedNum = Number(storageUsedMB);

    // 2. Usamos los valores de manera segura
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
            remaining: Math.max(0, (Number(limits.max_products) || 0) - currentProducts.length),
          },
          storage: {
            usedMB: storageUsedNum,
            limitMB: limits.storage_mb,
            remainingMB: Number(((Number(limits.storage_mb) || 0) - storageUsedNum).toFixed(2)),
          },
        },
        allowedTypes: subscription.allowed_types,
      },
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const subscriptionController = {
  getMySubscriptionStatus,
};
