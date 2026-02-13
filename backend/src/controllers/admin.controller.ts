import { Request, Response } from 'express';

import { StatsService } from '../services/stats.service';
import { ExportService } from '../services/export.service';
import { adminRepository } from '../repositories/admin.repository';
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
}
