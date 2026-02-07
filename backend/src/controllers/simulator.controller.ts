import crypto from 'crypto';

import { Request, Response, NextFunction } from 'express';

import { AppError } from '../errors/AppError';
import { productRepository } from '../repositories/product.repository';
import { orderRepository } from '../repositories/order.repository';
import { userRepository } from '../repositories/user.repository';
import { OrderService } from '../services/order.service';
import logger from '../utils/logger';

/**
 * Crea una orden pendiente simulando el inicio de un checkout
 */
export const createSimulatedPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, currency = 'ARS', quantity = 1, email, fullname } = req.body;

    // 1. Obtener producto y precio (Lógica multimoneda)
    const product = await productRepository.getProductById(productId);
    const price = await productRepository.getPriceByCurrency(productId, currency);

    if (!product || !price)
      throw new AppError('Producto no disponible en la moneda seleccionada', 404);

    // 2. Lógica de Usuario (Idéntica a MP para mantener consistencia)
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
          username: email.split('@')[0] + crypto.randomInt(100, 999),
          email,
          fullname: fullname || 'Comprador Simulado',
          password: tempPassword,
          level: 1,
        });
        buyerId = newUser.id;
      }
    }

    const externalReference = `SIM-${buyerId}-${Date.now()}`;

    // 3. Crear orden en DB (Usando camelCase según tu CreateOrderDTO)
    await orderRepository.create({
      buyerId, 
      productId: product.id, 
      amount: Number(price) * Number(quantity),
      currency,
      paymentMethod: 'simulator',
      externalReference, 
      status: 'pending',
    });

    logger.info(
      { ref: externalReference, currency, amount: Number(price) * Number(quantity) },
      '🧪 [Simulador] Intención de compra creada'
    );

    return res.status(201).json({
      success: true,
      data: {
        externalReference,
        init_point_simulated: `POST /api/payments/simulator/confirm`,
        tempPassword, // Para facilitar tus pruebas de login
      },
    });
  } catch (error: any) {
    logger.error({ msg: error.message }, '❌ Error en simulador al crear');
    next(error);
  }
};

/**
 * Confirma el pago simulado y dispara la lógica de comisiones/balances
 */
export const confirmSimulatedPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { externalReference, status = 'approved', tempPassword } = req.body;

    if (!externalReference) throw new AppError('externalReference es requerido', 400);

    logger.info({ externalReference, status }, '🔔 [Simulador] Recibida confirmación de pago');

    // Delegamos al OrderService como si fuera un webhook real
    // Esto disparará CommissionService y BalanceRepository
    await OrderService.processPaymentNotification({
      externalReference,
      status, // 'approved' disparará el estado 'paid' en tu lógica
      transactionId: `SIM-TX-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      tempPassword,
    });

    return res.status(200).json({
      success: true,
      message: `Simulación de pago ${status} procesada exitosamente.`,
    });
  } catch (error: any) {
    logger.error({ msg: error.message }, '💥 Error en simulador al confirmar');
    next(error);
  }
};
