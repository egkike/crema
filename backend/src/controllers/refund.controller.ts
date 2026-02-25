import { Request, Response, NextFunction } from 'express';

import { RefundService } from '../services/refund.service';
import { orderRepository } from '../repositories/order.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

/**
 * REEMBOLSO MANUAL POR ADMINISTRACIÓN
 * Para que el staff pueda devolver dinero aun fuera de reglas.
 */
export const processRefund = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    if (!user) throw new AppError('Usuario no autenticado', 401);

    // 1. Verificación por NIVEL (Cambiamos user.role por user.level)
    // Usamos >= 10 o el valor que consideres para staff/admin
    if (user.level < 10) {
      throw new AppError('No tienes permisos para esta acción', 403);
    }

    // 2. Solución al error de tipos: Forzamos a que sea string o lanzamos error
    const { orderId } = req.params;
    if (typeof orderId !== 'string') {
      throw new AppError('El ID de la orden no es válido', 400);
    }

    const { reason } = req.body;

    logger.info({ orderId, adminId: user.id }, 'Procesando reembolso manual');

    // Ahora TS sabe que orderId es estrictamente string
    const result = await RefundService.processRefund(
      orderId,
      typeof reason === 'string' ? reason : 'Reembolso procesado por administración'
    );

    return res.status(200).json({
      success: true,
      message: 'Reembolso ejecutado y balances actualizados',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * REEMBOLSO SOLICITADO POR EL ALUMNO (Self-Service)
 * Valida automáticamente las reglas de Safe-Guard.
 */
export const requestSelfRefund = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = req;
    const { orderId } = req.params;

    if (!user?.id) throw new AppError('Usuario no autenticado', 401);

    if (typeof orderId !== 'string') {
      throw new AppError('El ID de la orden proporcionado no es válido', 400);
    }

    // 1. Obtener la orden y validar pertenencia
    const order = await orderRepository.getById(orderId);
    if (!order || order.buyer_id !== user.id) {
      throw new AppError('No se encontró la orden o no tienes permiso.', 404);
    }

    // 2. Validar que la orden esté pagada
    if (order.status !== 'paid') {
      throw new AppError('Solo se pueden reembolsar órdenes con estado pagado.', 400);
    }

    // 3. VALIDACIÓN SAFE-GUARD: Elegibilidad por consumo
    if (!order.is_guarantee_eligible) {
      throw new AppError(
        'El reembolso no está disponible porque has excedido el límite de consumo o descarga del producto.',
        403
      );
    }

    // 4. Validar fecha de garantía (release_date)
    // release_date se calcula en el mapRowToOrder sumando los días de garantía
    if (order.release_date && new Date() > new Date(order.release_date)) {
      throw new AppError('El periodo de garantía ha expirado.', 403);
    }

    logger.info({ orderId, userId: user.id }, 'Alumno solicitando auto-reembolso via Safe-Guard');

    // 5. Ejecutar el reembolso
    const result = await RefundService.processRefund(
      orderId,
      'Reembolso solicitado por el usuario (Garantía de satisfacción)'
    );

    return res.status(200).json({
      success: true,
      message: 'Tu reembolso ha sido procesado exitosamente.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};
