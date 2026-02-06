import nodemailer from 'nodemailer';

import { config } from '../config/index';
import logger from '../utils/logger';

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
      logger.info({ messageId: info.messageId, to }, '📧 Email enviado correctamente');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error en el transporte de email');
      return false; // Retornamos false pero no lanzamos error para no bloquear la compra
    }
  }

  static async sendVerificationEmail(email: string, fullname: string, token: string) {
    // CORRECCIÓN: Usamos config.frontendUrl que acabamos de ver en tu index.ts
    const verificationLink = `${config.frontendUrl}/verify-email?token=${token}`;

    const html = `
      <h1>Bienvenido a Crema</h1>
      <p>Hola ${fullname}, verifica tu cuenta aquí:</p>
      <a href="${verificationLink}">Activar mi cuenta</a>
    `;
    return this.send(email, 'Verifica tu cuenta', html);
  }

  static async sendWelcomePurchaseEmail(
    email: string,
    fullname: string,
    tempPassword: string,
    productTitle: string
  ) {
    const loginLink = `${config.frontendUrl}/login`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
        <h1>¡Gracias por tu compra en Crema!</h1>
        <p>Hola <strong>${fullname}</strong>,</p>
        <p>Tu pago por el producto <strong>${productTitle}</strong> ha sido procesado con éxito.</p>
        <div style="background: #f4f4f4; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Usuario:</strong> ${email}</p>
          <p><strong>Contraseña temporal:</strong> <code>${tempPassword}</code></p>
        </div>
        <a href="${loginLink}" style="display: inline-block; background: #ff4757; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">Acceder a mi contenido</a>
      </div>
    `;
    return this.send(email, `¡Bienvenido! Tus accesos a ${productTitle}`, html);
  }

  static async sendPurchaseConfirmationEmail(
    email: string,
    fullname: string,
    productTitle: string
  ) {
    const html = `
      <h1>Nueva compra realizada</h1>
      <p>Hola ${fullname}, ya puedes acceder a <strong>${productTitle}</strong>.</p>
      <a href="${config.frontendUrl}/login">Ir a mis productos</a>
    `;
    return this.send(email, `Tu acceso a ${productTitle}`, html);
  }
}
