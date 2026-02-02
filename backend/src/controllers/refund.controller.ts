import { Request, Response, NextFunction } from 'express';

import { RefundService } from '../services/refund.service';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export const processRefund = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
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
