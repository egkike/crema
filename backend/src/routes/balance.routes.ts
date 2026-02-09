import { Router } from 'express';

import { balanceController } from '../controllers/balance.controller';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';

const router = Router();

/**
 * Todas las rutas de balance requieren token JWT
 */
router.use(jwtAuthMiddleware);

// 1. Estadísticas para el Dashboard (Totales + Gráfico)
router.get('/stats', (req, res, next) => balanceController.getDashboardStats(req, res, next));

// 2. Balances actuales por moneda (Disponible, Pendiente, etc.)
router.get('/me', (req, res, next) => balanceController.getMyBalance(req, res, next));

// 3. Historial de movimientos paginado
router.get('/history', (req, res, next) => balanceController.getMyHistory(req, res, next));

export default router;
