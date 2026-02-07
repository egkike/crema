import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { OrderService } from '../services/order.service';
import logger from '../utils/logger';

// Instancia de Mercado Pago
const mpClient = new MercadoPagoConfig({
  accessToken: config.mercadoPago.accessToken,
});

export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, currency = 'ARS', quantity = 1, email, fullname } = req.body;

    // 1. Obtener producto y precio
    const product = await productRepository.getProductById(productId);
    const price = await productRepository.getPriceByCurrency(productId, currency);

    if (!product || !price) throw new AppError('Producto no disponible', 404);

    // 2. Lógica de Usuario
    let buyerId = (req as any).user?.id;
    let tempPassword; // Guardamos esto para el email si es usuario nuevo

    if (!buyerId) {
      if (!email) throw new AppError('Email requerido', 400);
      const user = await userRepository.findByCredentials(email);
      if (user) {
        buyerId = user.id;
      } else {
        tempPassword = crypto.randomBytes(10).toString('hex');
        const newUser = await userRepository.createUser({
          username: email.split('@')[0] + crypto.randomInt(100, 999),
          email,
          fullname: fullname || 'Cliente Temporal',
          password: tempPassword,
          level: 1,
        });
        buyerId = newUser.id;
      }
    }

    const externalReference = `ORD-${buyerId}-${Date.now()}`;

    // 3. Crear orden en DB
    await orderRepository.create({
      buyerId,
      productId: product.id,
      amount: Number(price) * Number(quantity),
      currency,
      paymentMethod: 'mercadopago',
      externalReference,
      status: 'pending',
    });

    const preferenceClient = new Preference(mpClient);

    // 4. Crear Preferencia en Mercado Pago (Mantenemos tu estructura intacta)
    const mpResponse = await preferenceClient.create({
      body: {
        items: [
          {
            id: String(product.id),
            title: String(product.title),
            quantity: Number(quantity),
            unit_price: Number(price),
            currency_id: 'ARS',
          },
        ],
        payer: {
          email: String(email).trim(),
        },
        metadata: {
          temp_password: tempPassword, // Pasamos el password al webhook por metadata
        },
        back_urls: {
          success: `${config.frontendUrl}/checkout/success`,
          failure: `${config.frontendUrl}/checkout/error`,
          pending: `${config.frontendUrl}/checkout/pending`,
        },
        // Mantenemos tu auto_return si lo usabas (en tu versión no estaba, pero MP lo agradece)
        external_reference: externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/mercadopago/webhook`,
        statement_descriptor: 'CREMA',
      },
    });

    logger.info(
      { preferenceId: mpResponse.id, ref: externalReference },
      '✅ Preferencia MP creada'
    );

    return res.status(201).json({
      success: true,
      data: {
        init_point: mpResponse.init_point,
      },
    });
  } catch (error: any) {
    logger.error(
      {
        msg: error.message,
        details: error.cause?.errors || error,
      },
      '❌ Error al crear preferencia'
    );
    next(error);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  // 1. SIEMPRE responder 200 inmediatamente a Mercado Pago para que no reintente locamente
  res.status(200).send('OK');

  try {
    const rawId = req.body.data?.id || req.query.id || req.body.id;
    const type = req.body.type || req.query.topic || req.body.action;

    logger.info({ rawId, type }, '🔔 Webhook recibido de Mercado Pago');

    if (type === 'merchant_order') {
      return;
    }

    if (!rawId) return;

    const paymentInstance = new Payment(mpClient);

    try {
      const payment = await paymentInstance.get({ id: String(rawId) });

      // DELEGACIÓN SEGURA AL SERVICE
      // Solo llamamos al service si hay una referencia externa,
      // manteniendo la lógica de protección que ya tenías.
      if (payment.external_reference) {
        await OrderService.processPaymentNotification({
          externalReference: payment.external_reference,
          status: payment.status!,
          transactionId: String(payment.id),
          tempPassword: payment.metadata?.temp_password,
        });
      }
    } catch {
      logger.debug(`Ignorando ID ${rawId} - No es un pago consultable todavía.`);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Error procesando Webhook de MP');
  }
};
