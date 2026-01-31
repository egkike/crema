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

    const { productId, currency = 'ARS', quantity = 1 } = req.body;
    if (!productId) throw new AppError('productId es requerido', 400);

    // 1. Validamos existencia y estado del producto
    const product = await productRepository.getProductById(productId);
    if (!product) throw new AppError('El producto solicitado no existe', 404);
    if (product.status !== 'published')
      throw new AppError('Producto no disponible para compra', 400);

    // 2. VALIDACIÓN CRÍTICA: Obtener el precio oficial para la moneda elegida
    const officialPrice = await productRepository.getPriceByCurrency(productId, currency);
    if (!officialPrice) {
      throw new AppError(`Este producto no tiene un precio definido en ${currency}`, 400);
    }

    const totalAmount = officialPrice * quantity;
    const externalReference = `ORD-${user.id}-${Date.now()}`;

    // 3. Crear la orden en la DB (Usando nuestro nuevo repositorio con CamelCase)
    await orderRepository.create({
      buyerId: user.id,
      productId: product.id,
      amount: totalAmount,
      currency: currency,
      paymentMethod: currency === 'ARS' ? 'mercadopago' : 'crypto_gateway', // Lógica de ruteo
      externalReference: externalReference,
      status: 'pending',
    });

    // 4. RUTEO DE PASARELA
    if (currency === 'ARS') {
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
              unit_price: officialPrice,
            },
          ],
          payer: { email: user.email },
          back_urls: {
            success: `${config.apiBaseUrl.replace('/api', '')}/pago/exito`,
            failure: `${config.apiBaseUrl.replace('/api', '')}/pago/fallo`,
            pending: `${config.apiBaseUrl.replace('/api', '')}/pago/pendiente`,
          },
          auto_return: 'approved',
          notification_url: `${config.apiBaseUrl}/api/payments/webhook`,
          external_reference: externalReference,
        },
      });

      return res.status(201).json({
        success: true,
        data: {
          init_point: mpResponse.init_point,
          gateway: 'mercadopago',
          external_reference: externalReference,
        },
      });
    }

    // Lógica para otras monedas (Binance Pay, etc.)
    if (currency === 'USDT' || currency === 'BTC') {
      // Aquí iría la llamada a binancePayService.createOrder(...)
      return res.status(201).json({
        success: true,
        message: 'Lógica de pago crypto pendiente de implementación',
        data: { gateway: 'crypto', amount: totalAmount, currency },
      });
    }

    throw new AppError('Método de pago no soportado para esta moneda', 400);
  } catch (err) {
    next(err);
  }
};

// ... El handleWebhook se mantiene similar, pero asegurando que use la moneda de la orden ...
export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const query = (req.query || {}) as any;
    const body = (req.body || {}) as any;

    // 1. Identificar el tipo de evento y el ID del pago
    const type = query.type || query.topic || body.type || body.action;

    if (type === 'payment' || type === 'payment.created' || type === 'payment.updated') {
      const paymentId = query.id || query['data.id'] || (body.data && body.data.id) || body.id;

      if (!paymentId) return res.status(200).send('OK');

      // ✅ Uso de 'Payment' (importado de mercadopago)
      const payment = await new Payment(mpClient).get({ id: String(paymentId) });
      const { status, external_reference: externalRef } = payment;

      if (externalRef) {
        const order = await orderRepository.getByExternalRef(externalRef);

        if (!order) {
          logger.warn({ externalRef }, 'Webhook recibido para una orden no encontrada');
          return res.status(200).send('OK');
        }

        let internalStatus = 'pending';

        if (status === 'approved') {
          internalStatus = 'paid';

          // ✅ Uso de 'CommissionService' y 'logger'
          if (!order.commissions_calculated) {
            try {
              const product = await productRepository.getProductById(order.product_id);
              if (product) {
                // Aquí el Service reparte el dinero en la moneda de la orden (ARS, USDT, etc.)
                await CommissionService.processOrderCommissions(order, product);
                logger.info(
                  `💰 Pago aprobado y comisiones repartidas: ${externalRef} (${order.currency})`
                );
              }
            } catch (commError: any) {
              logger.error(
                { error: commError.message, externalRef },
                'Error al procesar comisiones en webhook'
              );
            }
          }
        } else if (status === 'rejected' || status === 'cancelled') {
          internalStatus = 'failed';
          logger.info(`❌ Pago rechazado: ${externalRef}`);
        }

        // Actualizar estado final de la orden
        await orderRepository.updateByExternalRef(externalRef, {
          status: internalStatus,
          transaction_id: String(paymentId),
          gateway_status: status ?? 'unknown',
        });
      }
    }

    res.status(200).send('OK');
  } catch (err: any) {
    // ✅ Uso de 'logger' para errores inesperados
    logger.error({ error: err.message }, 'Error crítico en el controlador de Webhook');
    res.status(200).send('OK');
  }
};
