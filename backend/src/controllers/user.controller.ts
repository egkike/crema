import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

import { validatePartialUser, validatePasswordDetailed } from '../schemas/users';
import { CaptchaService } from '../services/captcha.service';
import { userRepository } from '../repositories/user.repository';
import { EmailService } from '../services/email.service';
import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class UserController {
  getSession(req: Request, res: Response) {
    return res.status(200).json({
      success: true,
      user: (req as any).user,
    });
  }

  async getUsers(_req: Request, res: Response) {
    const users = await userRepository.getUsers();
    return res.status(200).json({ success: true, users });
  }

  async getById(req: Request, res: Response) {
    const { id } = req.body;
    if (!id) throw new AppError('ID requerido', 400);

    const user = await userRepository.getById(id);
    if (!user) throw new AppError('Usuario no encontrado', 404);

    return res.status(200).json({ success: true, user });
  }

  async createUser(req: Request, res: Response) {
    const { captchaToken, ...userData } = req.body;

    // 1. Validar Captcha (Solo si no estamos en entorno de test/dev local muy cerrado)
    if (config.nodeEnv !== 'test') {
      const isHuman = await CaptchaService.verifyToken(captchaToken);
      if (!isHuman) {
        throw new AppError('Fallo en la validación de seguridad (reCAPTCHA)', 403);
      }
    }

    const validation = validatePartialUser(userData);
    if (!validation.success) {
      const errorMsg = JSON.parse(validation.error.message)[0]?.message;
      throw new AppError(errorMsg || 'Datos inválidos', 400);
    }

    const { username, password, email, fullname } = validation.data;
    if (!password) throw new AppError('La contraseña es requerida', 400);

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) {
      throw new AppError(pwdCheck.errors?.join('; ') || 'Contraseña inválida', 400);
    }

    // 1. Crear usuario (active = 0 + token)
    const newUser = await userRepository.createUser({
      username: username!,
      password: password!,
      email: email!,
      fullname: fullname!,
    });

    // 2. Enviar email de verificación
    EmailService.sendVerificationEmail(
      newUser.email,
      newUser.fullname,
      newUser.verificationToken
    ).catch(err => logger.error('Error enviando email: ' + err.message));

    // Quitamos password y token de la respuesta pública
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, verificationToken: __, ...publicUser } = newUser as any;

    return res.status(201).json({
      success: true,
      message: 'Usuario registrado. Por favor verifica tu email para activar la cuenta.',
      user: publicUser,
    });
  }

  async verifyEmail(req: Request, res: Response) {
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
  }

  async updUser(req: Request, res: Response) {
    const { id, fullname, level, active } = req.body;
    if (!id) throw new AppError('ID requerido', 400);

    const validation = validatePartialUser({ fullname, level, active });
    if (!validation.success) {
      const errorMsg = JSON.parse(validation.error.message)[0]?.message;
      throw new AppError(errorMsg || 'Datos inválidos', 400);
    }

    const updated = await userRepository.updUser({ id, input: validation.data });
    if (!updated) throw new AppError('Usuario no encontrado', 404);

    return res.status(200).json({ success: true, user: updated });
  }

  async chgPassUser(req: Request, res: Response) {
    const { id, oldPassword, password } = req.body;
    const reqUser = (req as any).user;

    if (!id || !password || !oldPassword) {
      throw new AppError('Faltan datos requeridos', 400);
    }

    const identifier = reqUser?.username || id;
    const user = await userRepository.findByCredentials(identifier);
    if (!user) throw new AppError('Usuario no encontrado', 404);

    // Comparar usando Pepper para mantener consistencia
    const isOldValid = await bcrypt.compare(oldPassword + config.passwordPepper, user.password);
    if (!isOldValid) throw new AppError('Contraseña actual incorrecta', 401);

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) throw new AppError('Nueva contraseña débil', 400);

    await userRepository.chgPassUser({ id, input: { password } });

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada correctamente.',
    });
  }

  async deleteUser(req: Request, res: Response) {
    const { id } = req.body;
    if (!id) throw new AppError('ID requerido', 400);

    const success = await userRepository.deleteUser(id);
    if (!success) throw new AppError('Usuario no encontrado', 404);

    return res.status(200).json({ success: true, message: 'Usuario eliminado' });
  }
}
