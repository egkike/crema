import { Router } from 'express';

import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { processRefund } from '../controllers/refund.controller';

const router = Router();

/**
 * Ruta para procesar reembolsos.
 * POST /api/refunds/:orderId
 * Protegida: Solo usuarios con token válido.
 */
router.post('/:orderId', jwtAuthMiddleware, processRefund);

export default router;
