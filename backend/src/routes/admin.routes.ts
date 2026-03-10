import { Router } from 'express';

import { AdminController } from '../controllers/admin.controller';
import { payoutRepository } from '../repositories/payout.repository';
import { PayoutService } from '../services/payout.service';
import { AppError } from '../errors/AppError';

import { jwtAuthMiddleware } from './../middlewares/auth/jwt.middleware';
import { restrictTo } from './../middlewares/auth/role.middleware';

const router = Router();

// Protección Global: Solo administradores nivel 10
router.use(jwtAuthMiddleware);
router.use(restrictTo('ADMIN'));

/* --- 1. SALUD FINANCIERA Y AUDITORÍA --- */
router.get('/financial-health', AdminController.getFinancialHealth);
router.get('/ledger', AdminController.getPlatformLedger);
router.get('/user-stats/:userId', AdminController.getUserStats);

// Resumen de retenciones (IVA/IIBB) para gráficos en el Dashboard
router.get('/retention-summary', AdminController.getRetentionSummary);

/* --- 2. GESTIÓN DE RETIROS (PAYOUTS) --- */
router.get('/payouts/pending', async (req, res, next) => {
  try {
    const payouts = await payoutRepository.getByStatus('pending');
    res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    next(error);
  }
});

router.patch('/payouts/:id/status', AdminController.processPayout);

/**
 * Registro de retiro de fondos de la plataforma (Empresa)
 */
router.post('/withdraw-platform', async (req, res, next) => {
  try {
    const { amount, currency, description, transaction_receipt } = req.body;
    const adminId = (req as any).user?.id;

    if (!amount || !transaction_receipt) {
      throw new AppError('Monto y comprobante son obligatorios', 400);
    }

    const result = await PayoutService.requestPlatformPayout(
      Number(amount),
      currency,
      description || 'Retiro de ganancias',
      transaction_receipt,
      adminId
    );

    res.status(200).json({
      success: true,
      message: 'Retiro de plataforma registrado correctamente',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/* --- 3. EXPORTACIONES (REPORTES CSV) --- */

// El reporte clave para el contador de Mendoza (Libro IVA Ventas)
router.get('/export/tax-report', AdminController.downloadTaxReport);

// Reporte de conciliación (Garantías vs Pagados)
router.get('/export/audit', AdminController.downloadFinancialAudit);

// Historial de reembolsos
router.get('/export/refunds', AdminController.downloadRefundsReport);

// Historial de retiros a usuarios
router.get('/export/payouts', async (req, res, next) => {
  try {
    const { currency, status, from, to } = req.query;

    if (!currency || typeof currency !== 'string') {
      throw new AppError('La moneda (currency) es obligatoria para generar el reporte.', 400);
    }

    const statusStr = typeof status === 'string' ? status : undefined;
    const fromStr = typeof from === 'string' ? from : undefined;
    const toStr = typeof to === 'string' ? to : undefined;

    const { ExportService } = await import('../services/export.service');
    const csv = await ExportService.exportPayoutsToCSV(currency, statusStr, fromStr, toStr);

    const dateStr = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_retiros_${currency.toUpperCase()}_${dateStr}.csv`);

    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
