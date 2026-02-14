import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { OrderService } from '../services/order.service';
import { SubscriptionService } from '../services/subscription.service';
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
  res.status(200).send('OK'); // Siempre responder 200 inmediatamente

  try {
    const { action, type, data } = req.body;
    const rawId = data?.id || req.query.id;

    if (!rawId) return;

    const mpClient = getMPClient();

    // CASO A: Venta de Producto Único
    if (type === 'payment' || action === 'payment.created') {
      const paymentInstance = new Payment(mpClient);
      const payment = await paymentInstance.get({ id: String(rawId) });

      if (payment.external_reference) {
        await OrderService.processPaymentNotification({
          externalReference: payment.external_reference,
          status: payment.status!,
          transactionId: String(payment.id),
          tempPassword: payment.metadata?.temp_password,
        });
      }
    }

    // CASO B: Suscripción Mensual (PreApproval)
    if (
      type === 'subscription_preapproval' ||
      action === 'subscription_preapproval.created' ||
      action === 'subscription_preapproval.updated'
    ) {
      const preApprovalClient = new PreApproval(mpClient);
      const sub = await preApprovalClient.get({ id: String(rawId) });

      if (sub.external_reference && sub.external_reference.startsWith('SUB:')) {
        // Usamos ":" como separador para no romper los UUIDs
        const parts = sub.external_reference.split(':');
        const userId = parts[1];
        const planId = parts[2];

        if (sub.status === 'authorized') {
          await SubscriptionService.handleSubscriptionPayment(userId, planId, sub.id!);
        }

        if (sub.status === 'cancelled') {
          // Si se cancela desde MP directamente, hacemos el downgrade en nuestra DB
          await SubscriptionService.cancelSubscription(userId);
        }
      }
    }
  } catch (error: any) {
    logger.error({ error: error.message, body: req.body }, '💥 Error Webhook MP');
  }
};
