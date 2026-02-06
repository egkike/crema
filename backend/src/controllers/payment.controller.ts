import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
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
    if (!buyerId) {
      if (!email) throw new AppError('Email requerido', 400);
      const user = await userRepository.findByCredentials(email);
      if (user) {
        buyerId = user.id;
      } else {
        const newUser = await userRepository.createUser({
          username: email.split('@')[0] + crypto.randomInt(100, 999),
          email,
          fullname: fullname || 'Cliente Temporal',
          password: crypto.randomBytes(10).toString('hex'),
          level: 1,
        });
        buyerId = newUser.id;
      }
    }

    const externalReference = `ORD-${buyerId}-${Date.now()}`;

    // 3. Crear orden en DB (Estado inicial: pending)
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

    // 4. Crear Preferencia en Mercado Pago
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
        back_urls: {
          success: `${config.frontendUrl}/checkout/success`,
          failure: `${config.frontendUrl}/checkout/error`,
          pending: `${config.frontendUrl}/checkout/pending`,
        },
        external_reference: externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/webhook`,
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
  // 1. SIEMPRE responder 200 inmediatamente a Mercado Pago
  res.status(200).send('OK');

  try {
    // Capturamos el ID y el tipo de la notificación
    const rawId = req.body.data?.id || req.query.id || req.body.id;
    const type = req.body.type || req.query.topic || req.body.topic || req.body.action;

    logger.info({ rawId, type }, '🔔 Webhook recibido de Mercado Pago');

    // Si es merchant_order, MP nos avisa que se creó la intención.
    // No hacemos nada, esperamos al evento 'payment' para confirmar el dinero.
    if (type === 'merchant_order') {
      logger.info('ℹ️ Notificación de merchant_order recibida. Esperando la de payment...');
      return;
    }

    // Si no hay ID, no podemos consultar nada
    if (!rawId) {
      logger.warn('⚠️ Webhook recibido sin ID de datos');
      return;
    }

    const paymentInstance = new Payment(mpClient);

    // Intentamos obtener el pago real desde la API de Mercado Pago
    try {
      const payment = await paymentInstance.get({ id: String(rawId) });
      const status = payment.status;
      const ref = payment.external_reference;

      logger.info({ status, ref, paymentId: rawId }, '🔍 Consultando estado del pago en MP');

      // Si el pago está aprobado y tiene una referencia de orden
      if (status === 'approved' && ref) {
        const order = await orderRepository.getByExternalRef(ref);

        if (!order) {
          logger.warn({ ref }, '⚠️ Webhook: Referencia externa no encontrada en DB');
          return;
        }

        // Si la orden aún no estaba marcada como pagada, la actualizamos
        if (order.status !== 'paid') {
          await orderRepository.updateStatus(order.id, 'paid');
          logger.info(`✨ ¡ÉXITO! Orden ${order.id} actualizada a PAID`);
        } else {
          logger.info({ orderId: order.id }, 'ℹ️ La orden ya estaba pagada');
        }
      }
    } catch {
      // Este catch atrapa casos donde el ID enviado no es un pago válido (o aún no impactó en la API)
      logger.debug(`El ID ${rawId} no parece ser un pago válido todavía. Ignorando...`);
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Error procesando Webhook de MP');
  }
};
