import { Request, Response, NextFunction } from 'express';

import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { AppError } from '../errors/AppError';

export class BalanceController {
  /**
   * Obtiene el resumen de saldos del usuario (Total, Disponible, Pendiente)
   */
  async getMyBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        throw new AppError('Usuario no autenticado', 401);
      }

      const balance = await balanceRepository.getByUserId(user.id);

      return res.status(200).json({
        success: true,
        data: balance,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtiene la lista de movimientos financieros del usuario
   */
  async getMyHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as any).user;

      if (!user?.id) {
        throw new AppError('Usuario no autenticado', 401);
      }

      const history = await historyRepository.getByUserId(user.id);

      return res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
}

// Exportamos una instancia para las rutas
export const balanceController = new BalanceController();
