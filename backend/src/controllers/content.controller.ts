import { Request, Response, NextFunction } from 'express';

import { AccessService } from '../services/access.service';
import { AppError } from '../errors/AppError';

export const getProductContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { productId } = req.params;

    // Validación y forzado de tipo (Type Casting)
    if (!productId || typeof productId !== 'string') {
      throw new AppError('El ID del producto es inválido o no fue proporcionado', 400);
    }

    // Pasamos productId con la seguridad de que es un string único
    const content = await AccessService.getProtectedContent(user.id, productId);

    res.status(200).json({
      success: true,
      data: content,
    });
  } catch (error) {
    next(error);
  }
};

// --- ESTO ES LO QUE ARREGLA EL ERROR EN PRODUCT.ROUTES.TS ---
export const contentController = {
  getProductContent,
};
