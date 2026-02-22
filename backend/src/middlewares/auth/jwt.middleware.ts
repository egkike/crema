import { Request, Response, NextFunction } from 'express';

import { verifyToken } from '../../utils/jwt';
import logger from '../../utils/logger';

/**
 * Middleware de autenticación JWT
 * - Busca el token en la cookie 'access_token' (nuevo sistema)
 * - Verifica el token y adjunta el usuario en req.user
 */
export const jwtAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Buscamos en la nueva cookie
  const token = req.cookies.access_token;

  if (!token) {
    logger.warn(
      {
        path: req.path,
        method: req.method,
        ip: req.ip,
      },
      'Acceso sin token'
    );

    return res.status(401).json({
      success: false,
      error: 'No autorizado',
      message: 'Se requiere autenticación (token no presente)',
    });
  }

  const user = verifyToken(token);

  if (!user) {
    logger.warn(
      {
        path: req.path,
        method: req.method,
      },
      'Token inválido o expirado'
    );

    return res.status(401).json({
      success: false,
      error: 'No autorizado',
      message: 'Token inválido o expirado',
    });
  }

  // ASIGNACIÓN LIMPIA: TS ya sabe que req.user existe por express.d.ts
  req.user = user as typeof req.user;

  // Validación de Primer Login y 2FA (Flag Partial)
  if (user.partial) {
    // Definimos las rutas que SÍ pueden pasar con un token restringido
    const allowedPaths = [
      '/change-password-first-login', // Ajustado para coincidir con tus rutas
      '/login/2fa', // Para completar el login con 2FA
      '/2fa/verify', // Para la activación inicial del 2FA (si aplica)
      '/logout', // Siempre permitir logout incluso en estado parcial
    ];

    const isAllowedPath = allowedPaths.some(path => req.path.endsWith(path));

    if (!isAllowedPath) {
      logger.warn(
        { userId: user.id, path: req.path },
        'Intento de acceso restringido con token parcial'
      );
      return res.status(403).json({
        success: false,
        error: 'RESTRICTED_ACCESS',
        message: 'Acceso restringido: Debes completar la verificación de seguridad pendiente.',
      });
    }
  }

  logger.debug(
    {
      userId: user.id,
      username: user.username,
      level: user.level,
      path: req.path,
    },
    `Autenticación exitosa`
  );

  next();
};

/**
 * Middleware de autenticación JWT OPCIONAL
 * - Si hay token, valida y pone al usuario en req.user.
 * - Si NO hay token o es inválido, deja pasar la petición (req.user será null).
 */
export const optionalJwtAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;
  if (!token) {
    req.user = undefined; // En lugar de null, para coincidir con el "?" de la interfaz
    return next();
  }
  const user = verifyToken(token);
  req.user = user ? (user as typeof req.user) : undefined;
  next();
};
