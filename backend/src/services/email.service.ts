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

  static async sendPayoutMethodChangeEmail(
    email: string,
    fullname: string,
    currency: string,
    confirmLink: string
  ) {
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #2f3542;">Confirmar datos de cobro</h2>
      <p>Hola <strong>${fullname}</strong>,</p>
      <p>Recibimos una solicitud para actualizar tu cuenta de retiro para <strong>${currency}</strong>.</p>
      <p style="background: #fff3cd; padding: 15px; border-left: 5px solid #ffcc00; font-size: 14px;">
        ⚠️ <strong>Si no solicitaste este cambio, ignora este mensaje y cambia tu contraseña de inmediato.</strong>
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${confirmLink}" style="background: #2ed573; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Confirmar Cambio</a>
      </div>
      <p style="font-size: 12px; color: #777;">Este link expirará en 15 minutos.</p>
    </div>
  `;
    return this.send(email, `Confirmar cuenta de retiro ${currency} - Crema`, html);
  }

  static async sendPayoutCompletedEmail(
    email: string,
    fullname: string,
    amount: number,
    currency: string,
    destination: string
  ) {
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #2ed573;">¡Retiro Completado! 💸</h2>
      <p>Hola <strong>${fullname}</strong>,</p>
      <p>Te informamos que tu solicitud de retiro ha sido procesada exitosamente.</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Monto:</strong> ${amount} ${currency}</p>
        <p><strong>Destino:</strong> ${destination}</p>
      </div>
      <p>El dinero debería verse reflejado en tu cuenta en breve, dependiendo de los tiempos de procesamiento de tu banco o red.</p>
      <p>¡Gracias por confiar en Crema!</p>
    </div>
  `;
    return this.send(email, `Tu retiro de ${amount} ${currency} ha sido enviado`, html);
  }

  static async sendSecurityAlert(to: string, subject: string, message: string) {
    const html = `
      <div style="font-family: sans-serif; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #d9534f;">Aviso de Crema</h2>
        <p>${message}</p>
        <p style="font-size: 12px; color: #777; margin-top: 20px;">
          Si no reconoces esta actividad, por favor contacta a soporte técnico de inmediato.
        </p>
      </div>
    `;
    return this.send(to, subject, html);
  }
}
