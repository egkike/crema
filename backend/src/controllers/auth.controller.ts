import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { validatePartialUser } from '../schemas/users';
import logger from '../utils/logger';
import { config } from '../config/index';
import { userRepository, type UserWithPassword } from '../repositories/user.repository';
import { AppError } from '../errors/AppError';

export class AuthController {
  async login(req: Request, res: Response) {
    const { username, email, password } = req.body;

    const input = username ? { username, password } : { email, password };
    const validation = validatePartialUser(input);
    if (!validation.success) {
      const errorMsg = JSON.parse(validation.error.message)[0]?.message;
      throw new AppError(errorMsg || 'Datos inválidos', 400);
    }

    const identifier = username || email;
    const user = await userRepository.findByCredentials(identifier);

    if (!user) {
      logger.warn({ identifier }, 'Intento de login: Usuario no encontrado');
      throw new AppError('Credenciales inválidas', 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn({ identifier }, 'Intento de login: Password incorrecto');
      throw new AppError('Credenciales inválidas', 401);
    }

    if (user.active === 0) {
      throw new AppError('Usuario inactivo. Contacta al administrador.', 403);
    }

    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    // MEJORA: Seguridad en el "Primer Login"
    if (user.must_change_password) {
      // Enviamos el flag partial: true para que el middleware bloquee otras rutas
      const tempToken = generateAccessToken({
        id: user.id,
        username: user.username,
        partial: true,
      } as any);

      res.cookie('access_token', tempToken, cookieOptions);

      return res.status(403).json({
        success: false,
        mustChangePassword: true,
        message: 'Debes cambiar la contraseña en tu primer login.',
      });
    }

    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      fullname: user.fullname,
      level: user.level,
      active: user.active,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await userRepository.saveRefreshToken(
      user.id,
      refreshToken,
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    );

    res.cookie('access_token', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...publicUser } = user as UserWithPassword;
    return res.status(200).json({ success: true, user: publicUser });
  }

  async logout(req: Request, res: Response) {
    // 1. Obtenemos el token específico de la cookie
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) {
      // Borramos SOLO este token específico de la tabla
      await userRepository.deleteSpecificRefreshToken(refreshToken);
    }

    // 2. Limpiamos las cookies con las mismas opciones que se crearon
    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
  }

  async refresh(req: Request, res: Response) {
    try {
      const refreshToken = req.cookies.refresh_token;

      if (!refreshToken) {
        throw new AppError('Refresh token no proporcionado', 401);
      }

      // 1. Validar que el token exista en la base de datos
      const tokenData = await userRepository.findRefreshToken(refreshToken);
      if (!tokenData) {
        throw new AppError('Token inválido o expirado', 403);
      }

      // 2. Verificar la integridad del JWT
      const decoded = verifyRefreshToken(refreshToken) as any;

      // 3. Generar nuevo Access Token
      const newAccessToken = generateAccessToken({
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        fullname: decoded.fullname,
        level: decoded.level,
      });

      // 4. Enviar la nueva cookie
      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60 * 1000, // 15 minutos
      });

      return res.status(200).json({ success: true, message: 'Token renovado' });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en Auth Refresh');
      throw new AppError('No se pudo renovar la sesión', 403);
    }
  }
}
