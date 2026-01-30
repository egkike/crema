import { Router } from 'express';

import { payoutController } from '../controllers/payout.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';

const router = Router();

/**
 * @route POST /api/payouts/request
 * @desc  Solicitar retiro de fondos
 */
router.post('/request', jwtAuthMiddleware, (req, res, next) =>
  payoutController.requestPayout(req, res, next)
);

/**
 * @route GET /api/payouts/me
 * @desc  Ver mis solicitudes de retiro
 */
router.get('/me', jwtAuthMiddleware, (req, res, next) =>
  payoutController.getMyPayouts(req, res, next)
);

export default router;
