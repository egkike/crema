import { Request, Response, NextFunction } from 'express';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

import { config } from '../config/index';
import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { CommissionService } from '../services/commission.service'; // Servicio clave
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
    if (!officialPrice) {
      throw new AppError(`Precio no definido para ${currency}`, 400);
    }

    const totalAmount = officialPrice * quantity;
    const externalReference = `ORD-${user.id}-${Date.now()}`;

    // Lógica para Mercado Pago
    if (gateway === 'mercadopago' && currency === 'ARS') {
      const preferenceClient = new Preference(mpClient);
      const notificationUrl = `${config.apiBaseUrl}/payments/webhook`;

      // 1. Registramos la orden en estado 'pending'
      await orderRepository.create({
        buyerId: user.id,
        productId: product.id,
        amount: totalAmount,
        currency: currency,
        paymentMethod: 'mercadopago',
        externalReference,
        status: 'pending',
      });

      // 2. Creamos la preferencia en MP
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

    // Otras pasarelas (Stripe, Binance Pay, etc.)
    throw new AppError(`El método ${gateway} no está habilitado para ${currency}`, 400);
  } catch (err) {
    next(err);
  }
};

/**
 * Recibe las notificaciones de Mercado Pago
 */
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;
    const paymentId = data?.id || req.query.id;

    // Solo procesamos si la notificación es de un pago
    if (type === 'payment' && paymentId) {
      const payment = await new Payment(mpClient).get({ id: String(paymentId) });
      const { status, external_reference: externalRef } = payment;

      if (externalRef) {
        const order = await orderRepository.getByExternalRef(externalRef);

        // CONDICIÓN CRÍTICA: La orden debe existir, ser MP, estar aprobada y NO haber sido procesada antes
        if (
          order &&
          order.payment_method === 'mercadopago' &&
          status === 'approved' &&
          !order.commissions_calculated // Evita duplicar dinero si MP manda el webhook 2 veces
        ) {
          const product = await productRepository.getProductById(order.product_id);

          if (product) {
            // --- AQUÍ OCURRE LA MAGIA FINANCIERA ---
            // 1. Distribuye el dinero (Creator, Plataforma, etc.)
            await CommissionService.processOrderCommissions(order, product);

            // 2. Actualiza la orden marcándola como pagada y procesada
            await orderRepository.updateByExternalRef(externalRef, {
              status: 'paid',
              transaction_id: String(paymentId),
              gateway_status: status,
              commissions_calculated: true,
            });

            logger.info({ externalRef, paymentId }, '✅ Pago MP y Distribución de Comisiones OK');
          }
        } else if (order && (status === 'rejected' || status === 'cancelled')) {
          // Si el pago falló, marcamos la orden como fallida
          await orderRepository.updateByExternalRef(externalRef, {
            status: 'failed',
            gateway_status: status,
          });
          logger.warn({ externalRef, status }, '⚠️ Pago MP rechazado o cancelado');
        }
      }
    }

    // Mercado Pago espera un 200 siempre para dejar de reintentar
    res.status(200).send('OK');
  } catch (err: any) {
    logger.error({ error: err.message }, 'Error procesando Webhook de MP');
    // Respondemos 200 aunque falle nuestro código para evitar que MP nos sature a reintentos
    res.status(200).send('OK');
  }
};
