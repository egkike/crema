import { Router } from 'express';

import { payoutController } from '../controllers/payout.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { enforceFullAuth } from '../middlewares/auth/password.middleware'; // Importante para la seguridad financiera

const router = Router();

// Aplicamos los middlewares a todas las rutas del archivo
router.use(jwtAuthMiddleware);
router.use(enforceFullAuth); 

/**
 * @route POST /api/payouts
 * @desc  Solicitar retiro de fondos
 */
router.post('/', payoutController.requestPayout);

/**
 * @route GET /api/payouts/me
 * @desc  Ver historial personal de solicitudes de retiro
 */
router.get('/me', payoutController.getMyPayouts);

export default router;