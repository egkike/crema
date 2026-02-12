import nodemailer from 'nodemailer';

import { config } from '../config/index';
import logger from '../utils/logger';

let transporter: any;

// >>> Inicialización segura del transporte <<<
try {
  if (process.env.NODE_ENV !== 'test') {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: Number(config.smtp.port),
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      // Optimización para evitar timeouts en conexiones lentas
      connectionTimeout: 10000,
    });
  } else {
    transporter = { sendMail: async () => ({ messageId: 'test-id' }) };
  }
} catch {
  logger.error('❌ Error crítico inicializando el transporte de Email');
}

export class EmailService {
  private static async send(to: string, subject: string, html: string) {
    try {
      const info = await transporter.sendMail({
        from: `"Crema" <${config.smtp.from}>`, // Nombre personalizado en la bandeja
        to,
        subject,
        html,
      });
      logger.info({ messageId: info.messageId, to }, '📧 Email enviado correctamente');
      return true;
    } catch (error: any) {
      logger.error({ error: error.message }, '❌ Error en el transporte de email');
      return false;
    }
  }

  // >>> Notificación de Dinero Disponible (Release) <<<
  static async sendBalanceReleasedEmail(
    email: string,
    fullname: string,
    amount: number,
    currency: string
  ) {
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 30px; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <span style="font-size: 40px;">💰</span>
        </div>
        <h2 style="color: #2ed573; text-align: center;">¡Saldo disponible!</h2>
        <p>Hola <strong>${fullname}</strong>,</p>
        <p>Te informamos que el periodo de garantía ha finalizado y hemos liberado fondos en tu cuenta.</p>
        <div style="background: #f1f2f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #2f3542;">${amount} ${currency}</span>
        </div>
        <p>Ya puedes solicitar el retiro de este saldo desde tu panel de control.</p>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${config.frontendUrl}/dashboard/withdraw" style="background: #2f3542; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold;">Retirar mi saldo</a>
        </div>
      </div>
    `;
    return this.send(email, `¡Saldo liberado! ${amount} ${currency} disponibles`, html);
  }

  static async sendVerificationEmail(email: string, fullname: string, token: string) {
    // CORRECCIÓN: Usamos config.frontendUrl que acabamos de ver en tu index.ts
    const verificationLink = `${config.frontendUrl}/verify-account?token=${token}`;

    const html = `
      <h1>Bienvenido a Crema</h1>
      <p>Hola ${fullname}, verifica tu cuenta aquí:</p>
      <a href="${verificationLink}">Activar mi cuenta</a>
    `;
    return this.send(email, 'Verifica tu cuenta', html);
  }

  /**
   * Envío de bienvenida para COMPRADORES (creados durante el checkout)
   */
  static async sendWelcomePurchaseEmail(
    email: string,
    fullname: string,
    tempPassword: string,
    productTitle: string
  ) {
    const loginLink = `${config.frontendUrl}/login`;

    const html = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e8ed; border-radius: 12px; overflow: hidden;">
        <div style="background: #ff4757; padding: 30px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">¡Excelente elección!</h1>
          <p style="margin: 5px 0 0;">Tu acceso a ${productTitle} está listo</p>
        </div>
        <div style="padding: 30px; color: #2f3542; line-height: 1.6;">
          <p>Hola <strong>${fullname}</strong>,</p>
          <p>Gracias por tu compra. Hemos creado una cuenta para ti para que puedas acceder a tu contenido de inmediato.</p>
          
          <div style="background: #f1f2f6; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px dashed #ced6e0;">
            <p style="margin: 0 0 10px;"><strong>Tus credenciales de acceso:</strong></p>
            <p style="margin: 5px 0;">📧 <strong>Email:</strong> ${email}</p>
            <p style="margin: 5px 0;">🔑 <strong>Contraseña temporal:</strong> <span style="background: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #dfe4ea;">${tempPassword}</span></p>
          </div>

          <div style="text-align: center; margin-top: 30px;">
            <a href="${loginLink}" style="background: #ff4757; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(255, 71, 87, 0.2);">
              Entrar a mi panel de estudios
            </a>
          </div>
          <p style="font-size: 13px; color: #747d8c; margin-top: 30px; text-align: center;">
            Por seguridad, te recomendamos cambiar tu contraseña al ingresar por primera vez.
          </p>
        </div>
      </div>
    `;
    return this.send(email, `🎉 Acceso confirmado: ${productTitle}`, html);
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
    destination: string,
    transactionReceipt: string
  ) {
    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
      <h2 style="color: #2ed573;">¡Retiro Completado! 💸</h2>
      <p>Hola <strong>${fullname}</strong>,</p>
      <p>Te informamos que tu solicitud de retiro ha sido procesada exitosamente.</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Monto:</strong> ${amount} ${currency}</p>
        <p><strong>Destino:</strong> ${destination}</p>
        <p><strong>Comprobante de operación:</strong> ${transactionReceipt}</p>
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

  /**
   * Envío de bienvenida para SOCIOS (Afiliados/Creadores registrados manualmente)
   */
  static async sendPartnerWelcomeEmail(
    email: string,
    fullname: string,
    level: number,
    token: string
  ) {
    const roleName = level === 3 ? 'Creador' : 'Afiliado';
    const activationLink = `${config.frontendUrl}/verify-account?token=${token}`;

    const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e1e8ed; border-radius: 12px;">
      <div style="padding: 40px 30px; text-align: center;">
        <h1 style="color: #2f3542; margin: 0;">¡Hola ${fullname}!</h1>
        <p style="color: #57606f; font-size: 18px;">Bienvenido al ecosistema de <strong>Crema</strong>.</p>
        
        <div style="margin: 30px 0; padding: 25px; border: 2px solid #ffcc00; border-radius: 12px; background-color: #fffaf0;">
          <h3 style="color: #a38100; margin-top: 0;">🚀 Estás a un paso de comenzar</h3>
          <p style="color: #4b4b4b;">Te has registrado como <strong>${roleName}</strong>. Para empezar a generar ingresos, necesitamos que confirmes tu correo.</p>
          <a href="${activationLink}" style="background: #ffcc00; color: #212529; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; margin-top: 10px;">
            Confirmar y Activar Cuenta
          </a>
        </div>
        
        <p style="font-size: 14px; color: #a4b0be;">
          Si no puedes hacer clic en el botón, copia y pega este link: <br>
          <small>${activationLink}</small>
        </p>
      </div>
    </div>
  `;
    return this.send(email, `👉 Activa tu cuenta de ${roleName} en Crema`, html);
  }

  static async sendResetPasswordEmail(email: string, fullname: string, token: string) {
    const resetLink = `${config.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
        <h2 style="color: #2f3542;">Recuperar contraseña</h2>
        <p>Hola <strong>${fullname}</strong>,</p>
        <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en Crema.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #ff4757; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
        </div>
        <p style="font-size: 12px; color: #777;">Este enlace expirará en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `;
    return this.send(email, 'Restablecer tu contraseña - Crema', html);
  }
}
