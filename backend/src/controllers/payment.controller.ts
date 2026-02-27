import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago';

import { config } from '../config/index';
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
 * ENTRADA: Webhook de Mercado Pago
 */
export const handleMPWebhook = async (req: Request, res: Response) => {
  res.status(200).send('OK');

  try {
    const { action, type, data } = req.body;
    const xSignature = req.headers['x-signature'] as string;
    const xRequestId = req.headers['x-request-id'] as string;

    // 2. VALIDACIÓN DE SEGURIDAD (Solo si tenemos el secret configurado)
    if (config.mercadoPago.webhookSecret && xSignature) {
      const parts = xSignature.split(',');
      let ts: string | undefined;
      let hash: string | undefined;

      parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key === 'ts') ts = value;
        if (key === 'v1') hash = value;
      });

      if (ts && hash) {
        // El formato de MP para el manifiesto es: id:[data.id];request-id:[x-request-id];ts:[ts];
        // Nota: El id depende de si es un pago o una suscripción
        const resourceId = (data?.id || req.query.id) as string;
        const manifest = `id:${resourceId};request-id:${xRequestId};ts:${ts};`;

        const hmac = crypto
          .createHmac('sha256', config.mercadoPago.webhookSecret)
          .update(manifest)
          .digest('hex');

        if (hmac !== hash) {
          logger.warn(
            { xRequestId },
            '⚠️ Firma de Webhook MP inválida. Posible intento de fraude.'
          );
          return; // Abortamos el procesamiento
        }
      }
    } else if (config.isProduction) {
      // En producción, si no hay firma y tenemos el secret, sospechamos
      logger.error('❌ Webhook recibido sin firma en entorno de producción');
      return;
    }

    // Forzamos a string para que el SDK no se queje
    const rawId = (data?.id || req.query.id) as string;

    if (!rawId) return;

    // Instanciamos el cliente directamente aquí o lo traemos de config
    const mpClient = new MercadoPagoConfig({
      accessToken: config.mercadoPago?.accessToken || 'dummy_token',
    });

    // CASO A: Venta de Producto Único
    if (type === 'payment' || action === 'payment.created') {
      const paymentInstance = new Payment(mpClient);
      const payment = await paymentInstance.get({ id: rawId });

      if (payment.external_reference) {
        await OrderService.processPaymentNotification({
          externalReference: payment.external_reference,
          status: payment.status || 'pending',
          transactionId: String(payment.id),
          // Acceso seguro a metadata que suele ser el dolor de cabeza de TS
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
      const sub = await preApprovalClient.get({ id: rawId });

      if (sub.external_reference && sub.external_reference.startsWith('SUB:')) {
        const parts = sub.external_reference.split(':');
        const userId = parts[1];
        const planId = parts[2];

        if (sub.status === 'authorized') {
          // ✅ Éxito: Activamos/Renovamos
          await SubscriptionService.handleSubscriptionPayment(
            userId,
            planId,
            String(sub.id) // gatewaySubscriptionId
          );
        } else if (['cancelled', 'expired'].includes(sub.status || '')) {
          // ✅ Fallo definitivo: Downgrade
          // Usamos el flag isWebhook = true para no intentar llamar a la API de MP de vuelta
          await SubscriptionService.cancelSubscription(userId, true);
        } else {
          // ⚠️ Otros estados (pending, authorized_payment_pending):
          // Podrías solo loguear o enviar un aviso al usuario sin quitarle el acceso aún.
          logger.info({ userId, status: sub.status }, 'Suscripción MP en estado transitorio');
        }
      }
    }
  } catch (error: any) {
    logger.error({ error: error.message, body: req.body }, '💥 Error Webhook MP');
  }
};

/**
 * ENTRADA: Confirmación del Simulador
 */
export const handleSimulatorConfirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalReference, status = 'approved', tempPassword } = req.body;

    // 1. DETECTAR SI ES UNA SUSCRIPCIÓN (SUB:userId:planId)
    if (externalReference && externalReference.startsWith('SUB:')) {
      const parts = externalReference.split(':');
      const userId = parts[1];
      const planId = parts[2];

      if (status === 'approved' || status === 'authorized') {
        // Activamos la suscripción en el simulador
        await SubscriptionService.handleSubscriptionPayment(
          userId,
          planId,
          `SIM-SUB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
        );
      } else {
        // Downgrade si el estado no es exitoso
        await SubscriptionService.cancelSubscription(userId, true);
      }

      return res.status(200).json({
        success: true,
        message: `Simulación de SUSCRIPCIÓN ${status} procesada.`,
      });
    }

    // 2. CASO POR DEFECTO: Venta de producto único (OrderService)
    await OrderService.processPaymentNotification({
      externalReference,
      status,
      transactionId: `SIM-TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      tempPassword,
    });

    return res.status(200).json({
      success: true,
      message: `Simulación de PAGO ${status} procesada exitosamente.`,
    });
  } catch (error: any) {
    next(error);
  }
};
