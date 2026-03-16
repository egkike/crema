# Endpoints: Refunds

## Overview

Gestión de reembolsos.

## Endpoints

---

### Process Refund

```
POST /api/refunds/:orderId
```

Solicita reembolso de una compra.

**Autenticación:** Requiere access token

**Request Body:**

```json
{
  "reason": "No era lo que esperaba"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Reembolso procesado",
  "data": {
    "order_id": "uuid",
    "amount": 4999,
    "status": "refunded"
  }
}
```

---

## Política de Reembolsos

El sistema **Safe-Guard** evalúa automáticamente si el reembolso es válido:

### Reembolso Automático (sin consumo)
- Usuario no accedió al contenido
- Tiempo desde compra < 7 días

### Reembolso con Proporcionalidad
- Progreso del curso < 30% → Reembolso parcial
- Progreso > 30% → Sin reembolso

### Sin Reembolso
- Productos descargables (ebooks, software)
- Membresías
- Progreso > 30%

---

## Estados de Refund

| Estado | Descripción |
|--------|-------------|
| `pending` | Esperando evaluación |
| `approved` | Aprobado |
| `rejected` | Rechazado |
| `processing` | Procesando |
| `completed` | Reembolso realizado |
| `failed` | Falló el reembolso |

---

## Safe-Guard

El sistema de protección anti-fraude evalúa:
1. Tiempo desde la compra
2. Porcentaje de consumo del curso
3. Tipo de producto
4. Historial del usuario

---

## Ver También

- [Features: Safe-Guard](../../features/safeguard.md)
- [Errores](../errors.md)
