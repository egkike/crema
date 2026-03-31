import { Request, Response, NextFunction } from 'express';

import logger from '../../utils/logger';

/**
 * Middleware de Request ID para trazabilidad
 * 
 * Genera un UUID único por cada request HTTP o usa el existente
 * en el header X-Request-ID para mantener trazabilidad distribuida.
 * 
 * Agrega:
 * - req.id: El request ID
 * - res.setHeader('X-Request-ID', id): Header en respuesta
 * - Logs con requestId incluido
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // 1. Obtener o generar request ID
  const incomingId = req.headers['x-request-id'] as string | undefined;
  const requestId = incomingId || crypto.randomUUID();

  // 2. Guardar en request para uso en controllers/services
  req.id = requestId;

  // 3. Agregar header a la respuesta
  res.setHeader('X-Request-ID', requestId);

  // 4. Crear logger child con requestId para logs subsiguientes
  const reqLogger = logger.child({ requestId });
  
  // 5. Adjuntar logger al request para uso en servicios
  req.log = reqLogger;

  next();
};
