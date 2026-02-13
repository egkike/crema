import { Request, Response } from 'express';

import { StatsService } from '../services/stats.service';
import { ExportService } from '../services/export.service';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

export class AdminController {
  /**
   * Resumen de salud financiera global
   */
  static async getFinancialHealth(req: Request, res: Response) {
    try {
      // ✅ Solución: Forzamos a string y definimos un fallback
      const currency = typeof req.query.currency === 'string' ? req.query.currency : 'ARS';

      const healthReport = await StatsService.getAdminHealthCheck(currency);

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
      // ✅ Para params usamos casting simple ya que Express garantiza que sea string si la ruta existe
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
