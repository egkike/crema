# Sistema de Pagos

## Overview

El sistema de pagos de Crema integra **Mercado Pago** como pasarela principal, con soporte para múltiples monedas y un motor financiero robusto.

## Arquitectura del Sistema de Pagos

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────┐
│   Cliente    │────►│   API Crema      │────►│ Mercado Pago  │
└──────────────┘     └──────────────────┘     └───────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Órdenes   │
                     │   (orders)  │
                     └──────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
   ┌────────────┐    ┌────────────┐    ┌────────────┐
   │ Comisiones  │    │  Balance   │    │ Platform   │
   │ (creator/   │    │  (user)    │    │ Earnings   │
   │  affiliate) │    │            │    │            │
   └────────────┘    └────────────┘    └────────────┘
```

## Flujo de Pago

### 1. Inicio del Checkout

```
Cliente → POST /api/payments/checkout/create
```

Request:
```json
{
  "product_id": "uuid",
  "coupon_code": "DESCUENTO10",  // opcional
  "gatewayId": "mercadopago"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "preference_id": "mla-123456789",
    "init_point": "https://www.mercadopago.com.ar/..."
  }
}
```

### 2. Redirección al Gateway

El cliente es redirigido a la URL de pago de Mercado Pago.

### 3. Procesamiento del Pago

El cliente completa el pago en el sitio de Mercado Pago.

### 4. Webhook (Notificación)

```
Mercado Pago → POST /api/payments/webhook/mercadopago
```

El servidor recibe la notificación y procesa:
1. Validar firma del webhook
2. Actualizar estado de la orden
3. Crear registro de comisiones
4. Actualizar balances
5. Enviar email de confirmación

### 5. Finalización

El cliente es redirigido a la página de éxito de Crema.

---

## Monedas Soportadas

| Código | Nombre | Símbolo |
|--------|--------|---------|
| `ARS` | Peso Argentino | $ |
| `USD` | Dólar Americano | $ |
| `USDT` | Tether | ₿ |

## Métodos de Pago

### Mercado Pago (Argentina)

| Método | Descripción |
|--------|-------------|
| Tarjeta de crédito | Visa, Mastercard, American Express |
| Tarjeta de débito | Visa Débito, Mastercard Débito |
| Efectivo | Pago en efectivo (Rapipago, PagoFácil) |
| Transferencia | Transferencia bancaria |
| Saldo MP | Wallet de Mercado Pago |

---

## Estados de Orden

```
pending → paid
         ↘ (si hay problema)
         rejected

paid → refunded (si se solicita reembolso)
```

| Estado | Descripción |
|--------|-------------|
| `pending` | Pago iniciado, esperando confirmación |
| `paid` | Pago aprobado |
| `rejected` | Pago rechazado |
| `refunded` | Reembolso procesado |

---

## Cálculo de Comisiones

### Estructura de Comisiones

```
Precio del producto
    │
    ├── Discount (cupón)
    │
    = Amount (base imponible)
          │
          ├── Gateway Fee (ej: 5.99% + $5)
          │
          ├── Gateway Tax (IVA del fee)
          │
          ├── Platform Fee (9.9% + $0.50)
          │
          ├── Affiliate Commission (configurable por producto)
          │
          └── Creator Net (lo que recibe el creador)
```

### Ejemplo

```
Precio: $10.000 ARS
Cupón: 10% → $1.000 descuento
Amount: $9.000

Gateway Fee: 5.99% + $5 = $545.10
Gateway Tax (21%): $114.47

Platform Fee: 9.9% + $0.50 = $941
Affiliate (30%): $2.412

Creator Net: $9.000 - $545.10 - $114.47 - $941 - $2.412 = $4,987.43
```

---

## Release de Fondos (Double-Lock)

El sistema usa un sistema de "doble bloqueo" para determinar cuándo se liberan los fondos:

```
release_at = MAX(
    garantia_producto (default 7 dias),
    liquidez_pasarela (configurable por gateway)
)
```

| Gateway | Liquidity Delay |
|---------|-----------------|
| Mercado Pago | 0-30 días (configurable) |
| Simulator | 0 días |

---

## Webhooks

### Eventos de Mercado Pago

| Evento | Acción en Crema |
|--------|-----------------|
| `payment.created` | Crear orden |
| `payment.updated` | Actualizar estado |
| `payment.refunded` | Procesar reembolso |

### Validación de Webhook

```typescript
// Validar firma de Mercado Pago
const isValid = MercadoPago.validateWebhook(signature, body);
if (!isValid) {
  return 401; // Unauthorized
}
```

---

## Reembolsos

Los reembolsos se procesan a través del endpoint:

```
POST /api/refunds/:orderId
```

El sistema **Safe-Guard** evalúa automáticamente si el reembolso es válido.

---

## Configuración de Gateway

### Tabla: payment_gateways

```sql
INSERT INTO payment_gateways (id, name, liquidity_delay_days, is_active) VALUES
    ('mercadopago', 'Mercado Pago', 0, true),
    ('simulator', 'Payment Simulator', 0, true);
```

### Tabla: currency_gateways

```sql
INSERT INTO currency_gateways (currency_code, gateway_id, is_default, priority) VALUES
    ('ARS', 'mercadopago', true, 1),
    ('USD', 'mercadopago', true, 1),
    ('USDT', 'mercadopago', true, 1);
```

---

## Ver También

- [API: Payments](../api/endpoints/payments.md)
- [API: Refunds](../api/endpoints/refund.md)
- [Features: Safe-Guard](./safeguard.md)
- [Features: Afiliados](./affiliates.md)
