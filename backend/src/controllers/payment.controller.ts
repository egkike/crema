import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import logger from '../utils/logger';

const mpClient = new MercadoPagoConfig({
  accessToken: config.mercadoPago.accessToken,
});

export const createPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const { productId, quantity = 1 } = req.body;
    if (!productId) throw new AppError('productId es requerido', 400);

    const productResult = await productRepository.getProductById(productId);
    if ('error' in productResult) {
      throw new AppError(productResult.error, 404);
    }

    const product = productResult;
    if (product.status !== 'published') {
      throw new AppError('Este producto no está disponible para compra', 400);
    }

    const externalReference = `ORD-${user.id}-${Date.now()}`;
    const totalAmount = Number(product.price) * quantity;

    await orderRepository.create({
      buyer_id: user.id,
      product_id: product.id,
      amount: totalAmount,
      payment_method: 'mercadopago',
      external_reference: externalReference,
      status: 'pending',
    });

    const preferenceClient = new Preference(mpClient);

    // Cambiamos la estructura para cumplir con el SDK de MP y TS
    const mpResponse = await preferenceClient.create({
      body: {
        items: [
          {
            id: product.id,
            title: product.title,
            description: product.description || 'Contenido digital - Crema',
            quantity: Number(quantity),
            currency_id: 'ARS',
            unit_price: Number(product.price),
          },
        ],
        payer: {
          email: user.email,
        },
        back_urls: {
          success: `${config.apiBaseUrl.replace('/api', '')}/pago/exito`,
          failure: `${config.apiBaseUrl.replace('/api', '')}/pago/fallo`,
          pending: `${config.apiBaseUrl.replace('/api', '')}/pago/pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${config.apiBaseUrl}/api/payments/webhook`,
        external_reference: externalReference,
        metadata: {
          userId: user.id,
          productId: product.id,
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        init_point: mpResponse.init_point,
        preferenceId: mpResponse.id,
        external_reference: externalReference,
      },
    });
  } catch (err) {
    next(err); // Aquí sí se usa 'next'
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    // 1. Normalización defensiva de objetos
    const query = (req.query || {}) as any;
    const body = (req.body || {}) as any;

    // 2. Identificación del tipo de evento (MP usa varios campos según la versión)
    const type = query.type || query.topic || body.type || body.action;

    if (type === 'payment' || type === 'payment.created' || type === 'payment.updated') {
      // 3. Extracción de ID ultra-segura (sin usar optional chaining para evitar fallos de compilación)
      let paymentId = null;

      if (query.id) {
        paymentId = query.id;
      } else if (query['data.id']) {
        paymentId = query['data.id'];
      } else if (body.data && body.data.id) {
        paymentId = body.data.id;
      } else if (body.id) {
        paymentId = body.id;
      }

      if (!paymentId) {
        logger.warn('Webhook recibido pero no se pudo extraer un paymentId');
        return res.status(200).send('OK');
      }

      logger.info(`Consultando pago en Mercado Pago: ${paymentId}`);

      // 4. Obtención de datos reales desde la API de MP
      const payment = await new Payment(mpClient).get({ id: String(paymentId) });

      const { status, external_reference: externalRef } = payment;

      // 5. Actualización de la base de datos
      if (externalRef) {
        let internalStatus = 'pending';
        if (status === 'approved') internalStatus = 'paid';
        if (status === 'rejected' || status === 'cancelled') internalStatus = 'failed';

        const updatedOrder = await orderRepository.updateByExternalRef(externalRef, {
          status: internalStatus,
          transaction_id: String(paymentId),
          gateway_status: status ?? 'unknown',
        });

        if (updatedOrder) {
          logger.info(
            `✅ Orden ${externalRef} actualizada a [${internalStatus}] (MP Status: ${status})`
          );
        } else {
          logger.warn(`❌ No se encontró orden con external_reference: ${externalRef}`);
        }
      }
    }

    // Siempre respondemos 200 a Mercado Pago
    res.status(200).send('OK');
  } catch (err: any) {
    logger.error(
      {
        message: err.message,
        stack: err.stack,
        context: 'handleWebhook',
      },
      'Error crítico procesando webhook'
    );

    // Respondemos 200 para evitar que MP reintente infinitamente un error de código
    res.status(200).send('OK');
  }
};
