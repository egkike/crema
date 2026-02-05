import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { validatePartialUser, validatePasswordDetailed } from '../schemas/users';
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

    // AJUSTE: Aplicar Pepper antes de comparar
    const isValidPassword = await bcrypt.compare(password + config.passwordPepper, user.password);

    if (!isValidPassword) {
      logger.warn({ identifier }, 'Intento de login: Password incorrecto');
      throw new AppError('Credenciales inválidas', 401);
    }

    // AJUSTE: Verificación de estado de cuenta (Pilar 1)
    if (user.active === 0) {
      throw new AppError('Cuenta no verificada o inactiva. Revisa tu email.', 403);
    }

    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };

    if (user.must_change_password) {
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
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) {
      await userRepository.deleteSpecificRefreshToken(refreshToken);
    }

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

      const tokenData = await userRepository.findRefreshToken(refreshToken);
      if (!tokenData) {
        throw new AppError('Token inválido o expirado', 403);
      }

      const decoded = verifyRefreshToken(refreshToken) as any;

      const newAccessToken = generateAccessToken({
        id: decoded.id,
        username: decoded.username,
        email: decoded.email,
        fullname: decoded.fullname,
        level: decoded.level,
      });

      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 15 * 60 * 1000,
      });

      return res.status(200).json({ success: true, message: 'Token renovado' });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en Auth Refresh');
      throw new AppError('No se pudo renovar la sesión', 403);
    }
  }

  async changePasswordFirstLogin(req: Request, res: Response) {
    const { password } = req.body;
    const user = (req as any).user;

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) {
      throw new AppError(pwdCheck.errors.join('; '), 400);
    }

    // AJUSTE: Aplicar Pepper y Salt 12 para consistencia de seguridad
    const passwordWithPepper = password + config.passwordPepper;
    const passwordHash = await bcrypt.hash(passwordWithPepper, 12);

    const success = await userRepository.updatePasswordAndClearFlag(user.id, passwordHash);

    if (!success) throw new AppError('No se pudo actualizar la contraseña', 500);

    const cookieOptions = {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict' as const,
      path: '/',
    };
    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada. Ahora puedes iniciar sesión normalmente.',
    });
  }
}
