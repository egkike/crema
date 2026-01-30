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

    const product = await productRepository.getProductById(productId);

    if (!product) {
      throw new AppError('El producto solicitado no existe', 404);
    }

    if (product.status !== 'published') {
      throw new AppError('Este producto no está disponible para compra', 400);
    }

    const externalReference = `ORD-${user.id}-${Date.now()}`;
    const totalAmount = Number(product.price) * quantity;

    // ✅ CORRECCIÓN: Ahora pasamos la moneda del producto a la orden
    await orderRepository.create({
      buyer_id: user.id,
      product_id: product.id,
      amount: totalAmount,
      currency: product.currency || 'ARS', // Heredamos la moneda del producto
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
            currency_id: (product.currency as any) || 'ARS', // Mercado Pago usa currency_id
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

    // MP a veces manda el ID en distintos lugares según el evento
    const type = query.type || query.topic || body.type || body.action;

    if (type === 'payment' || type === 'payment.created' || type === 'payment.updated') {
      const paymentId = query.id || query['data.id'] || (body.data && body.data.id) || body.id;

      if (!paymentId) {
        return res.status(200).send('OK');
      }

      const payment = await new Payment(mpClient).get({ id: String(paymentId) });
      const { status, external_reference: externalRef } = payment;

      if (externalRef) {
        let internalStatus = 'pending';

        if (status === 'approved') {
          internalStatus = 'paid';

          try {
            const order = await orderRepository.getByExternalRef(externalRef);

            // Evitar doble procesamiento si el webhook llega dos veces
            if (order && !order.commissions_calculated) {
              const product = await productRepository.getProductById(order.product_id);

              if (product) {
                // ✅ El CommissionService ya está preparado para recibir order y product con moneda
                await CommissionService.processOrderCommissions(order, product);
                logger.info(`💰 Comisiones registradas: ${externalRef}`);
              }
            }
          } catch (commError: any) {
            logger.error({ error: commError.message }, 'Error procesando comisiones');
          }
        } else if (status === 'rejected' || status === 'cancelled') {
          internalStatus = 'failed';
        }

        await orderRepository.updateByExternalRef(externalRef, {
          status: internalStatus,
          transaction_id: String(paymentId),
          gateway_status: status ?? 'unknown',
        });
      }
    }

    res.status(200).send('OK');
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error en webhook');
    res.status(200).send('OK'); // Siempre 200 para que MP no reintente infinitamente
  }
};
