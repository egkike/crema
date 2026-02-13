import { Router } from 'express';

import { AdminController } from '../controllers/admin.controller';
import { payoutRepository } from '../repositories/payout.repository';
import { PayoutService } from '../services/payout.service';
import { AppError } from '../errors/AppError';

import { jwtAuthMiddleware } from './../middlewares/auth/jwt.middleware';
import { restrictTo } from './../middlewares/auth/role.middleware';

const router = Router();
const ADMIN_LEVEL = 10;

// Protección Global: Solo administradores nivel 10
router.use(jwtAuthMiddleware);
router.use(restrictTo(ADMIN_LEVEL));

/* --- 1. SALUD FINANCIERA Y AUDITORÍA --- */
router.get('/financial-health', AdminController.getFinancialHealth);
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

    // Casting seguro para obtener el ID del admin desde el token
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

/* --- 3. REEMBOLSOS Y EXPORTACIONES --- */

// 💡 Si necesitas ver los reembolsos en una tabla (JSON), usa un método de lista.
// Si quieres descargar el CSV directamente, este está bien:
router.get('/export/refunds', AdminController.downloadRefundsReport);

router.get('/export/payouts', async (req, res, next) => {
  try {
    // Validamos que los parámetros sean strings para evitar errores de tipo
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;

    const { ExportService } = await import('../services/export.service');

    const csv = await ExportService.exportPayoutsToCSV(status, from, to);

    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_retiros_${new Date().toISOString().split('T')[0]}.csv`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
