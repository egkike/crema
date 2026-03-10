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
router.get('/export/audit', AdminController.downloadFinancialAudit);

/* --- 2. GESTIÓN DE RETIROS (PAYOUTS) --- */
router.get('/payouts/pending', async (req, res, next) => {
  try {
    const payouts = await payoutRepository.getByStatus('pending');
    res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    next(error);
  }
});

router.patch('/payouts/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, transaction_receipt } = req.body;
    const adminId = (req as any).user?.id;

    if (!['completed', 'rejected'].includes(status)) {
      throw new AppError('Estado no válido. Use completed o rejected', 400);
    }

    const result = await PayoutService.updatePayoutStatus(
      id,
      status,
      adminId,
      admin_notes,
      transaction_receipt
    );

    res.status(200).json({
      success: true,
      message: `El retiro ha sido ${status === 'completed' ? 'marcado como pagado' : 'rechazado'} correctamente.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

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

/* --- 3. REEMBOLSOS Y EXPORTACIONES --- */
router.get('/export/refunds', AdminController.downloadRefundsReport);

router.get('/export/payouts', async (req, res, next) => {
  try {
    // 1. Extracción y VALIDACIÓN CRÍTICA
    const { currency, status, from, to } = req.query;

    if (!currency || typeof currency !== 'string') {
      throw new AppError('La moneda (currency) es obligatoria para generar el reporte.', 400);
    }

    // 2. Tipado seguro para los opcionales
    const statusStr = typeof status === 'string' ? status : undefined;
    const fromStr = typeof from === 'string' ? from : undefined;
    const toStr = typeof to === 'string' ? to : undefined;

    // 3. Importación dinámica del servicio
    const { ExportService } = await import('../services/export.service');

    // 4. Llamada al servicio con la moneda validada
    const csv = await ExportService.exportPayoutsToCSV(currency, statusStr, fromStr, toStr);

    // 5. Respuesta con nombre de archivo dinámico
    const dateStr = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_retiros_${currency.toUpperCase()}_${dateStr}.csv`);

    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
