import path from 'path';
import fs from 'fs';

import { Request, Response, NextFunction } from 'express';

import { AccessService } from '../services/access.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export const getProductContent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { productId } = req.params;

    // 1. Verificación de identidad y tipo
    if (!user?.id) {
      throw new AppError('Usuario no identificado.', 401);
    }

    if (typeof productId !== 'string') {
      throw new AppError('ID de producto no válido.', 400);
    }

    // 2. Obtener el contenido a través del servicio
    const content = await AccessService.getProtectedContent(user.id, productId);

    // LOG: Registro de acceso autorizado
    logger.info(
      { userId: user.id, productId, title: content.title },
      'Acceso autorizado a contenido protegido'
    );

    // 3. Lógica de entrega según el tipo de URL

    // CASO A: Es un link externo (YouTube, Notion, Drive, etc.)
    if (content.contentUrl && content.contentUrl.startsWith('http')) {
      return res.status(200).json({
        success: true,
        message: 'Acceso concedido a link externo',
        data: content,
      });
    }

    // CASO B: Archivo local (Estructura organizada /uploads/userId/productId/...)
    if (content.contentUrl && content.contentUrl.startsWith('/uploads/')) {
      // Quitamos el primer '/' para que path.join trabaje desde la raíz del proyecto
      const relativePath = content.contentUrl.startsWith('/')
        ? content.contentUrl.substring(1)
        : content.contentUrl;

      const filePath = path.join(process.cwd(), relativePath);

      if (!fs.existsSync(filePath)) {
        logger.error({ filePath, productId }, 'Archivo físico no encontrado en el servidor');
        throw new AppError('El archivo no existe en el servidor.', 404);
      }

      // Extraer nombre original para que el usuario no vea el prefijo de Multer
      // Multer guarda: 171234567-archivo.zip -> Usuario descarga: archivo.zip
      const fileName = path.basename(filePath);
      const cleanName = fileName.includes('-') ? fileName.split('-').slice(1).join('-') : fileName;

      // res.download gestiona automáticamente los headers y el streaming
      return res.download(filePath, cleanName, err => {
        if (err) {
          logger.error({ err, filePath }, 'Error durante la descarga del archivo');
        }
      });
    }

    // Caso por defecto (si no hay URL definida todavía)
    res.status(200).json({
      success: true,
      message: 'Acceso concedido (sin archivo adjunto)',
      data: content,
    });
  } catch (error: any) {
    logger.error(
      { error: error.message, userId: req.user?.id, productId: req.params.productId },
      'Error al intentar entregar contenido'
    );
    next(error);
  }
};

export const contentController = {
  getProductContent,
};
