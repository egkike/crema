import { Router } from 'express';

import { PayoutService } from '../services/payout.service';
import { payoutRepository } from '../repositories/payout.repository';
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
    // Log de auditoría: quién está consultando los pendientes
    logger.info({ adminId }, 'ADMIN: Consultando retiros pendientes');

    const payouts = await payoutRepository.getByStatus('pending');
    res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PATCH /api/admin/payouts/:id/status
 */
router.patch('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_notes } = req.body; // <-- Capturamos las notas
    const adminId = (req as any).user.id;

    if (!['completed', 'rejected'].includes(status)) {
      throw new AppError('Estado no válido. Use completed o rejected', 400);
    }

    logger.warn(
      { adminId, payoutId: id, newStatus: status, admin_notes },
      `ADMIN: Intentando cambiar estado de retiro a ${status}`
    );

    // Pasamos admin_notes al servicio
    const result = await PayoutService.updatePayoutStatus(id, status, adminId, admin_notes);

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

export default router;
