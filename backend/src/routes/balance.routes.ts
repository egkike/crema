import { Router } from 'express';

// Importamos la instancia 'balanceController' en lugar de la función suelta
import { balanceController } from '../controllers/balance.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';

const router = Router();

// Usamos el método de la instancia
router.get('/me', jwtAuthMiddleware, (req, res, next) =>
  balanceController.getMyBalance(req, res, next)
);
// O también para el historial que creamos antes:
router.get('/history', jwtAuthMiddleware, (req, res, next) =>
  balanceController.getMyHistory(req, res, next)
);

export default router;
