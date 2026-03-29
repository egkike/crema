# User Stories + Acceptance Criteria
## Pasarela de Pagos Crypto (USDT) - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Change**: crypto-usdt-gateway  
**Estado**: Draft

---

## 1. Autenticación y Configuración

### US-01: Configurar wallet USDT como método de cobro

**Como** creador de contenido,  
**quiero** configurar mi dirección de wallet USDT y red (TRC20/BEP20) como método de cobro,  
**para** poder recibir pagos en criptomonedas por mis productos.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-01.1 | El usuario puede agregar una wallet USDT con dirección y red |
| AC-01.2 | La red debe ser TRC20 o BEP20 (no ERC20 para payouts) |
| AC-01.3 | El sistema valida que la dirección sea válida para la red seleccionada |
| AC-01.4 | El usuario puede tener múltiples wallets USDT configuradas |
| AC-01.5 | Las wallets se almacenan en `user_payout_methods` con `currency = 'USDT'` |

---

### US-02: Crear producto en USDT

**Como** creador de contenido,  
**quiero** crear un producto con precio en USDT,  
**para** vender mis cursos digitales en criptomonedas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-02.1 | El usuario puede seleccionar USDT como moneda del producto |
| AC-02.2 | El sistema valida que el creador tenga al menos una wallet USDT configurada |
| AC-02.3 | El precio se muestra en USDT (símbolo ₮) |
| AC-02.4 | El producto aparece en el marketplace solo para afiliados con wallet USDT |

---

## 2. Proceso de Compra

### US-03: Ver opción de pago USDT en checkout

**Como** comprador,  
**quiero** ver la opción de pagar con USDT al comprar un producto en USDT,  
**para** poder elegir mi método de pago preferido.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-03.1 | En el checkout, si el producto está en USDT, se muestra la opción "Pagar con USDT" |
| AC-03.2 | Las opciones de pago se filtran por la moneda del producto |
| AC-03.3 | El comprador ve el monto total en USDT antes de confirmar |

---

### US-04: Iniciar pago con Blockonomics

**Como** comprador,  
**quiero** ser redirigido a la página de pago de Blockonomics al seleccionar USDT,  
**para** completar mi pago en criptomonedas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-04.1 | Al seleccionar "Pagar con USDT", se crea una invoice en Blockonomics |
| AC-04.2 | El comprador es redirigido a la URL de pago de Blockonomics |
| AC-04.3 | La orden se crea en estado "pending" |
| AC-04.4 | Si Blockonomics no responde, se muestra error con opción de retry |

---

### US-05: Confirmar pago via webhook

**Como** sistema,  
**quiero** recibir la notificación de Blockonomics cuando se confirme el pago,  
**para** activar el acceso del comprador al producto.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-05.1 | El endpoint `/api/payments/webhook/blockonomics` recibe notificaciones |
| AC-05.2 | Se valida la firma del webhook (X-Webhook-Signature) |
| AC-05.3 | Al confirmar pago, la orden cambia a "completed" |
| AC-05.4 | Se activan los accesos del comprador al producto |
| AC-05.5 | Se registra la transacción en `order_transactions` |

---

### US-06: Manejar pago expirado

**Como** comprador,  
**quiero** saber que mi pago expiró si no completé la transferencia en 30 minutos,  
**para** intentar nuevamente o elegir otro método.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-06.1 | La orden expira después de 30 minutos sin confirmación |
| AC-06.2 | La orden cambia a estado "expired" |
| AC-06.3 | El comprador puede iniciar un nuevo pago |
| AC-06.4 | Se muestra mensaje claro de que el pago expiró |

---

## 3. Comisiones y Garantías

### US-07: Aplicar garantía cero para pagos crypto

**Como** sistema,  
**quiero** que los pagos con crypto tengan garantía = 0 días,  
**para** reflejar que las transacciones crypto son irreversibles.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-07.1 | Al crear orden con pasarela blockonomics, `days_of_guarantee_applied = 0` |
| AC-07.2 | El campo `release_at` de la orden es igual a `created_at` (inmediato) |
| AC-07.3 | Los refunds automáticos siempre se deniegan para órdenes con garantía = 0 |
| AC-07.4 | El usuario ve mensaje "Sin garantía de reembolso" al pagar con USDT |

---

### US-08: Registrar comisión estimada de Blockonomics

**Como** administrador,  
**quiero** registrar el 1% de comisión estimado por cada transacción Blockonomics,  
**para** provisión contable mensual.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-08.1 | Al confirmar pago, se registra `gatewayFee = monto * 0.01` |
| AC-08.2 | El `gatewayTax` se registra como 0 |
| AC-08.3 | Se genera reporte mensual de provisión de fees |

---

## 4. Suscripciones (No soportado)

### US-09: Suscripciones no disponibles en USDT

**Como** comprador,  
**quiero** saber que no puedo comprar suscripciones Pro con USDT,  
**para** elegir otro método de pago.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-09.1 | Al intentar crear suscripción con pasarela blockonomics, se muestra error |
| AC-09.2 | El mensaje indica que las suscripciones no están disponibles en USDT |
| AC-09.3 | Solo se muestran pasarelas con `supports_subscriptions = true` para suscripciones |

---

## 5. Payouts

### US-10: Solicitar retiro en USDT

**Como** creador/afiliado,  
**quiero** solicitar mi ganancia en USDT a mi wallet,  
**para** recibir mis earnings en criptomonedas.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-10.1 | El usuario puede solicitar payout en USDT |
| AC-10.2 | El sistema valida que tenga wallet USDT configurada |
| AC-10.3 | El monto se descuenta de su balance en USDT |
| AC-10.4 | El admin puede aprobar y registrar el transactionHash |

---

## 6. Configuración Administrativa

### US-11: Habilitar pasarela Blockonomics

**Como** administrador,  
**quiero** habilitar/deshabilitar la pasarela de USDT desde la configuración,  
**para** activar o desactivar pagos crypto.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-11.1 | La pasarela blockonomics se registra en `payment_gateways` |
| AC-11.2 | Se puede cambiar `is_active` desde la configuración |
| AC-11.3 | Si está inactiva, no aparece en checkout |

---

### US-12: Configurar variables de Blockonomics

**Como** administrador,  
**quiero** configurar API Key y callbacks de Blockonomics,  
**para** conectar la pasarela correctamente.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-12.1 | Se pueden configurar: BLOCKONOMICS_API_KEY, BLOCKONOMICS_STORE_ID |
| AC-12.2 | Se puede configurar BLOCKONOMICS_CALLBACK_URL |
| AC-12.3 | El provider valida que las variables existan al inicializar |
| AC-12.4 | Si faltan variables requeridas, el provider lanza error |

---

## 7. Testing y QA

### US-13: Testing con pago simulado

**Como** tester,  
**quiero** poder probar el flujo completo con el Simulator,  
**para** verificar la integración sin usar crypto real.

#### Acceptance Criteria

| Criterio | Descripción |
|----------|-------------|
| AC-13.1 | El Simulator sigue funcionando igual que antes |
| AC-13.2 | Se pueden crear órdenes de prueba en USDT con Simulator |
| AC-13.3 | El webhook simulado funciona correctamente |

---

## Resumen de User Stories

| ID | User Story | Prioridad | Estimación |
|----|------------|-----------|-------------|
| US-01 | Configurar wallet USDT | Alta | 2h |
| US-02 | Crear producto en USDT | Alta | 1h |
| US-03 | Ver opción USDT en checkout | Alta | 1h |
| US-04 | Iniciar pago con Blockonomics | Alta | 3h |
| US-05 | Confirmar pago via webhook | Alta | 2h |
| US-06 | Manejar pago expirado | Media | 1h |
| US-07 | Garantía cero para crypto | Alta | 1h |
| US-08 | Registrar comisión estimada | Media | 1h |
| US-09 | Suscripciones no disponibles | Media | 0.5h |
| US-10 | Solicitar retiro en USDT | Alta | 2h |
| US-11 | Habilitar pasarela | Alta | 0.5h |
| US-12 | Configurar variables | Alta | 0.5h |
| US-13 | Testing con Simulator | Alta | 1h |

---

**Documento basado en**: PRD-Pasarela-Crypto-USDT.md v2.4  
**Próximo paso**: Technical Specification Document (TSD)
