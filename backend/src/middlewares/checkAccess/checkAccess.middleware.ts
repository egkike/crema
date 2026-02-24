import { Request, Response, NextFunction } from 'express';

import { orderRepository } from '../../repositories/order.repository';
import { configRepository } from '../../repositories/config.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const checkContentAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { productId } = req.params;

    // Validación estricta de entrada
    if (!user?.id || !productId || typeof productId !== 'string') {
      throw new AppError('Acceso denegado: Identificación o ID de producto no válido', 400);
    }

    // 1. Admin dinámico (Nivel 99 por defecto en DB)
    const levels = await configRepository.getUserLevels();
    if (user.level >= levels.ADMIN) return next();

    // 2. UN SOLO VIAJE: Verificamos autoría y compra simultáneamente
    const { isOwner, hasPaid } = await orderRepository.verifyAccess(user.id, productId);

    // 3. Lógica de decisión
    if (isOwner || hasPaid) {
      return next();
    }

    // Si llegó aquí, no es admin, no es dueño y no pagó
    logger.warn({ userId: user.id, productId }, 'Intento de acceso no autorizado');
    throw new AppError('No tienes permiso para acceder a este contenido.', 403);
  } catch (error) {
    next(error);
  }
};
