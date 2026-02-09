import { Router } from 'express';

import { PayoutService } from '../services/payout.service';
import { ExportService } from '../services/export.service';
import { payoutRepository } from '../repositories/payout.repository';
import { adminRepository } from '../repositories/admin.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

import { jwtAuthMiddleware } from './../middlewares/auth/jwt.middleware';
import { restrictTo } from './../middlewares/auth/role.middleware';

const router = Router();

// Definimos el nivel de administrador
const ADMIN_LEVEL = 10;

// Middleware global para este router
router.use(jwtAuthMiddleware);
router.use(restrictTo(ADMIN_LEVEL));

/**
 * @route GET /api/admin/payouts/pending
 */
router.get('/pending', async (req, res, next) => {
  try {
    const adminId = (req as any).user.id;
    logger.info({ adminId }, 'ADMIN: Consultando retiros pendientes');

    const payouts = await payoutRepository.getByStatus('pending');
    res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PATCH /api/admin/payouts/:id/status
 * @desc Aprueba o rechaza un retiro. Si se aprueba, requiere transaction_receipt.
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    // Capturamos transaction_receipt además de notas y status
    const { status, admin_notes, transaction_receipt } = req.body;
    const adminId = (req as any).user.id;

    if (!['completed', 'rejected'].includes(status)) {
      throw new AppError('Estado no válido. Use completed o rejected', 400);
    }

    logger.warn(
      { adminId, payoutId: id, newStatus: status, receipt: transaction_receipt },
      `ADMIN: Procesando cambio de estado de retiro`
    );

    // Pasamos los argumentos al servicio en el orden correcto:
    // payoutId, status, adminId, admin_notes, transaction_receipt
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
  } catch (error: any) {
    logger.error(
      { adminId: (req as any).user?.id, payoutId: req.params.id, error: error.message },
      'ADMIN: Falló la actualización del retiro'
    );
    next(error);
  }
});

/**
 * @route GET /api/admin/stats
 * @desc Resumen financiero global (opcionalmente filtrado por moneda)
 */
router.get('/stats', async (req, res, next) => {
  try {
    const { currency } = req.query;
    const stats = await adminRepository.getGlobalFinancialStats((currency as string) || 'ARS');

    res.status(200).json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    next(error);
  }
});

/**
 * @route GET /api/admin/refunds
 * @desc Lista de reembolsos recientes para control administrativo
 */
router.get('/refunds', async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const refunds = await adminRepository.getRecentRefunds(limit);

    res.status(200).json({
      success: true,
      data: refunds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/admin/export/refunds
 * @desc Descarga un archivo CSV con los reembolsos
 */
router.get('/export/refunds', async (req, res, next) => {
  try {
    const csv = await ExportService.exportRefundsToCSV();

    const date = new Date().toISOString().split('T')[0];
    res.header('Content-Type', 'text/csv');
    res.attachment(`reporte_reembolsos_${date}.csv`);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/admin/export/payouts
 * @desc Descarga un archivo CSV con los retiros (opcionalmente filtrado por estado y rango de fechas)
 */
router.get('/export/payouts', async (req, res, next) => {
  try {
    const { status, from, to } = req.query;

    const csv = await ExportService.exportPayoutsToCSV(
      status as string,
      from as string,
      to as string
    );

    const date = new Date().toISOString().split('T')[0];
    const fileName = `reporte_retiros_${status || 'todos'}_${from || ''}_al_${to || date}.csv`;

    res.header('Content-Type', 'text/csv');
    res.attachment(fileName);
    return res.send(csv);
  } catch (error) {
    next(error);
  }
});

export default router;
