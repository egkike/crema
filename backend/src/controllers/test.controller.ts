import { Request, Response, NextFunction } from 'express';

import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { CommissionService } from '../services/commission.service';
import { AppError } from '../errors/AppError';

export const testCommissionLogic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      throw new AppError('orderId es requerido en el body', 400);
    }

    // 1. Obtener la orden directamente (ya no devuelve un objeto con 'error')
    const order = await orderRepository.getById(orderId);
    if (!order) {
      throw new AppError('Orden no encontrada', 404);
    }

    // 2. Obtener el producto
    const product = await productRepository.getProductById(order.product_id);

    // Type Guard: Si es null, lanzamos error. Si no, TS sabe que existe.
    if (!product) {
      throw new AppError('El producto asociado a la orden no existe', 404);
    }

    // 3. Ejecutar el motor de comisiones
    // Pasamos los objetos limpios. El servicio se encarga de la transacción.
    const result = await CommissionService.processOrderCommissions(order, product);

    res.status(200).json({
      success: true,
      message: 'Motor de comisiones ejecutado manualmente con éxito',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
