import { Request, Response, NextFunction } from 'express';

import { AppError } from '../../errors/AppError';
import { userRepository } from '../../repositories/user.repository';

interface UserWith2FA {
  level: number;
  two_factor_enabled?: boolean;
}

/**
 * Middleware que verifica que los usuarios con rol ADMIN tengan 2FA habilitado
 * Debe ejecutarse DESPUÉS de jwtAuthMiddleware (para tener req.user) 
 * y DESPUÉS de restrictTo('ADMIN') (para verificar que es admin)
 */
export const requireAdmin2FA = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const adminId = req.user?.id;

    if (!adminId) {
      throw new AppError('Admin no autenticado', 401);
    }

    // Obtener usuario con datos de 2FA
    const user = await userRepository.getById(adminId) as UserWith2FA | null;

    if (!user) {
      throw new AppError('Usuario no encontrado', 404);
    }

    // Verificar si es admin (level >= 10) y si tiene 2FA habilitado
    if (user.level >= 10 && !user.two_factor_enabled) {
      throw new AppError('2FA es obligatorio para administradores. Por favor configure 2FA en su perfil.', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};