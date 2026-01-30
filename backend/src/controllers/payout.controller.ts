import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

import { PayoutService } from '../services/payout.service';
import { requestPayoutSchema } from '../schemas/payout.schema';
import { AppError } from '../errors/AppError';

class PayoutController {
  /**
   * Crea una solicitud de retiro
   */
  async requestPayout(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) throw new AppError('Usuario no autenticado', 401);

      // 1. Validar cuerpo de la petición con el Schema de Zod
      const validatedData = requestPayoutSchema.parse(req.body);

      // 2. Llamar al servicio
      const payout = await PayoutService.requestPayout(
        userId,
        validatedData.amount,
        validatedData.currency,
        validatedData.destination
      );

      res.status(201).json({
        success: true,
        message: 'Solicitud de retiro creada correctamente',
        data: payout,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues.map(i => i.message).join(', ');
        return next(new AppError(message, 400));
      }
      // Aquí usamos next, por lo que el linter ya no marcará error
      next(error);
    }
  }

  /**
   * Obtiene las solicitudes de retiro del usuario
   */
  async getMyPayouts(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;
      // Aquí iría la llamada al repositorio, por ahora devolvemos vacío
      res.status(200).json({ success: true, userId, data: [] });
    } catch (error) {
      next(error);
    }
  }
}

// Exportamos la instancia única
export const payoutController = new PayoutController();
