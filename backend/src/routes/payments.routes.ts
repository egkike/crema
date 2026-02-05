import { Router } from 'express';

import { optionalJwtAuth } from '../middlewares/auth/jwt.middleware';
import { createPaymentPreference } from '../controllers/payment.controller';

const router = Router();

// Ruta protegida: solo usuarios autenticados pueden crear preferencia de pago
router.post('/create-preference', optionalJwtAuth, createPaymentPreference);

export default router;
