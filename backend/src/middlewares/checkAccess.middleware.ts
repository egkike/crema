import { Request, Response, NextFunction } from 'express';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';

export const checkContentAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    // Forzamos a que sea tratado como string para evitar el error de "string | string[]"
    const productId = req.params.productId as string;

    if (!userId || !productId) {
      throw new AppError('Acceso denegado: Información de usuario o producto incompleta', 400);
    }

    // 1. Verificamos si el producto existe
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // 2. Si el usuario es el Creador (Dueño), tiene acceso total
    if (product.creator_id === userId) {
      return next();
    }

    // 3. Verificamos si existe una compra pagada
    const hasAccess = await orderRepository.checkPaidOrder(userId, productId);

    if (!hasAccess) {
      throw new AppError(
        'No tienes permiso para acceder a este contenido. Adquiérelo primero.',
        403
      );
    }

    // Todo bien, adelante
    next();
  } catch (error) {
    next(error);
  }
};
