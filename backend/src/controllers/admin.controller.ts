import { Request, Response } from 'express';

import { StatsService } from '../services/stats.service';
import { ExportService } from '../services/export.service';
import { PayoutService } from '../services/payout.service';
import { adminRepository } from '../repositories/admin.repository';
import { payoutRepository } from '../repositories/payout.repository';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

export class AdminController {
  /**
   * Resumen de salud financiera global con soporte de fechas
   */
  static async getFinancialHealth(req: Request, res: Response) {
    try {
      const currency = typeof req.query.currency === 'string' ? req.query.currency : 'ARS';
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      // Importante: Asegúrate de que StatsService.getAdminHealthCheck reciba estos 3 parámetros
      const healthReport = await StatsService.getAdminHealthCheck(currency, from, to);

      return res.json({
        status: 'success',
        data: healthReport,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en getFinancialHealth');
      return res.status(500).json({ message: 'Error al obtener el reporte de salud' });
    }
  }

  /**
   * Obtiene el Libro de Caja consolidado
   */
  static async getPlatformLedger(req: Request, res: Response) {
    try {
      const currency = typeof req.query.currency === 'string' ? req.query.currency : 'ARS';
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      const ledger = await adminRepository.getPlatformLedger(currency, from, to);

      return res.json({
        status: 'success',
        data: ledger,
      });
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error en getPlatformLedger');
      return res.status(500).json({ message: 'Error al obtener el libro de caja' });
    }
  }

  /**
   * Exporta la auditoría de conciliación de órdenes a CSV
   */
  static async downloadFinancialAudit(req: Request, res: Response) {
    try {
      const currency = typeof req.query.currency === 'string' ? req.query.currency : 'ARS';
      const csv = await ExportService.exportFinancialAuditCSV(currency);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=auditoria_financiera_${currency}_${new Date().toISOString().split('T')[0]}.csv`
      );

      return res.send(csv);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error al exportar auditoría');
      return res.status(500).json({ message: 'Error al generar el archivo CSV' });
    }
  }

  /**
   * Exporta el historial de reembolsos para contabilidad
   */
  static async downloadRefundsReport(req: Request, res: Response) {
    try {
      const csv = await ExportService.exportRefundsToCSV();

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=reporte_reembolsos.csv');

      return res.send(csv);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error al exportar reembolsos');
      return res.status(500).json({ message: 'Error al generar reporte de reembolsos' });
    }
  }

  /**
   * Obtiene estadísticas de un creador específico
   */
  static async getUserStats(req: Request, res: Response) {
    try {
      const userId = req.params.userId as string;
      const currency = typeof req.query.currency === 'string' ? req.query.currency : 'ARS';

      if (!userId) throw new AppError('ID de usuario requerido', 400);

      const stats = await StatsService.getCreatorStats(userId, currency);

      return res.json({
        status: 'success',
        data: stats,
      });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ message: error.message });
    }
  }

  /**
   * Obtiene retiros según su estado (útil para el panel de aprobación)
   */
  static async getPayoutsByStatus(req: Request, res: Response) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
      const payouts = await payoutRepository.getByStatus(status);

      return res.json({
        status: 'success',
        data: payouts,
      });
    } catch (error: any) {
      logger.error(
        { error: error.message, status: req.query.status },
        'Error en getPayoutsByStatus'
      );
      return res.status(500).json({ message: 'Error al obtener las solicitudes de retiro' });
    }
  }

  /**
   * Procesa un retiro (Completar o Rechazar)
   */
  static async processPayout(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, adminNotes, transactionReceipt } = req.body;
      const adminId = req.user?.id;
      if (!adminId) throw new AppError('Sesión de administrador no válida', 401);
      
      if (!['completed', 'rejected'].includes(status)) {
        throw new AppError('Estado no válido', 400);
      }

      const result = await PayoutService.updatePayoutStatus(
        id as string,
        status,
        adminId,
        adminNotes,
        transactionReceipt
      );

      return res.json({ status: 'success', data: result });
    } catch (error: any) {
      const status = error instanceof AppError ? error.statusCode : 500;
      return res.status(status).json({ message: error.message });
    }
  }
}
