import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { UAParser } from 'ua-parser-js';

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  cleanPayload,
} from '../utils/jwt.util';
import { validatePasswordDetailed } from '../schemas/users.schema';
import logger from '../utils/logger';
import { config } from '../config/index';
import { userRepository, type UserWithPassword } from '../repositories/user.repository';
import { EmailService } from '../services/email.service';
import { AppError } from '../errors/AppError';
import { AuthService } from '../services/auth.service';
import { TwoFactorService } from '../services/twoFactor.service';

export class AuthController {
  /**
   * Registro manual exclusivo para Socios
   */
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      // Eliminamos username de la desestructuración
      const { email, password, fullname, level, captchaToken } = req.body;

      const result = await AuthService.registerPartner(
        { email, password, fullname, level }, // Pasamos solo lo necesario
        captchaToken
      );

      res.status(201).json({
        success: true,
        message: 'Registro exitoso. Revisa tu email para activar tu cuenta.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, email, password } = req.body;

      // Si el frontend ya no envía username, el identifier será el email
      const identifier = email || username;

      const user = await userRepository.findByCredentials(identifier);

      if (!user) {
        logger.warn({ identifier }, 'Intento de login: Usuario no encontrado');
        throw new AppError('Credenciales inválidas', 401);
      }

      const isValidPassword = await bcrypt.compare(password + config.passwordPepper, user.password);

      if (!isValidPassword) {
        logger.warn({ identifier }, 'Intento de login: Password incorrecto');
        throw new AppError('Credenciales inválidas', 401);
      }

      if (user.active === 0) {
        throw new AppError('Cuenta no verificada o inactiva. Revisa tu email.', 403);
      }

      const sameSiteValue = config.nodeEnv === 'production' ? 'strict' : 'lax';

      const cookieOptions = {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: sameSiteValue as 'strict' | 'lax',
        path: '/',
      };

      // --- LOGICA DE METADATOS PARA SESIÓN ---
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ip =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '0.0.0.0';
      const deviceType = userAgent.includes('Mobi') ? 'Mobile' : 'Desktop';

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

      if (user.two_factor_enabled) {
        const mfaToken = generateAccessToken({
          id: user.id,
          username: user.username,
          partial: true, // Reutilizamos tu lógica de acceso restringido
        } as any);

        res.cookie('access_token', mfaToken, cookieOptions);

        return res.status(200).json({
          success: true,
          requires2FA: true,
          message: 'Se requiere código de verificación (2FA)',
        });
      }

      const payload = cleanPayload({
        id: user.id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
        level: user.level,
        active: user.active,
      });

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // Usamos los tiempos centralizados en config
      await userRepository.saveRefreshToken(
        user.id,
        refreshToken,
        new Date(Date.now() + config.jwt.refreshTokenMaxAge),
        { userAgent, ip, deviceType }
      );

      // --- Registro de Log ---
      await userRepository.addActivityLog(user.id, 'LOGIN_SUCCESS', { ip, userAgent });

      res.cookie('access_token', accessToken, {
        ...cookieOptions,
        maxAge: config.jwt.accessTokenMaxAge,
      });

      res.cookie('refresh_token', refreshToken, {
        ...cookieOptions,
        maxAge: config.jwt.refreshTokenMaxAge,
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...publicUser } = user as UserWithPassword;
      return res.status(200).json({ success: true, user: publicUser });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
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
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
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
      const cleanData = cleanPayload(decoded); // <--- Limpia iat y exp

      const newAccessToken = generateAccessToken(cleanData);

      res.cookie('access_token', newAccessToken, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
        path: '/',
        maxAge: config.jwt.accessTokenMaxAge,
      });

      return res.status(200).json({ success: true, message: 'Token renovado' });
    } catch (error: any) {
      next(error);
    }
  }

  async changePasswordFirstLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { password } = req.body;
      const user = req.user;
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ip =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '0.0.0.0';

      if (!user) {
        throw new AppError('Usuario requerido', 400);
      }

      const pwdCheck = validatePasswordDetailed(password);
      if (!pwdCheck.valid) {
        throw new AppError(pwdCheck.errors.join('; '), 400);
      }

      const passwordWithPepper = password + config.passwordPepper;
      const passwordHash = await bcrypt.hash(passwordWithPepper, 12);

      const success = await userRepository.updatePasswordAndClearFlag(user.id, passwordHash);

      if (!success) throw new AppError('No se pudo actualizar la contraseña', 500);

      // --- Registro de Log ---
      await userRepository.addActivityLog(user.id, 'PASSWORD_CHANGE_FIRST_LOGIN', {
        ip,
        userAgent,
      });

      EmailService.sendSecurityNotification(
        user.email,
        'Tu contraseña ha sido actualizada exitosamente tras tu primer inicio de sesión.'
      ).catch(err => logger.error({ err: err.message }, 'Error enviando email de seguridad'));

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
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.query;
      if (!token) throw new AppError('Token de verificación requerido', 400);

      const success = await userRepository.verifyAccount(token as string);
      if (!success) {
        throw new AppError('Token inválido o expirado. Solicita uno nuevo.', 400);
      }

      return res.status(200).json({
        success: true,
        message: 'Cuenta activada correctamente. Ya puedes iniciar sesión.',
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      const user = await userRepository.findByCredentials(email);

      // Estrategia de seguridad: No confirmamos si el email existe o no
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 3600000); // 1 hora de validez

        await userRepository.saveResetToken(email, token, expires);

        // No bloqueamos la respuesta esperando al email
        EmailService.sendResetPasswordEmail(email, user.fullname, token).catch(err =>
          logger.error({ err: err.message, email }, 'Error enviando reset password email')
        );
      }

      res.json({
        success: true,
        message: 'Si el email está registrado, recibirás un enlace para restablecer tu contraseña.',
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, password } = req.body;

      const pwdCheck = validatePasswordDetailed(password);
      if (!pwdCheck.valid) {
        throw new AppError(pwdCheck.errors.join('; '), 400);
      }

      // Aplicamos Pepper + Hash
      const passwordWithPepper = password + config.passwordPepper;
      const hash = await bcrypt.hash(passwordWithPepper, 12);

      const success = await userRepository.resetPasswordByToken(token, hash);

      if (!success) {
        throw new AppError('El enlace es inválido o ha expirado.', 400);
      }

      res.json({
        success: true,
        message: 'Tu contraseña ha sido actualizada. Ya puedes iniciar sesión.',
      });
    } catch (error) {
      next(error);
    }
  }

  async setup2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const userReq = req.user;

      if (!userReq) throw new AppError('Usuario requerido', 400);

      // Opcional: Bloquear si ya está activo
      const user = (await userRepository.getById(userReq.id)) as any;
      if (user?.two_factor_enabled) {
        throw new AppError('El 2FA ya está activado en esta cuenta', 400);
      }

      const { secret, otpauth, backupCodes } = TwoFactorService.generateSetup(userReq.email);
      await userRepository.update2FASecret(userReq.id, secret, backupCodes);
      const qrCode = await TwoFactorService.generateQRCode(otpauth);

      res.json({
        success: true,
        data: { qrCode, backupCodes },
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyAndEnable2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      const userReq = req.user;
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ip =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '0.0.0.0';

      if (!userReq) throw new AppError('Usuario requerido', 400);

      const user = await userRepository.findByCredentials(userReq.email);

      if (!user?.two_factor_secret) throw new AppError('Configuración no iniciada', 400);

      if (!TwoFactorService.verifyToken(token, user.two_factor_secret)) {
        throw new AppError('Código inválido', 400);
      }

      await userRepository.enable2FA(user.id);

      // --- Registro de Log ---
      await userRepository.addActivityLog(user.id, '2FA_ENABLED', { ip, userAgent });

      EmailService.sendSecurityAlert(
        userReq.email,
        'Doble factor de autenticación activado',
        'Se ha habilitado correctamente la autenticación de dos factores (2FA) en tu cuenta. Esto añade una capa extra de protección.'
      ).catch(err => logger.error({ err: err.message }, 'Error enviando email de seguridad'));

      res.json({ success: true, message: '2FA activado correctamente' });
    } catch (error) {
      next(error);
    }
  }

  async verifyLogin2FA(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.body;
      const userPartial = req.user;

      if (!userPartial) throw new AppError('Usuario requerido', 400);

      // Buscamos al usuario completo para tener el secreto y códigos
      const user = await userRepository.findByCredentials(userPartial.username);

      if (!user || !user.two_factor_secret) {
        throw new AppError('Sesión de verificación inválida o expirada', 401);
      }

      // --- LOGICA DE METADATOS PARA SESIÓN ---
      const userAgent = req.headers['user-agent'] || 'Unknown Device';
      const ip =
        (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '0.0.0.0';
      const deviceType = userAgent.includes('Mobi') ? 'Mobile' : 'Desktop';

      // 1. Validar TOTP o Código de Respaldo
      let isValid = TwoFactorService.verifyToken(token, user.two_factor_secret);

      if (!isValid) {
        const backup = TwoFactorService.verifyBackupCode(token, user.two_factor_backup_codes || []);
        if (backup.valid) {
          await userRepository.update2FASecret(
            user.id,
            user.two_factor_secret,
            backup.remainingCodes
          );
          EmailService.sendSecurityAlert(
            user.email,
            'Código de respaldo 2FA utilizado',
            'Se ha utilizado un código de respaldo para acceder a tu cuenta. Recuerda que estos códigos son de un solo uso.'
          ).catch(err => logger.error({ err: err.message }, 'Error enviando email de seguridad'));
          isValid = true;
        }
      }

      if (!isValid) throw new AppError('Código de verificación incorrecto', 401);

      // --- Registro de Log ---
      await userRepository.addActivityLog(user.id, 'LOGIN_SUCCESS_2FA', { ip, userAgent });

      // 2. Preparar Payload idéntico al login exitoso
      const payload = cleanPayload({
        id: user.id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
        level: user.level,
        active: user.active,
      });

      const accessToken = generateAccessToken(payload);
      const refreshToken = generateRefreshToken(payload);

      // 3. Persistir Refresh Token
      await userRepository.saveRefreshToken(
        user.id,
        refreshToken,
        new Date(Date.now() + config.jwt.refreshTokenMaxAge),
        { userAgent, ip, deviceType }
      );

      // 4. Configurar Cookies
      const sameSiteValue = config.nodeEnv === 'production' ? 'strict' : 'lax';
      const cookieOptions = {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: sameSiteValue as 'strict' | 'lax',
        path: '/',
      };

      res.cookie('access_token', accessToken, {
        ...cookieOptions,
        maxAge: config.jwt.accessTokenMaxAge,
      });

      res.cookie('refresh_token', refreshToken, {
        ...cookieOptions,
        maxAge: config.jwt.refreshTokenMaxAge,
      });

      // Retornar usuario sin password
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password: _, ...publicUser } = user;
      return res.status(200).json({ success: true, user: publicUser });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene el historial de actividad
   */
  async getActivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw new AppError('Usuario requerido', 400);

      const logs = await userRepository.getActivityLogs(user.id);

      const formattedLogs = logs.map(log => {
        const parser = new UAParser(log.user_agent || '');
        const ua = parser.getResult();

        return {
          id: log.id,
          action: log.action,
          ip: log.ip_address,
          browser: `${ua.browser.name || 'Unknown'} on ${ua.os.name || 'Unknown'}`,
          date: log.created_at,
        };
      });

      res.json({ success: true, data: formattedLogs });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene todas las sesiones activas del usuario autenticado
   */
  async getSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw new AppError('Usuario requerido', 400);

      const sessions = await userRepository.getUserSessions(user.id);
      const currentTokenHash = req.cookies.refresh_token;

      const formattedSessions = sessions.map(s => {
        // Inicializamos el parser con el User Agent guardado
        const parser = new UAParser(s.user_agent || '');
        const ua = parser.getResult();

        return {
          id: s.id,
          deviceType: s.device_type, // 'Desktop' o 'Mobile'
          // Formateamos: "Chrome on Windows 10" o "Safari on iOS"
          client: `${ua.browser.name || 'Unknown Browser'} on ${ua.os.name || 'Unknown OS'}`,
          ip: s.ip_address,
          lastActive: s.last_active,
          isCurrent: s.token_hash === currentTokenHash,
        };
      });

      res.json({
        success: true,
        data: formattedSessions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoca (cierra) una sesión específica
   */
  async revokeSession(req: Request, res: Response, next: NextFunction) {
    try {
      const sessionId = req.params.sessionId as string;
      const user = req.user;

      if (!user) throw new AppError('Usuario requerido', 400);

      const success = await userRepository.revokeSessionById(sessionId, user.id);

      if (!success) {
        throw new AppError('No se pudo encontrar o cerrar la sesión', 404);
      }

      res.json({ success: true, message: 'Sesión cerrada correctamente' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Cierra todas las sesiones excepto la actual (Botón de pánico)
   */
  async revokeOtherSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const currentTokenHash = req.cookies.refresh_token;

      if (!user) throw new AppError('Usuario requerido', 400);
      if (!currentTokenHash) throw new AppError('No se encontró la sesión actual', 400);

      const deletedCount = await userRepository.revokeOtherSessions(user.id, currentTokenHash);

      res.json({
        success: true,
        message: `Se han cerrado ${deletedCount} sesiones en otros dispositivos.`,
      });
    } catch (error) {
      next(error);
    }
  }
}
