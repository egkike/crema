import crypto from 'crypto';

import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';

import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export class TwoFactorService {
  /**
   * Genera un nuevo secreto TOTP y códigos de respaldo
   */
  static generateSetup(userEmail: string) {
    const secret = generateSecret();
    const otpauth = generateURI({
      secret,
      label: userEmail,
      issuer: 'Crema',
      digits: 6,
      algorithm: 'SHA1',
      period: 30,
    });

    // Generar 10 códigos de respaldo de 8 caracteres
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(
        crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 8)
      );
    }

    return { secret, otpauth, backupCodes };
  }

  /**
   * Genera el código QR para la configuración
   */
  static async generateQRCode(otpauth: string): Promise<string> {
    try {
      return await QRCode.toDataURL(otpauth);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Error generando código QR');
      throw new AppError('No se pudo generar el código QR', 500);
    }
  }

  /**
   * Verifica si un código TOTP es válido para un secreto dado
   */
  static verifyToken(token: string, secret: string): boolean {
    try {
      return verifySync({ token, secret });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ error: message }, 'Error verificando token TOTP');
      return false;
    }
  }
}
