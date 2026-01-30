import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { CommissionService } from '../services/commission.service';
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

    // 1. Cambio: El repo devuelve Product | null
    const product = await productRepository.getProductById(productId);

    // Validamos existencia
    if (!product) {
      throw new AppError('El producto solicitado no existe', 404);
    }

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
    next(err);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const query = (req.query || {}) as any;
    const body = (req.body || {}) as any;

    const type = query.type || query.topic || body.type || body.action;

    if (type === 'payment' || type === 'payment.created' || type === 'payment.updated') {
      const paymentId = query.id || query['data.id'] || (body.data && body.data.id) || body.id;

      if (!paymentId) {
        logger.warn('Webhook recibido pero no se pudo extraer un paymentId');
        return res.status(200).send('OK');
      }

      logger.info(`[Crema-Payments] Consultando pago en Mercado Pago: ${paymentId}`);
      const payment = await new Payment(mpClient).get({ id: String(paymentId) });
      const { status, external_reference: externalRef } = payment;

      if (externalRef) {
        let internalStatus = 'pending';

        if (status === 'approved') {
          internalStatus = 'paid';

          try {
            const order = await orderRepository.getByExternalRef(externalRef);

            if (order) {
              // Validamos que el producto exista para que el motor de comisiones no falle
              const product = await productRepository.getProductById(order.product_id);

              if (product) {
                await CommissionService.processOrderCommissions(order, product);
                logger.info(`💰 Comisiones calculadas y registradas para la orden: ${externalRef}`);
              } else {
                logger.error(
                  `❌ Error crìtico: Orden ${externalRef} pagada pero el producto no existe`
                );
              }
            }
          } catch (commError) {
            logger.error({ error: commError }, 'Error al procesar comisiones en el webhook');
          }
        } else if (status === 'rejected' || status === 'cancelled') {
          internalStatus = 'failed';
        }

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

    res.status(200).send('OK');
  } catch (err: any) {
    logger.error(
      { message: err.message, context: 'handleWebhook' },
      'Error crítico procesando webhook'
    );
    res.status(200).send('OK');
  }
};
