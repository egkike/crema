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

export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Recibimos el gateway explícitamente desde el body
    const { productId, currency = 'ARS', quantity = 1, gateway } = req.body;

    if (!productId) throw new AppError('productId es requerido', 400);
    if (!gateway) throw new AppError('Debe seleccionar una pasarela de pago (gateway)', 400);

    const product = await productRepository.getProductById(productId);
    if (!product || product.status !== 'published') {
      throw new AppError('Producto no disponible', 404);
    }

    const officialPrice = await productRepository.getPriceByCurrency(productId, currency);
    if (!officialPrice) {
      throw new AppError(`Precio no definido para ${currency}`, 400);
    }

    const totalAmount = officialPrice * quantity;
    const externalReference = `ORD-${user.id}-${Date.now()}`;

    // 2. Lógica Dinámica de Pasarelas
    // Aquí podrías consultar a la tabla 'currency_gateways' si ese gateway es válido para esa moneda

    if (gateway === 'mercadopago' && currency === 'ARS') {
      const preferenceClient = new Preference(mpClient);
      const notificationUrl = `${config.apiBaseUrl}/payments/webhook`;

      // Creamos la orden con el gateway elegido
      await orderRepository.create({
        buyerId: user.id,
        productId: product.id,
        amount: totalAmount,
        currency: currency,
        paymentMethod: 'mercadopago', // Ahora viene validado
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
          payer: { email: user.email },
          notification_url: notificationUrl,
          external_reference: externalReference,
          binary_mode: true,
          back_urls: {
            success: `${config.apiBaseUrl.replace('/api', '')}/pago/exito`,
            failure: `${config.apiBaseUrl.replace('/api', '')}/pago/fallo`,
            pending: `${config.apiBaseUrl.replace('/api', '')}/pago/pendiente`,
          },
          auto_return: 'approved',
        },
      });

      return res.status(201).json({
        success: true,
        data: { init_point: mpResponse.init_point, gateway: 'mercadopago', externalReference },
      });
    }

    // Ejemplo de escalabilidad: Otra pasarela para la MISMA moneda (ARS)
    if (gateway === 'stripe' && currency === 'ARS') {
      // Lógica de Stripe...
      throw new AppError('Stripe para ARS está en mantenimiento', 400);
    }

    // Pasarelas Crypto
    if (gateway === 'binance_pay' && ['USDT', 'BTC'].includes(currency)) {
      await orderRepository.create({
        buyerId: user.id,
        productId: product.id,
        amount: totalAmount,
        currency,
        paymentMethod: 'binance_pay',
        externalReference,
        status: 'pending',
      });

      return res.status(201).json({
        success: true,
        message: 'Lógica de Binance Pay pendiente',
        data: { gateway: 'binance_pay', amount: totalAmount, currency },
      });
    }

    throw new AppError(`El método ${gateway} no está habilitado para ${currency}`, 400);
  } catch (err) {
    next(err);
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;
    const paymentId = data?.id || req.query.id;

    if (type === 'payment' && paymentId) {
      const payment = await new Payment(mpClient).get({ id: String(paymentId) });
      const { status, external_reference: externalRef } = payment;

      if (externalRef) {
        const order = await orderRepository.getByExternalRef(externalRef);

        // Verificamos que la orden pertenezca a este gateway para mayor seguridad
        if (
          order &&
          order.payment_method === 'mercadopago' &&
          status === 'approved' &&
          !order.commissions_calculated
        ) {
          const product = await productRepository.getProductById(order.product_id);

          if (product) {
            await CommissionService.processOrderCommissions(order, product);
            await orderRepository.updateByExternalRef(externalRef, {
              status: 'paid',
              transaction_id: String(paymentId),
              gateway_status: status,
              commissions_calculated: true,
            });
            logger.info({ externalRef }, '✅ Pago MP procesado');
          }
        } else if (order && (status === 'rejected' || status === 'cancelled')) {
          await orderRepository.updateByExternalRef(externalRef, {
            status: 'failed',
            gateway_status: status,
          });
        }
      }
    }
    res.status(200).send('OK');
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error en Webhook MP');
    res.status(200).send('OK');
  }
};
