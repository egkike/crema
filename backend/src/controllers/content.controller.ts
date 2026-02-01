import { Request, Response, NextFunction } from 'express';

import { AccessService } from '../services/access.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * Controlador para la gestión de acceso al contenido protegido de los productos.
 */
export const getProductContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Obtener el ID del usuario desde el middleware de JWT (con optional chaining por seguridad)
    const userId = (req as any).user?.id;

    // 2. Obtener y asegurar el productId de los parámetros de la URL
    const productId = req.params.productId as string;

    // 3. Validaciones preventivas antes de llamar al servicio
    if (!userId) {
      throw new AppError('Usuario no identificado. Por favor, inicie sesión.', 401);
    }

    if (!productId) {
      throw new AppError('El ID del producto es requerido para acceder al contenido.', 400);
    }

    logger.info({ userId, productId }, 'Procesando solicitud de acceso a contenido protegido');

    // 4. Llamada al servicio de lógica de negocio (AccessService)
    // Este servicio ya verifica si el producto está publicado o archivado.
    const content = await AccessService.getProtectedContent(userId, productId);

    // 5. Respuesta exitosa
    res.status(200).json({
      success: true,
      message: 'Contenido obtenido exitosamente',
      data: content,
    });
  } catch (error: any) {
    // Registramos el error antes de pasarlo al handler global
    logger.error(
      { error: error.message, productId: req.params.productId },
      'Error en getProductContent controller'
    );
    next(error);
  }
};

/**
 * Objeto exportado para mantener consistencia con el router:
 * router.get('/:productId/content', contentController.getProductContent)
 */
export const contentController = {
  getProductContent,
};
