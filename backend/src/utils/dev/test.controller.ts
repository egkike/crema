import { Request, Response, NextFunction } from 'express';

import pool from '../../db/postgres';
import { orderRepository } from '../../repositories/order.repository';
import { productRepository } from '../../repositories/product.repository';
import { CommissionService } from '../../services/commission.service';
import { ReleaseService } from '../../services/release.service';
import { AppError } from '../../errors/AppError';
import logger from '../logger'; // <--- Ahora sí lo usaremos

export const testController = {
  /**
   * 1. Procesar Comisiones Manualmente
   */
  processCommissions: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.body;
      if (!orderId) throw new AppError('orderId es requerido', 400);

      logger.info({ orderId }, 'TEST: Iniciando procesamiento manual de comisiones');

      const order = await orderRepository.getById(orderId);
      if (!order) throw new AppError('Orden no encontrada', 404);

      const product = await productRepository.getProductById(order.product_id);
      if (!product) throw new AppError('Producto no encontrado', 404);

      const result = await CommissionService.processOrderCommissions(order, product);

      logger.info({ orderId, result }, 'TEST: Comisiones procesadas con éxito');

      res.status(200).json({
        success: true,
        message: 'Comisiones calculadas y enviadas a saldo PENDIENTE',
        data: result,
      });
    } catch (error: any) {
      logger.error(
        { orderId: req.body.orderId, error: error.message },
        'TEST: Error en processCommissions'
      );
      next(error);
    }
  },

  /**
   * 2. Forzar Liberación de Saldo (Viaje en el tiempo)
   */
  forceRelease: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orderId } = req.body;
      if (!orderId) throw new AppError('orderId es requerido', 400);

      logger.warn({ orderId }, 'TEST: Forzando envejecimiento de orden para liberación');

      await pool.query(`UPDATE orders SET updated_at = NOW() - INTERVAL '8 days' WHERE id = $1`, [
        orderId,
      ]);

      const stats = await ReleaseService.processPendingBalances();

      logger.info({ stats }, 'TEST: Proceso de liberación forzada completado');

      res.status(200).json({
        success: true,
        message: 'Orden envejecida y fondos movidos a saldo DISPONIBLE',
        stats,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'TEST: Error en forceRelease');
      next(error);
    }
  },

  /**
   * 3. Reset de Balance
   */
  resetBalance: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.body;
      if (!userId) throw new AppError('userId es requerido', 400);

      logger.info({ userId }, 'TEST: Reseteando balance de usuario');

      await pool.query(
        `UPDATE user_balances SET total_earned = 0, available_balance = 0, pending_balance = 0 WHERE user_id = $1`,
        [userId]
      );

      res.status(200).json({ success: true, message: 'Balances reseteados a 0' });
    } catch (error: any) {
      logger.error(
        { userId: req.body.userId, error: error.message },
        'TEST: Error en resetBalance'
      );
      next(error);
    }
  },
};
