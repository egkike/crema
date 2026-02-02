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
    const { status } = req.body;
    const adminId = (req as any).user.id;

    if (!['completed', 'rejected'].includes(status)) {
      throw new AppError('Estado no válido. Use completed o rejected', 400);
    }

    // LOG CRÍTICO: Registramos la acción administrativa antes de ejecutarla
    logger.warn(
      { adminId, payoutId: id, newStatus: status },
      `ADMIN: Intentando cambiar estado de retiro a ${status}`
    );

    const result = await PayoutService.updatePayoutStatus(id, status, adminId);

    logger.info(
      { adminId, payoutId: id, status: result.status },
      'ADMIN: Cambio de estado completado exitosamente'
    );

    res.status(200).json({
      success: true,
      message: `El retiro ha sido ${status === 'completed' ? 'aprobado' : 'rechazado'} correctamente.`,
      data: result,
    });
  } catch (error: any) {
    // Log de error para administración
    logger.error(
      { adminId: (req as any).user?.id, payoutId: req.params.id, error: error.message },
      'ADMIN: Falló la actualización del retiro'
    );
    next(error);
  }
});

export default router;
