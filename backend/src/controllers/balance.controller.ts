import { Request, Response, NextFunction } from 'express';

import { balanceRepository } from '../repositories/balance.repository';
import { historyRepository } from '../repositories/history.repository';
import { StatsService } from '../services/stats.service';
import { AppError } from '../errors/AppError';

export class BalanceController {
  /**
   * Dashboard: Obtiene las métricas principales (Totales, Disponible, Pendiente)
   */
  async getDashboardStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const currency = (req.query.currency as string) || 'ARS';

      // Ejecutamos ambas en paralelo para que el dashboard cargue rápido
      const [mainStats, chartData] = await Promise.all([
        StatsService.getCreatorStats(userId, currency),
        StatsService.getLastSevenDaysSales(userId, currency),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          ...mainStats,
          chart: chartData,
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * Obtiene todos los balances del usuario (una fila por moneda)
   */
  async getMyBalance(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Usuario no autenticado', 401);
      }

      const balances = await balanceRepository.getAllBalancesByUserId(userId);

      return res.status(200).json({
        success: true,
        data: balances,
      });
    } catch (error: unknown) {
      next(error);
    }
  }

  /**
   * Obtiene la lista de movimientos financieros con paginación y filtros
   */
  async getMyHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError('Usuario no autenticado', 401);
      }

      const limit = Number(req.query.limit) || 20;
      const offset = Number(req.query.offset) || 0;
      const currency = req.query.currency as string | undefined;

      const { data, total } = await historyRepository.getByUserIdWithCount(
        userId,
        limit,
        offset,
        currency
      );

      return res.status(200).json({
        success: true,
        data,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + data.length < total,
        },
      });
    } catch (error: unknown) {
      next(error);
    }
  }
}

export const balanceController = new BalanceController();
