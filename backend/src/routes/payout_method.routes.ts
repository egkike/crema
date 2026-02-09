import { Router } from 'express';

import * as PayoutMethodController from '../controllers/payout_method.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { enforceFullAuth } from '../middlewares/auth/password.middleware';

const router = Router();

// Todas estas rutas requieren login y haber cambiado la contraseña inicial
router.use(jwtAuthMiddleware);
router.use(enforceFullAuth);

/**
 * @route GET /api/payout-methods
 * @desc Obtener las cuentas de retiro guardadas del usuario
 */
router.get('/', PayoutMethodController.getMyPayoutMethods);

/**
 * @route POST /api/payout-methods/request
 * @desc Iniciar solicitud de cambio (dispara email)
 */
router.post('/request', PayoutMethodController.requestPayoutMethodUpdate);

/**
 * @route GET /api/payout-methods/confirm
 * @desc Confirmar el cambio mediante el token del email
 * (El frontend debe capturar el query param 'token' y pegarle a este endpoint)
 */
router.get('/confirm', PayoutMethodController.confirmPayoutMethodUpdate);

export default router;
