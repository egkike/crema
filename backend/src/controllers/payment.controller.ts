import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { OrderService } from '../services/order.service'; // <--- El nuevo Director de Orquesta
import logger from '../utils/logger';

const mpClient = new MercadoPagoConfig({
  accessToken: config.mercadoPago.accessToken,
});

/**
 * Crea la preferencia de pago en Mercado Pago
 */
export const createPaymentPreference = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    const { productId, currency = 'ARS', quantity = 1, gateway } = req.body;

    if (!productId) throw new AppError('productId es requerido', 400);
    if (!gateway) throw new AppError('Debe seleccionar una pasarela (gateway)', 400);

    const product = await productRepository.getProductById(productId);
    if (!product || product.status !== 'published') {
      throw new AppError('Producto no disponible', 404);
    }

    const officialPrice = await productRepository.getPriceByCurrency(productId, currency);
    if (!officialPrice) throw new AppError(`Precio no definido para ${currency}`, 400);

    const totalAmount = officialPrice * quantity;
    const externalReference = `ORD-${user.id}-${Date.now()}`;

    if (gateway === 'mercadopago' && currency === 'ARS') {
      const preferenceClient = new Preference(mpClient);

      // 1. Registro inicial de la orden
      await orderRepository.create({
        buyerId: user.id,
        productId: product.id,
        amount: totalAmount,
        currency: currency,
        paymentMethod: 'mercadopago',
        externalReference,
        status: 'pending',
      });

      // 2. Creación de preferencia
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
          notification_url: `${config.apiBaseUrl}/payments/webhook`,
          external_reference: externalReference,
          binary_mode: true,
          back_urls: {
            success: `${config.frontendUrl}/pago/exito`,
            failure: `${config.frontendUrl}/pago/fallo`,
            pending: `${config.frontendUrl}/pago/pendiente`,
          },
          auto_return: 'approved',
        },
      });

      return res.status(201).json({
        success: true,
        data: { init_point: mpResponse.init_point, externalReference },
      });
    }

    throw new AppError(`Método ${gateway} no habilitado para ${currency}`, 400);
  } catch (err) {
    next(err);
  }
};

/**
 * Recibe las notificaciones de Mercado Pago
 */
export const handleWebhook = async (req: Request, res: Response) => {
  // Respondemos 200 inmediatamente a MP para evitar latencia y reintentos
  res.status(200).send('OK');

  try {
    const { type, data } = req.body;
    const paymentId = data?.id || req.query.id;

    if (type === 'payment' && paymentId) {
      logger.info({ paymentId }, '🔔 Webhook recibido, delegando a OrderService...');

      // Delegamos toda la lógica (validar MP, buscar orden, repartir comisiones)
      await OrderService.handlePaymentWebhook(String(paymentId));
    }
  } catch (err: any) {
    logger.error({ error: err.message }, '❌ Error procesando lógica de Webhook');
  }
};
