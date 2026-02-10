import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { PayoutService } from '../services/payout.service';
import { payoutRepository } from '../repositories/payout.repository';
import { requestPayoutSchema } from '../schemas/payout.schema';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

class PayoutController {
  async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      // 1. Validar cuerpo con el nuevo esquema (ahora solo trae amount, currency y payoutMethodId)
      const validatedData = requestPayoutSchema.parse(req.body);

      logger.info(
        { userId, amount: validatedData.amount, methodId: validatedData.payoutMethodId },
        '💰 Procesando solicitud de retiro'
      );

      // 2. Llamar al servicio pasando el ID del método pre-configurado
      const payout = await PayoutService.requestPayout(
        userId,
        validatedData.amount,
        validatedData.currency,
        validatedData.payoutMethodId
      );

      res.status(201).json({
        success: true,
        message: 'Solicitud de retiro creada. El monto ha sido reservado de su saldo disponible.',
        data: payout,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('. ');
        return next(new AppError(`Error de validación: ${message}`, 400));
      }
      next(error);
    }
  }

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
