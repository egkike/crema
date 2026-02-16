import { Request, Response, NextFunction } from 'express';

import { userRepository } from '../../repositories/user.repository';
import logger from '../../utils/logger';
import { config } from '../../config/index';

/**
 * Middleware para capturar el código de afiliado desde la URL y persistirlo en una cookie.
 * Cuando un usuario entre con un link como crema.com/p/123?aff=ID_AFILIADO, el sistema guarde quién lo recomendó.
 * Se debe aplicar en rutas públicas de productos o landing pages.
 */
export const affiliateTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aff } = req.query;

    if (aff && typeof aff === 'string') {
      // Buscamos al usuario por su slug
      const user = await userRepository.findByAffiliateSlug(aff);

      if (user) {
        const cookieOptions = {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        };

        // Guardamos el ID real (UUID), no el slug, para facilitar el trabajo al OrderService
        res.cookie('affiliate_id', user.id, cookieOptions);
        logger.debug({ affiliateSlug: aff, userId: user.id }, 'Cookie de afiliado vinculada');
      }
    }
    next();
  } catch (error) {
    logger.error({ error }, 'Error en affiliateTracking middleware');
    next();
  }
};
