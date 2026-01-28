import { Router } from 'express';

import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { createPreference } from '../controllers/payment.controller';

const router = Router();

// Ruta protegida: solo usuarios autenticados pueden crear preferencia de pago
router.post('/create-preference', jwtAuthMiddleware, createPreference);

export default router;
