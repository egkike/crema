import { Request, Response, NextFunction } from 'express';

import { userRepository } from '../../repositories/user.repository';
import logger from '../../utils/logger';
import { config } from '../../config/index';

export const affiliateTracking = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { aff } = req.query;
    // El usuario logueado (si existe) viene inyectado por el auth middleware previo
    const currentUser = (req as any).user;

    if (aff && typeof aff === 'string') {
      // 1. Buscamos al afiliado por su slug
      const affiliate = await userRepository.findByAffiliateSlug(aff);

      if (affiliate) {
        // --- SAFE-GUARD: Evitar Auto-Afiliación ---
        // Si el que hace clic es el mismo dueño del link, no seteamos cookie
        if (currentUser && currentUser.id === affiliate.id) {
          logger.debug({ userId: currentUser.id }, 'Auto-afiliación detectada. Omitiendo cookie.');
          return next();
        }

        const cookieOptions = {
          httpOnly: true,
          secure: config.nodeEnv === 'production',
          sameSite: 'lax' as const,
          path: '/',
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
        };

        res.cookie('affiliate_id', affiliate.id, cookieOptions);
        logger.debug(
          { affiliateSlug: aff, affiliateId: affiliate.id },
          'Cookie de afiliado vinculada'
        );
      }
    }
    next();
  } catch (error) {
    logger.error({ error }, 'Error en affiliateTracking middleware');
    next();
  }
};
