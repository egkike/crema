import { Router } from 'express';

import { optionalJwtAuth } from '../middlewares/auth/jwt.middleware';
// Importamos el controlador específico de Mercado Pago
import * as MercadoPagoController from '../controllers/mercadopago.controller';

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

export default router;