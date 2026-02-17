// Este middleware de roles permite que ciertas rutas o acciones solo sean accesibles para usuarios
// con un nivel específico (por ejemplo, solo level >= 5 puede crear/eliminar usuarios,
// o level >= 10 para acciones administrativas).

import { Request, Response, NextFunction } from 'express';

import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

/**
 * Middleware para validar nivel de usuario
 * Uso: restrictTo(USER_LEVELS.ADMIN) o restrictTo(USER_LEVELS.CREATOR)
 */
export const restrictTo = (requiredLevel: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { user } = req;

    if (!user) {
      return next(new AppError('No autorizado - usuario no encontrado', 401));
    }

    // Aquí es donde se "lee" el valor si lo usaras para una validación extra,
    // pero el error de "no se lee nunca" suele ser porque el linter/TS
    // espera que las uses en el código o en las llamadas.

    if (user.level < requiredLevel) {
      logger.warn(
        {
          userId: user.id,
          userLevel: user.level,
          requiredLevel,
          path: req.path,
        },
        'Acceso denegado por nivel insuficiente'
      );
      return next(new AppError('No tienes permisos suficientes para esta acción', 403));
    }

    next();
  };
};
