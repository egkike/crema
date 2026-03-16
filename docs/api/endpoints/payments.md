# Endpoints: Payments

## Overview

Gestión de pagos, checkout y suscripciones.

## Endpoints

---

### Create Payment Preference

```
POST /api/payments/checkout/create
```

Crea una preferencia de pago para checkout.

**Autenticación:** Opcional

**Request Body:**

```json
{
  "product_id": "uuid",
  "coupon_code": "DESCUENTO10",
  "gatewayId": "mercadopago"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "preference_id": "mla-123456789",
    "init_point": "https://www.mercadopago.com.ar/...",
    "sandbox_init_point": "https://sandbox.mercadopago.com.ar/..."
  }
}
```

---

### Handle Webhook

```
POST /api/payments/webhook/:gatewayId
```

Recibe notificaciones de pago del gateway.

**Autenticación:** No requerida (usa firma del gateway)

**Request Body:** Depends on gateway (Mercado Pago webhook payload)

**Response (200):**

```json
{
  "success": true
}
```

---

### Subscribe to Plan

```
POST /api/payments/subscribe/:planId
```

Crea una suscripción a un plan.

**Autenticación:** Requiere access token

**Request Body:**

```json
{
  "gatewayId": "mercadopago"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "subscription_id": "sub-uuid",
    "status": "pending",
    "init_point": "https://..."
  }
}
```

---

### Cancel Subscription

```
POST /api/payments/subscription/cancel
```

Cancela una suscripción activa.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "message": "Suscripción cancelada"
}
```

---

## Flujo de Pago

```
1. Cliente → POST /api/payments/checkout/create
2. Servidor → Crea preferencia en Mercado Pago
3. Servidor → Retorna init_point (URL de pago)
4. Cliente → Redirige a init_point
5. Cliente → Paga en Mercado Pago
6. Mercado Pago → POST /api/payments/webhook/mercadopago
7. Servidor → Procesa webhook, actualiza orden
8. Cliente → Redirigido a página de éxito
```

---

## Gateways Soportados

| Gateway | ID | Descripción |
|---------|-----|-------------|
| Mercado Pago | `mercadopago` | Principal (Argentina) |
| Simulator | `simulator` | Para testing |

---

## Webhook Events

### Mercado Pago

| Topic | Descripción |
|-------|-------------|
| `payment` | Pago creado/actualizado |
| `subscription` | Suscripción actualizada |

---

## Tipos de Payment

```typescript
type PaymentStatus = 'pending' | 'approved' | 'in_process' | 'rejected' | 'cancelled' | 'refunded';

type PaymentMethod = 'credit_card' | 'debit_card' | 'ticket' | 'bank_transfer' | 'wallet';
```

---

## Ver También

- [Features: Payments](../../features/payments.md)
- [Errores](../errors.md)
