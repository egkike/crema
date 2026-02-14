import { Router } from 'express';

import { optionalJwtAuth, jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import * as MercadoPagoController from '../controllers/mercadopago.controller';
import * as SimulatorController from '../controllers/simulator.controller';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();

/**
 * RUTAS DE MERCADO PAGO
 */
// Crear preferencia de pago (Checkout)
router.post('/mercadopago/create', optionalJwtAuth, MercadoPagoController.createPaymentPreference);
// Webhook: Recibe notificaciones de pago (Pública, la llama MP)
router.post('/mercadopago/webhook', MercadoPagoController.handleWebhook);
// Ruta para que un creador inicie su suscripción al Plan Pro
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

/**
 * RUTAS DE FUTURAS PASARELAS (Ejemplo Lemon Cash)
 * Solo tendrías que descomentar y crear el controlador correspondiente.
 */
// router.post('/lemoncash/create', optionalJwtAuth, LemonCashController.createPayment);
// router.post('/lemoncash/webhook', LemonCashController.handleWebhook);

// --- SIMULADOR (Ideal para probar USDT y comisiones rápido) ---
router.post('/simulator/create', optionalJwtAuth, SimulatorController.createSimulatedPayment);
router.post('/simulator/confirm', SimulatorController.confirmSimulatedPayment);

export default router;
