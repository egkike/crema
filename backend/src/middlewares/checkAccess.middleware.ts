import { Request, Response, NextFunction } from 'express';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { AppError } from '../errors/AppError';

export const checkContentAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).user?.id;
    const productId = req.params.productId as string;

    if (!userId || !productId) {
      throw new AppError('Acceso denegado: Información de usuario o producto incompleta', 400);
    }

    // 1. Verificamos primero si el producto existe
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // 2. Usamos el método correcto del repositorio: checkAccess
    // Este método ya verifica internamente:
    // - Si el usuario compró el producto (status 'paid')
    // - O si el usuario es el creador del producto
    const hasAccess = await orderRepository.checkAccess(userId, productId);

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
