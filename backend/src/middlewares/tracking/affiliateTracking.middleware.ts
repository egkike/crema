import { Request, Response, NextFunction } from 'express';

import logger from '../../utils/logger';
import { config } from '../../config/index';

/**
 * Middleware para capturar el código de afiliado desde la URL y persistirlo en una cookie.
 * Cuando un usuario entre con un link como crema.com/p/123?aff=ID_AFILIADO, el sistema guarde quién lo recomendó.
 * Se debe aplicar en rutas públicas de productos o landing pages.
 */
export const affiliateTracking = (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aff } = req.query;

    // Solo procesamos si el parámetro 'aff' está presente
    if (aff && typeof aff === 'string') {
      // Opcional: Podrías validar que sea un UUID si tus IDs de usuario lo son
      // para evitar basura en las cookies.

      const cookieOptions = {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax' as const, // 'lax' es necesario para capturar la cookie viniendo de un link externo
        path: '/',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días de persistencia
      };

      res.cookie('affiliate_id', aff, cookieOptions);

      logger.debug({ affiliateId: aff, path: req.path }, 'Cookie de afiliado establecida');
    }

    next();
  } catch (error) {
    // En tracking de marketing no bloqueamos la ejecución si algo falla,
    // solo logueamos y seguimos para no arruinar la experiencia del comprador.
    logger.error({ error }, 'Error en affiliateTracking middleware');
    next();
  }
};
