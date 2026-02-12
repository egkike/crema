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

/**
 * Helper para obtener el cliente de Mercado Pago dinámicamente
 */
const getMPClient = () => {
  return new MercadoPagoConfig({
    accessToken: config.mercadoPago?.accessToken || 'dummy_token',
  });
};

export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, currency = 'ARS', quantity = 1, email, fullname } = req.body;

    const product = await productRepository.getProductById(productId);
    const price = await productRepository.getPriceByCurrency(productId, currency);

    if (!product || !price) throw new AppError('Producto no disponible', 404);

    let buyerId = (req as any).user?.id;
    let tempPassword;

    if (!buyerId) {
      if (!email) throw new AppError('Email requerido', 400);
      const user = await userRepository.findByCredentials(email);
      if (user) {
        buyerId = user.id;
      } else {
        tempPassword = crypto.randomBytes(10).toString('hex');
        const newUser = await userRepository.createUser({
          email,
          fullname: fullname || 'Cliente',
          password: tempPassword,
          level: 1,
          active: 0,
        });
        buyerId = newUser.id;
      }
    }

    const externalReference = `ORD-${buyerId}-${Date.now()}`;

    await orderRepository.create({
      buyerId,
      productId: product.id,
      amount: Number(price) * Number(quantity),
      currency,
      paymentMethod: 'mercadopago',
      externalReference,
      status: 'pending',
    });

    // Instanciación bajo demanda
    const mpClient = getMPClient();
    const preferenceClient = new Preference(mpClient);
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
        payer: { email: String(email).trim() },
        metadata: { temp_password: tempPassword },
        back_urls: {
          success: `${config.frontendUrl}/checkout/success`,
          failure: `${config.frontendUrl}/checkout/error`,
          pending: `${config.frontendUrl}/checkout/pending`,
        },
        external_reference: externalReference,
        notification_url: `${config.apiBaseUrl}/api/payments/mercadopago/webhook`,
        statement_descriptor: 'CREMA',
      },
    });

    return res.status(201).json({
      success: true,
      data: { init_point: mpResponse.init_point },
    });
  } catch (error: any) {
    next(error);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  res.status(200).send('OK');
  try {
    const rawId = req.body.data?.id || req.query.id || req.body.id;
    const type = req.body.type || req.query.topic || req.body.action;

    if (type !== 'payment' || !rawId) return;

    // Instanciación bajo demanda
    const mpClient = getMPClient();
    const paymentInstance = new Payment(mpClient);

    // Forzado de String preventivo antes de la llamada a la SDK
    const payment = await paymentInstance.get({ id: String(rawId) });

    if (payment.external_reference) {
      await OrderService.processPaymentNotification({
        externalReference: payment.external_reference,
        status: payment.status!,
        transactionId: String(payment.id),
        tempPassword: payment.metadata?.temp_password,
      });
    }
  } catch (error: any) {
    logger.error({ error: error.message }, '💥 Error Webhook MP');
  }
};
