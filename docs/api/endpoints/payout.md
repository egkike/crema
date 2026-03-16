# Endpoints: Payouts

## Overview

Gestión de retiros de fondos.

## Endpoints

---

### Request Payout

```
POST /api/payouts
```

Solicita retiro de fondos disponibles.

**Autenticación:** Requiere access token + verificación de contraseña

**Request Body:**

```json
{
  "amount": 50000,
  "currency": "ARS",
  "payout_method_id": "uuid"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Solicitud de retiro creada",
  "data": {
    "id": "uuid",
    "amount": 50000,
    "status": "pending"
  }
}
```

---

### Get My Payouts

```
GET /api/payouts/me
```

Historial de solicitudes de retiro.

**Autenticación:** Requiere access token

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Filtrar por estado |
| `page` | number | Página |
| `limit` | number | Items por página |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "amount": 50000,
      "currency": "ARS",
      "status": "completed",
      "created_at": "2024-03-15T10:00:00Z",
      "processed_at": "2024-03-16T14:30:00Z"
    }
  ]
}
```

---

### Cancel Payout

```
DELETE /api/payouts/:id
```

Anula una solicitud de retiro pendiente.

**Autenticación:** Requiere access token

**Restricción:** Solo si el estado es `pending`

**Response (200):**

```json
{
  "success": true,
  "message": "Solicitud de retiro anulada"
}
```

---

## Estados de Payout

| Estado | Descripción |
|--------|-------------|
| `pending` | Esperando procesamiento |
| `approved` | Aprobado para pago |
| `processing` | En proceso de pago |
| `completed` | Pagado |
| `rejected` | Rechazado |
| `cancelled` | Anulado por el usuario |

---

## Métodos de Retiro

Los métodos de retiro disponibles dependen de la configuración de la plataforma:

| Método | Descripción |
|--------|-------------|
| `bank_transfer` | Transferencia bancaria |
| `mercadopago` | Transferencia a Mercado Pago |
| `crypto` | Criptomonedas |

---

## Retiros - Límites

| Campo | Valor |
|-------|-------|
| Mínimo | Según moneda |
| Comisión | Según método |

---

## Ver También

- [Features: Payments](../../features/payments.md)
- [Errores](../errors.md)
