import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { PayoutService } from '../services/payout.service';
import { payoutRepository } from '../repositories/payout.repository'; // Importamos el repo
import { requestPayoutSchema } from '../schemas/payout.schema';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

class PayoutController {
  /**
   * Crea una solicitud de retiro
   */
  async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      // 1. Validar cuerpo de la petición con Zod
      const validatedData = requestPayoutSchema.parse(req.body);

      logger.info(
        { userId, amount: validatedData.amount, currency: validatedData.currency },
        'Iniciando solicitud de retiro'
      );

      // 2. Llamar al servicio (El servicio se encarga de validar el saldo y la transacción)
      const payout = await PayoutService.requestPayout(
        userId,
        validatedData.amount,
        validatedData.currency,
        validatedData.destination
      );

      res.status(201).json({
        success: true,
        message:
          'Solicitud de retiro creada correctamente. Su saldo disponible ha sido actualizado.',
        data: payout,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map(i => i.message).join('. ');
        return next(new AppError(`Error de validación: ${message}`, 400));
      }
      next(error);
    }
  }

  /**
   * Obtiene las solicitudes de retiro del usuario (Historial de Payouts)
   */
  async getMyPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      // Usamos el repositorio que ya tiene el mapeo y orden correcto
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
