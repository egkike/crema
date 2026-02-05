import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { OrderService } from '../services/order.service';
import { CaptchaService } from '../services/captcha.service';
import logger from '../utils/logger';

const mpClient = new MercadoPagoConfig({ accessToken: config.mercadoPago.accessToken });

export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const loggedUser = (req as any).user;
    let buyerId: string;
    let buyerEmail: string;
    let tempPassword: string | undefined = undefined;

    if (loggedUser) {
      buyerId = loggedUser.id;
      buyerEmail = loggedUser.email;
    } else {
      const { email, fullname, captchaToken } = req.body; // <--- Pedimos el token

      // 1. Validar Captcha para evitar bots en el checkout
      if (config.nodeEnv === 'production') {
        if (!config.recaptchaSecretKey) {
          // Si es producción y NO hay clave, lanzamos error porque es un fallo de configuración crítico
          throw new AppError('Configuración de seguridad faltante en producción', 500);
        }
        const isHuman = await CaptchaService.verifyToken(captchaToken);
        if (!isHuman) throw new AppError('Validación de seguridad fallida', 403);
      }

      if (!email || !fullname) throw new AppError('Datos incompletos', 400);

      const existingUser = await userRepository.findByCredentials(email);
      if (!existingUser) {
        tempPassword = crypto.randomBytes(8).toString('hex');
        const newUser = await userRepository.createUser({
          username: email.split('@')[0] + crypto.randomInt(100, 999),
          email,
          fullname,
          password: tempPassword,
          level: 1,
        });
        buyerId = newUser.id;
        buyerEmail = newUser.email;
        logger.info({ email: buyerEmail }, 'Silent Registration: Usuario creado');
      } else {
        buyerId = existingUser.id;
        buyerEmail = existingUser.email;
      }
    }

    // ... (Resto de la lógica de MP que ya funciona perfectamente)
    const { productId, currency = 'ARS', quantity = 1, gateway } = req.body;
    const product = await productRepository.getProductById(productId);
    if (!product || product.status !== 'published')
      throw new AppError('Producto no disponible', 404);

    const officialPrice = await productRepository.getPriceByCurrency(productId, currency);
    if (!officialPrice) throw new AppError(`Precio no definido para ${currency}`, 400);

    const externalReference = `ORD-${buyerId}-${Date.now()}`;

    if (gateway === 'mercadopago' && currency === 'ARS') {
      const preferenceClient = new Preference(mpClient);
      await orderRepository.create({
        buyerId,
        productId: product.id,
        amount: officialPrice * quantity,
        currency,
        paymentMethod: 'mercadopago',
        externalReference,
        status: 'pending',
      });

      const mpResponse = await preferenceClient.create({
        body: {
          items: [
            {
              id: product.id,
              title: product.title,
              quantity: Number(quantity),
              currency_id: 'ARS',
              unit_price: Number(officialPrice),
            },
          ],
          payer: { email: buyerEmail },
          notification_url: `${config.apiBaseUrl}/payments/webhook`,
          external_reference: externalReference,
          metadata: { temp_password: tempPassword }, // <--- Esto es oro para el OrderService
          auto_return: 'approved',
        },
      });

      return res.status(201).json({ success: true, data: { init_point: mpResponse.init_point } });
    }
    throw new AppError(`Método ${gateway} no habilitado`, 400);
  } catch (err) {
    next(err);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  res.status(200).send('OK');
  try {
    const { type, data } = req.body;
    const paymentId = data?.id || req.query.id;
    if (type === 'payment' && paymentId) {
      await OrderService.handlePaymentWebhook(String(paymentId));
    }
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error Webhook');
  }
};
