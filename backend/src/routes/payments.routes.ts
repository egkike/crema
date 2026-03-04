import { Router } from 'express';

import { optionalJwtAuth, jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import * as PaymentController from '../controllers/payment.controller';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();

// --- RUTA ÚNICA DE CREACIÓN ---
// El body debe incluir gatewayId ('mercadopago' o 'simulator')
router.post('/checkout/create', optionalJwtAuth, PaymentController.createPaymentPreference);

// --- WEBHOOKS (Receptores) ---
router.post('/webhook/:gatewayId', PaymentController.handleProviderWebhook);

// --- SUSCRIPCIONES ---
// Cambiamos la ruta para que sea más genérica si quieres, o mantenemos la lógica
router.post('/subscribe/:planId', jwtAuthMiddleware, async (req, res, next) => {
  try {
    const planId = req.params.planId as string;
    const user = (req as any).user;
    const userEmail = String(user.email);

    // 1. Obtenemos el gatewayId del body, o por defecto 'mercadopago'
    // Esto te permite testear con el simulator desde el frontend fácilmente
    const gatewayId = req.body.gatewayId || 'mercadopago';

    // 2. Ahora pasamos los 4 argumentos requeridos
    const result = await SubscriptionService.createSubscriptionLink(
      user.id,
      planId,
      userEmail,
      gatewayId
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * Cancelar suscripción activa en Pasarela
 */
router.post('/subscription/cancel', jwtAuthMiddleware, async (req, res, next) => {
  try {
    const user = (req as any).user;
    const result = await SubscriptionService.cancelSubscription(user.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
