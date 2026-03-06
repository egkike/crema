import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';

import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { configRepository } from '../repositories/config.repository';
import { OrderService } from '../services/order.service';
import { SubscriptionService } from '../services/subscription.service';
import { PaymentProviderFactory } from '../services/payment/PaymentProviderFactory';
import logger from '../utils/logger';

export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Agregamos gatewayId al body, por defecto mercadopago para no romper el frontend actual
    const { productId, currency, quantity = 1, email, fullname, gatewayId } = req.body;

    // 1. VALIDACIÓN DINÁMICA DE PASARELA SEGÚN MONEDA (Usando tu nuevo método)
    const allowedGateways = await configRepository.getGatewaysByCurrency(currency);
    if (!allowedGateways.some(g => g.id === gatewayId)) {
      throw new AppError(
        `La pasarela ${gatewayId} no está disponible para la moneda ${currency}`,
        400
      );
    }

    const product = await productRepository.getProductById(productId);
    const price = await productRepository.getPriceByCurrency(productId, currency);

    if (!product || !price) throw new AppError('Producto no disponible', 404);

    // ✅ req.user ya está tipado por nuestro express.d.ts
    let buyerId = req.user?.id;
    let tempPassword: string | undefined;

    if (!buyerId) {
      if (!email) throw new AppError('Email requerido', 400);
      const user = await userRepository.findByCredentials(email);
      if (user) {
        buyerId = user.id;
      } else {
        tempPassword = crypto.randomBytes(10).toString('hex');
        // ✅ Ajustado al nuevo userRepository tipado
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

    if (!buyerId) {
      throw new AppError('No se pudo determinar o crear el usuario comprador', 500);
    }

    const externalReference = `ORD-${buyerId}-${Date.now()}`;
    const affiliateId = (req.cookies.affiliate_id as string) || null;

    // 2. CREAR ORDEN EN DB (Ahora guardamos el paymentMethod dinámico)
    await orderRepository.create({
      buyerId,
      productId: product.id,
      amount: Number(price) * Number(quantity),
      currency,
      paymentMethod: gatewayId,
      externalReference,
      status: 'pending',
      affiliateId: affiliateId,
    });

    // 3. USO DE LA FACTORY (Aquí delegamos la complejidad de la pasarela)
    const provider = PaymentProviderFactory.getProvider(gatewayId);
    const paymentResponse = await provider.createPreference({
      product,
      amount: Number(price) * Number(quantity),
      currency,
      externalReference,
      email: email || req.user?.email || '',
      tempPassword,
    });

    return res.status(201).json({
      success: true,
      data: {
        init_point: paymentResponse.initPoint,
        externalReference,
      },
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Maneja los webhooks de forma asíncrona para evitar timeouts de la pasarela.
 */
export const handleProviderWebhook = async (req: Request, res: Response) => {
  const { gatewayId } = req.params;

  if (typeof gatewayId !== 'string') {
    return res.status(400).send('Gateway ID inválido');
  }

  // 1. RESPUESTA INMEDIATA: Cerramos la conexión con MP con éxito.
  res.status(200).send('OK');

  // 2. PROCESAMIENTO EN SEGUNDO PLANO (Background processing)
  // Usamos una función autoejecutable para que el controlador termine aquí
  // pero el proceso de validación y DB continúe.
  (async () => {
    try {
      const provider = PaymentProviderFactory.getProvider(gatewayId);

      const result = await provider.handleWebhook({
        body: req.body,
        headers: req.headers,
        query: req.query,
      });

      // Si la firma falló o el ID no existe en MP, 'result' será null y salimos.
      if (!result) return;

      if (result.type === 'subscription') {
        // Formato esperado en externalReference: "SUB:userId:planId"
        const [, userId, planId] = result.externalReference.split(':');

        if (result.status === 'authorized' || result.status === 'approved') {
          // ENVIAMOS LOS FEES AQUÍ TAMBIÉN
          await SubscriptionService.handleSubscriptionPayment(
            userId,
            planId,
            result.transactionId,
            result.gatewayFee,
            result.gatewayTax
          );
        } else if (['cancelled', 'expired'].includes(result.status)) {
          await SubscriptionService.cancelSubscription(userId, true);
        }
      } else {
        // Pago de producto único (Ya actualizado)
        await OrderService.processPaymentNotification({
          externalReference: result.externalReference,
          status: result.status,
          transactionId: result.transactionId,
          tempPassword: result.metadata?.temp_password,
          gatewayFee: result.gatewayFee,
          gatewayTax: result.gatewayTax,
        });
      }
    } catch (error: any) {
      logger.error(
        { gatewayId, error: error.message },
        'Error en procesamiento background de webhook'
      );
    }
  })();
};
