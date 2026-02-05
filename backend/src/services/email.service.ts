import nodemailer from 'nodemailer';

import { config } from '../config/index';
import logger from '../utils/logger';

// Configuramos el transporte una sola vez
const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass,
  },
});

export class EmailService {
  private static async send(to: string, subject: string, html: string) {
    try {
      const info = await transporter.sendMail({
        from: config.smtp.from,
        to,
        subject,
        html,
      });
      logger.info({ messageId: info.messageId, to }, '📧 Email capturado en Mailtrap');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error en el transporte de email');
      return false;
    }
  }

  static async sendVerificationEmail(email: string, fullname: string, token: string) {
    const verificationLink = `${config.appUrl}/verify-email?token=${token}`;

    const html = `
      <h1>Bienvenido a Crema</h1>
      <p>Hola ${fullname}, verifica tu cuenta aquí:</p>
      <a href="${verificationLink}">Activar mi cuenta</a>
    `;

    return this.send(email, 'Verifica tu cuenta', html);
  }
}
