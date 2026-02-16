import { Request, Response, NextFunction } from 'express';

import { AccessService } from '../services/access.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export const getProductContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { productId } = req.params;

    // 1. Verificación de identidad
    if (!user?.id) {
      throw new AppError('Usuario no identificado.', 401);
    }

    // 2. Type Guard para el productId (evita el error de string | string[])
    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    logger.info({ userId: user.id, productId }, 'Acceso autorizado a contenido protegido');

    // 3. Obtener el contenido a través del servicio
    // El servicio debería retornar un objeto con { title, type, content_url, etc }
    const content = await AccessService.getProtectedContent(user.id, productId);

    res.status(200).json({
      success: true,
      message: 'Acceso concedido',
      data: content,
    });
  } catch (error: any) {
    logger.error(
      { error: error.message, productId: req.params.productId },
      'Error al entregar contenido'
    );
    next(error);
  }
};

export const contentController = {
  getProductContent,
};
