import { Request, Response } from 'express';

import { StatsService } from '../services/stats.service';
import { ExportService } from '../services/export.service';
import { PayoutService } from '../services/payout.service';
import { adminRepository } from '../repositories/admin.repository';
import { payoutRepository } from '../repositories/payout.repository';
import { systemRepository } from '../repositories/system.repository';
import logger from '../utils/logger';
import { AppError } from '../errors/AppError';

export class AdminController {
  /**
   * Helper para validar moneda obligatoria
   */
  private static validateCurrency(currency: unknown): string {
    if (!currency) {
      throw new AppError('La moneda (currency) es obligatoria para esta consulta.', 400);
    }
    if (Array.isArray(currency)) {
      throw new AppError('La moneda (currency) debe ser un solo valor.', 400);
    }
    const currencyStr = typeof currency === 'string' ? currency : String(currency);
    if (!currencyStr) {
      throw new AppError('La moneda (currency) es obligatoria para esta consulta.', 400);
    }
    return currencyStr;
  }

  /**
   * Descarga el Reporte Fiscal / Libro IVA Ventas (Mendoza 2026)
   * Cruza CUIT del creador con retenciones desglosadas.
   */
  static async downloadTaxReport(req: Request, res: Response) {
    try {
      const currency = AdminController.validateCurrency(req.query.currency);
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      const csv = await ExportService.exportTaxAuditToCSV(currency, from, to);

      const filename = `reporte_fiscal_${currency.toUpperCase()}_${from || 'inicio'}_al_${to || 'hoy'}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      return res.send(csv);
  } catch (error: unknown) {
    const status = error instanceof AppError ? error.statusCode : 500;
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, 'Error al exportar reporte fiscal');
    return res.status(status).json({ message: errorMessage || 'Error al generar reporte' });
  }
  }

  /**
   * Obtiene resumen de retenciones por tipo (IVA, IIBB, etc.)
   * Útil para mostrar gráficos de torta/barras en el Dashboard.
   */
  static async getRetentionSummary(req: Request, res: Response) {
    try {
      const currency = AdminController.validateCurrency(req.query.currency);
      const summary = await adminRepository.getRetentionSummary(currency);

      return res.json({ status: 'success', data: summary });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Resumen de salud financiera global con soporte de fechas
   */
  static async getFinancialHealth(req: Request, res: Response) {
    try {
      const currency = AdminController.validateCurrency(req.query.currency);
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      const healthReport = await StatsService.getAdminHealthCheck(currency, from, to);

      return res.json({ status: 'success', data: healthReport });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Obtiene el Libro de Caja consolidado
   */
  static async getPlatformLedger(req: Request, res: Response) {
    try {
      const currency = AdminController.validateCurrency(req.query.currency);
      const from = typeof req.query.from === 'string' ? req.query.from : undefined;
      const to = typeof req.query.to === 'string' ? req.query.to : undefined;

      const ledger = await adminRepository.getPlatformLedger(currency, from, to);

      return res.json({ status: 'success', data: ledger });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Exporta la auditoría de conciliación de órdenes a CSV
   */
  static async downloadFinancialAudit(req: Request, res: Response) {
    try {
      const currency = AdminController.validateCurrency(req.query.currency);
      const csv = await ExportService.exportFinancialAuditCSV(currency);

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=auditoria_financiera_${currency.toUpperCase()}_${dateStr}.csv`
      );

      return res.send(csv);
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Exporta el historial de reembolsos para contabilidad
   */
  static async downloadRefundsReport(req: Request, res: Response) {
    try {
      // 1. Validamos la moneda (usando tu helper estricto)
      const currency = AdminController.validateCurrency(req.query.currency);

      // 2. Se la pasamos al ExportService
      const csv = await ExportService.exportRefundsToCSV(currency);

      const dateStr = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=reporte_reembolsos_${currency.toUpperCase()}_${dateStr}.csv`
      );

      return res.send(csv);
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const safeMessage = errorMessage || 'Error al generar reporte';
      logger.error({ error: safeMessage }, 'Error al exportar reembolsos');
      return res.status(status).json({ message: safeMessage });
    }
  }

  /**
   * Obtiene estadísticas de un creador específico
   */
  static async getUserStats(req: Request, res: Response) {
    try {
      // 1. Extraemos y validamos el userId (debe ser un string único)
      const userIdParam = req.params.userId;

      if (!userIdParam || typeof userIdParam !== 'string') {
        throw new AppError('ID de usuario requerido y debe ser un texto válido', 400);
      }

      const userId: string = userIdParam;

      // 2. Usamos el helper para la moneda (que ya devuelve string)
      const currency = AdminController.validateCurrency(req.query.currency);

      // 3. Ahora ambos argumentos son estrictamente 'string'
      const stats = await StatsService.getCreatorStats(userId, currency);

      return res.json({
        status: 'success',
        data: stats,
      });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Error al exportar estadística del creador');
      return res.status(status).json({ message: errorMessage || 'Error al generar reporte' });
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMessage, status: req.query.status },
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
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Carga un log de actividad I+D para auditoría LEC.
   * Vincula horas de desarrollo con un commit real de Git.
   */
  static async logRDActivity(req: Request, res: Response) {
    try {
      const { projectId, developerId, hoursSpent, taskDescription, codeCommitRef } = req.body;

      // Validaciones básicas
      if (!projectId || !developerId || !hoursSpent) {
        throw new AppError('Datos de proyecto, desarrollador y horas son obligatorios.', 400);
      }

      const log = await adminRepository.createRDLog({
        projectId,
        developerId,
        hoursSpent: Number(hoursSpent),
        taskDescription,
        codeCommitRef,
      });

      return res.status(201).json({
        status: 'success',
        message: 'Actividad de I+D registrada correctamente.',
        data: log,
      });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Obtiene el estado de cumplimiento del 3% (I+D vs Facturación).
   * Este es el "semáforo" para el ingreso al Régimen Nacional.
   */
  static async getLECCertificationStatus(req: Request, res: Response) {
    try {
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();

      // Obtenemos el costo hora desde system_settings (ej: 'internal_dev_hourly_rate')
      const hourlyRateStr = await systemRepository.getSetting('internal_dev_hourly_rate', '30000');
      const hourlyRate = parseFloat(hourlyRateStr);

      const metrics = await adminRepository.getLECMetrics(month, year, hourlyRate);

      return res.json({
        status: 'success',
        data: {
          ...metrics,
          targetRatio: 3.0,
          isCompliant: metrics.complianceRatio >= 3.0,
          currency: 'ARS', // La ley nacional se evalúa sobre base imponible local
        },
      });
    } catch (error: unknown) {
      const status = error instanceof AppError ? error.statusCode : 500;
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(status).json({ message: errorMessage });
    }
  }

  /**
   * Lista proyectos de innovación para el selector del panel.
   */
  static async getRDProjects(_req: Request, res: Response) {
    try {
      const projects = await adminRepository.getRDProjects();
      return res.json({ status: 'success', data: projects });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: errorMessage });
    }
  }
}
