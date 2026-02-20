import { Router } from 'express';

import { optionalJwtAuth, jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import * as PaymentController from '../controllers/payment.controller';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();

// --- RUTA ÚNICA DE CREACIÓN ---
// El body debe incluir gatewayId ('mercadopago' o 'simulator')
router.post('/checkout/create', optionalJwtAuth, PaymentController.createPaymentPreference);

// --- WEBHOOKS (Receptores) ---
router.post('/webhook/mercadopago', PaymentController.handleMPWebhook);
router.post('/webhook/simulator', PaymentController.handleSimulatorConfirm);

// --- SUSCRIPCIONES (Exclusivo MP por ahora) ---
router.post('/mercadopago/subscribe/:planId', jwtAuthMiddleware, async (req, res, next) => {
  try {
    // Forzamos que sea string para que TS no se queje
    const planId = req.params.planId as string;
    const user = (req as any).user;

    // Si el email viene de un array por error, tomamos el primero o forzamos string
    const userEmail = String(user.email);

    const result = await SubscriptionService.createSubscriptionLink(user.id, planId, userEmail);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
/**
 * Cancelar suscripción activa en MP
 */
router.post('/mercadopago/cancel', jwtAuthMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user;
    const result = await SubscriptionService.cancelSubscription(user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
