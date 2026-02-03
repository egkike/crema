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

      // 1. Validar cuerpo de la petición con el nuevo esquema detallado
      const validatedData = requestPayoutSchema.parse(req.body);

      logger.info(
        { userId, amount: validatedData.amount, currency: validatedData.currency },
        '💰 Procesando solicitud de retiro'
      );

      // 2. Llamar al servicio con el nuevo objeto de datos
      // Separamos el amount y currency del resto de los datos bancarios
      const { amount, currency, ...bankData } = validatedData;

      const payout = await PayoutService.requestPayout(
        userId,
        amount,
        currency,
        bankData // Esto contiene destination_account, tax_id, alias, etc.
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
