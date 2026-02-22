import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

import { validatePartialUser, validatePasswordDetailed } from '../schemas/users.schema';
import { CaptchaService } from '../services/captcha.service';
import { userRepository } from '../repositories/user.repository';
import { EmailService } from '../services/email.service';
import { UserService } from '../services/user.service';
import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class UserController {
  getSession(req: Request, res: Response) {
    return res.status(200).json({
      success: true,
      user: req.user,
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

    // 1. Validar Captcha en registro manual
    if (config.nodeEnv === 'production') {
      if (!config.recaptchaSecretKey) {
        throw new AppError('Configuración de seguridad faltante en producción', 500);
      }
      const isHuman = await CaptchaService.verifyToken(captchaToken);
      if (!isHuman) throw new AppError('Fallo en la validación de seguridad', 403);
    }

    const validation = validatePartialUser(userData);
    if (!validation.success) {
      const errorMsg = JSON.parse(validation.error.message)[0]?.message;
      throw new AppError(errorMsg || 'Datos inválidos', 400);
    }

    const { password, email, fullname, level, username } = validation.data;
    if (!password) throw new AppError('La contraseña es requerida', 400);

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) {
      throw new AppError(pwdCheck.errors?.join('; ') || 'Contraseña inválida', 400);
    }

    // 1. Crear usuario (active = 0 + token)
    const newUser = await userRepository.createUser({
      username,
      password: password!,
      email: email!,
      fullname: fullname!,
      level: level || 1,
    });

    // 2. Enviar email de verificación
    EmailService.sendVerificationEmail(
      newUser.email,
      newUser.fullname,
      newUser.verificationToken
    ).catch(err => logger.error('Error enviando email: ' + err.message));

    // Quitamos password y token de la respuesta pública
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, verificationToken: __, ...publicUser } = newUser;

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
    const { id, ...dataToValidate } = req.body;
    if (!id) throw new AppError('ID requerido', 400);

    const validation = validatePartialUser(dataToValidate);

    if (!validation.success) {
      const firstError = validation.error.issues[0].message;
      throw new AppError(firstError || 'Datos inválidos', 400);
    }

    // Esto crea un objeto limpio que solo contiene las llaves enviadas por el usuario
    const updateData = Object.fromEntries(
      Object.entries(validation.data).filter(([_, value]) => value !== undefined)
    );

    const updated = await userRepository.updUser({
      id,
      input: updateData,
    });

    if (!updated) throw new AppError('Usuario no encontrado', 404);

    return res.status(200).json({ success: true, user: updated });
  }

  /**
   * EL ADMIN resetea la contraseña de un tercero (NO requiere clave anterior)
   * RUTA: PATCH /api/user/chgpass-admin
   */
  async chgPassUser(req: Request, res: Response) {
    const { id, password } = req.body; // Solo recibimos el ID del objetivo y la nueva pass

    if (!id || !password) {
      throw new AppError('ID de usuario y nueva contraseña son requeridos', 400);
    }

    const user = await userRepository.getById(id);
    if (!user) throw new AppError('El usuario que intentas modificar no existe', 404);

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) throw new AppError('La nueva contraseña no cumple los requisitos', 400);

    // Actualizamos
    await userRepository.chgPassUser({ id, input: { password } });

    logger.info(
      { adminId: req.user?.id, targetUserId: id }, // Acceso seguro
      'Admin reseteó contraseña de usuario'
    );

    return res.status(200).json({
      success: true,
      message: 'Contraseña reseteada exitosamente por el administrador.',
    });
  }

  async deleteUser(req: Request, res: Response) {
    const { id } = req.body;
    if (!id) throw new AppError('ID requerido', 400);

    const success = await userRepository.deleteUser(id);
    if (!success) throw new AppError('Usuario no encontrado', 404);

    return res.status(200).json({ success: true, message: 'Usuario eliminado' });
  }

  /**
   * EL USUARIO cambia su propia contraseña (requiere validar la anterior)
   * RUTA: PATCH /api/profile/change-password
   */
  async changeMyPassword(req: Request, res: Response) {
    const { oldPassword, password } = req.body;
    const { user: reqUser } = req;

    // Si reqUser es undefined, lanzamos error antes de usarlo
    if (!reqUser) {
      throw new AppError('Usuario no identificado', 401);
    }

    if (!password || !oldPassword) {
      throw new AppError('Contraseña actual y nueva son requeridas', 400);
    }

    const user = await userRepository.findByCredentials(reqUser.email);
    if (!user) throw new AppError('Usuario no encontrado', 404);

    const isOldValid = await bcrypt.compare(oldPassword + config.passwordPepper, user.password);
    if (!isOldValid) throw new AppError('La contraseña actual es incorrecta', 401);

    const pwdCheck = validatePasswordDetailed(password);
    if (!pwdCheck.valid) throw new AppError(pwdCheck.errors.join('; '), 400);

    await userRepository.chgPassUser({ id: user.id, input: { password } });

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return res.status(200).json({
      success: true,
      message: 'Contraseña actualizada. Inicia sesión con tus nuevas credenciales.',
    });
  }

  /**
   * Procesa el Upgrade de nivel (1 -> 2 o 1 -> 3)
   * Requiere que el usuario esté logueado y envíe datos de cobro
   */
  async upgradeMyLevel(req: Request, res: Response) {
    const { targetLevel, payoutData } = req.body;
    const { user: reqUser } = req;

    // 1. Salvaguarda de autenticación
    if (!reqUser) {
      throw new AppError('Usuario no identificado', 401);
    }

    // 2. Validaciones básicas de entrada
    if (!targetLevel) throw new AppError('Nivel destino requerido', 400);

    // Seguridad: El usuario no puede subir a niveles administrativos por esta vía
    if (targetLevel >= 10) {
      throw new AppError('Nivel destino no permitido a través de este proceso.', 403);
    }

    // 3. Llamada al servicio de negocio
    // Este servicio se encarga de: validar moneda, guardar payout_method,
    // subir nivel y asignar plan si es creador.
    const updatedUser = await UserService.upgradeLevel(reqUser.id, Number(targetLevel), payoutData);

    // 4. Notificación de seguridad (Opcional pero recomendado)
    // Podrías disparar un email avisando que el nivel de cuenta cambió
    EmailService.sendSecurityNotification(
      updatedUser!.email,
      `Tu cuenta ha sido actualizada al nivel: ${targetLevel}`
    ).catch(err => logger.error('Error email upgrade: ' + err.message));

    // Importante: El frontend deberá forzar un refresh del token o sesión
    // para que el nuevo nivel se refleje en el req.user de las siguientes peticiones.
    return res.status(200).json({
      success: true,
      message: `¡Felicidades! Ahora eres nivel ${targetLevel}.`,
      user: updatedUser,
    });
  }
}
