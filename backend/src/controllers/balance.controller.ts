import { Request, Response, NextFunction } from 'express';

import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { AppError } from '../errors/AppError';

export class BalanceController {
  /**
   * Obtiene todos los balances del usuario (una fila por moneda)
   */
  async getMyBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new AppError('Usuario no autenticado', 401);
      }

      // Cambiamos 'getByUserId' por 'getAllBalancesByUserId' que devuelve un array [ARS, USDT, etc]
      const balances = await balanceRepository.getAllBalancesByUserId(userId);

      return res.status(200).json({
        success: true,
        data: balances,
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
      const userId = (req as any).user?.id;

      if (!userId) {
        throw new AppError('Usuario no autenticado', 401);
      }

      // Extraemos query params para paginación opcional
      const limit = Number(req.query.limit) || 20;
      const offset = Number(req.query.offset) || 0;

      // Usamos el método correcto del historyRepository
      const history = await historyRepository.getByUserId(userId, limit, offset);

      return res.status(200).json({
        success: true,
        data: history,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const balanceController = new BalanceController();
