# Endpoints: Balance

## Overview

Consulta de saldos y historial de movimientos.

## Endpoints

---

### Get Dashboard Stats

```
GET /api/balances/stats
```

Obtiene estadísticas para el dashboard.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": {
    "total_earned": 500000,
    "pending": 50000,
    "available": 350000,
    "withdrawn": 100000,
    "chart_data": [...]
  }
}
```

---

### Get My Balance

```
GET /api/balances/me
```

Obtiene balances actuales por moneda.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "currency": "ARS",
      "pending": 50000,
      "available": 350000,
      "locked": 0
    },
    {
      "currency": "USD",
      "pending": 100,
      "available": 750,
      "locked": 0
    }
  ]
}
```

---

### Get My History

```
GET /api/balances/history
```

Historial de movimientos paginado.

**Autenticación:** Requiere access token

**Query Params:**

| Param | Tipo | Default |
|-------|------|---------|
| `page` | number | 1 |
| `limit` | number | 20 |
| `currency` | string | - |
| `type` | string | - |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "type": "sale",
      "amount": 4999,
      "currency": "ARS",
      "description": "Venta: Curso de TypeScript",
      "created_at": "2024-03-15T14:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

---

## Tipos de Movimiento

| Tipo | Descripción |
|------|-------------|
| `sale` | Venta de producto |
| `commission` | Comisión de afiliado |
| `payout` | Retiro |
| `refund` | Reembolso |
| `platform_fee` | Fee de plataforma |

---

## Estados de Balance

| Estado | Descripción |
|--------|-------------|
| `pending` | En período de garantía (30 días) |
| `available` | Listo para retiro |
| `locked` | Bloqueado (en disputa) |

---

## Ver También

- [Features: Payments](../../features/payments.md)
- [Errores](../errors.md)
