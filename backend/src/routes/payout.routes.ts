import { Router } from 'express';

import { payoutController } from '../controllers/payout.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';

const router = Router();

/**
 * @route POST /api/payouts/request
 * @desc  Solicitar retiro de fondos (Solo usuarios autenticados)
 */
router.post('/request', jwtAuthMiddleware, payoutController.requestPayout);

/**
 * @route GET /api/payouts/me
 * @desc  Ver historial personal de solicitudes de retiro
 */
router.get('/me', jwtAuthMiddleware, payoutController.getMyPayouts);

export default router;
