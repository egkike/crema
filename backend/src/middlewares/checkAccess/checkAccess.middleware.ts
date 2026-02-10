import { Request, Response, NextFunction } from 'express';

import { orderRepository } from '../../repositories/order.repository';
import { productRepository } from '../../repositories/product.repository';
import { AppError } from '../../errors/AppError';

// src/middlewares/checkAccess.middleware.ts
export const checkContentAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { productId } = req.params;

    if (!user?.id || !productId) {
      throw new AppError('Acceso denegado: Identificación incompleta', 400);
    }

    // 1. Si es Administrador (Level 99), acceso total para soporte
    if (user.level >= 99) return next();

    // 2. Buscamos el producto para ver quién es el dueño
    const product = await productRepository.getProductById(productId as string);
    if (!product) throw new AppError('Producto no encontrado', 404);

    // 3. Si es el creador del producto, tiene acceso
    if (product.creator_id === user.id) return next();

    // 4. Verificamos si tiene una compra exitosa y no reembolsada
    const hasAccess = await orderRepository.checkAccess(user.id, productId as string);

    if (!hasAccess) {
      throw new AppError('No tienes permiso para acceder a este contenido.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};
