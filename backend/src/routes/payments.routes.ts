import { Router } from 'express';

import { optionalJwtAuth } from '../middlewares/auth/jwt.middleware';
// Importamos los controladores específicos
import * as MercadoPagoController from '../controllers/mercadopago.controller';
import * as SimulatorController from '../controllers/simulator.controller';

const router = Router();

/**
 * RUTAS DE MERCADO PAGO
 */
// Crear preferencia de pago (Checkout)
router.post('/mercadopago/create', optionalJwtAuth, MercadoPagoController.createPaymentPreference);
// Webhook: Recibe notificaciones de pago (Pública, la llama MP)
router.post('/mercadopago/webhook', MercadoPagoController.handleWebhook);

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