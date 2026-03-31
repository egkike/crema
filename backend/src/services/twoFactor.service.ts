import crypto from 'crypto';

import { Authenticator } from 'otplib';
import QRCode from 'qrcode';

import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

const authenticator = new Authenticator();

export class TwoFactorService {
  /**
   * Genera un nuevo secreto TOTP y códigos de respaldo
   */
  static generateSetup(userEmail: string) {
    const secret = authenticator.generateSecret();
    const serviceName = 'Crema Platform';

    // Genera la URI para el QR (Compatible con Google Authenticator, Authy, etc)
    const otpauth = authenticator.keyuri(userEmail, serviceName, secret);

    // Generamos 10 códigos de respaldo aleatorios de 8 caracteres
    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    return { secret, otpauth, backupCodes };
  }

  /**
   * Convierte la URI de OTP en una imagen QR Base64 para el frontend
   */
  static async generateQRCode(otpauth: string): Promise<string> {
    try {
      return await QRCode.toDataURL(otpauth);
    } catch (error: unknown) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error generando código QR');
      throw new AppError('No se pudo generar el código QR', 500);
    }
  }

  /**
   * Verifica si un código TOTP es válido para un secreto dado
   */
  static verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error: unknown) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'Error verificando token TOTP');
      return false;
    }
  }

  /**
   * Verifica un código de respaldo y devuelve los códigos restantes
   */
  static verifyBackupCode(
    code: string,
    codes: string[]
  ): { valid: boolean; remainingCodes: string[] } {
    const index = codes.indexOf(code.toUpperCase());

    if (index === -1) {
      return { valid: false, remainingCodes: codes };
    }

    // El código es válido, lo eliminamos (son de un solo uso)
    const remainingCodes = [...codes];
    remainingCodes.splice(index, 1);

    return { valid: true, remainingCodes };
  }
}
