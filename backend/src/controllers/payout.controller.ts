import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { PayoutService } from '../services/payout.service';
import { payoutRepository } from '../repositories/payout.repository';
import { requestPayoutSchema } from '../schemas/payout.schema';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

class PayoutController {
  /**
   * Crea una solicitud de retiro
   */
  async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      // SEGURIDAD: Extraemos el ID del usuario del token (req.user)
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      // 1. Validar cuerpo de la petición con Zod
      const validatedData = requestPayoutSchema.parse(req.body);

      logger.info(
        { userId, amount: validatedData.amount, currency: validatedData.currency },
        '💰 Procesando solicitud de retiro'
      );

      // 2. Llamar al servicio
      // El servicio valida monto mínimo, existencia de saldo y registra historial
      const payout = await PayoutService.requestPayout(
        userId,
        validatedData.amount,
        validatedData.currency,
        validatedData.destination
      );

      res.status(201).json({
        success: true,
        message: 'Solicitud de retiro creada. El monto ha sido reservado de su saldo disponible.',
        data: payout,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map(i => `${i.path}: ${i.message}`).join('. ');
        return next(new AppError(`Error de validación: ${message}`, 400));
      }
      next(error);
    }
  }

  /**
   * Obtiene las solicitudes de retiro del usuario autenticado
   */
  async getMyPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      const payouts = await payoutRepository.getByUserId(userId);

      res.status(200).json({
        success: true,
        data: payouts,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const payoutController = new PayoutController();
