# Safe-Guard (Sistema Anti-Fraude)

## Overview

El sistema **Safe-Guard** protege a los creadores de comportamientos abusivos, especialmente solicitudes de reembolso fraudulentas.

## El Problema

Los creadores enfrentan abuso donde:
- Usuarios compran, consumen todo el contenido y luego solicitan reembolso
- "Refund fraud" representa pérdidas significativas
- No hay forma de validar si el reembolso es legítimo

## Solución: Safe-Guard

```
┌─────────────────────────────────────────┐
│            Safe-Guard                   │
├─────────────────────────────────────────┤
│ 1. Validar elegibilidad de garantía     │
│ 2. Verificar consumo del producto      │
│ 3. Detectar patrones sospechosos        │
│ 4. Decidir si se permite reembolso     │
└─────────────────────────────────────────┘
```

---

## Lógica de Reembolso

### Flujo de Evaluación

```
Usuario solicita reembolso
           │
           ▼
┌─────────────────────┐
│ ¿Producto descargable? │ ← Ebook, Software, Membership
└──────────┬──────────┘
           │ Sí
           ▼
    ❌ RECHAZADO
    "Productos descargables no tienen reembolso"
           
           │ No (curso)
           ▼
┌─────────────────────┐
│ ¿Progreso > 30%?    │
└──────────┬──────────┘
           │
           │ Sí
           ▼
    ❌ RECHAZADO
    "Has consumido más del 30% del curso"
           
           │ No
           ▼
┌─────────────────────┐
│ ¿Tiempo > 7 días?   │
└──────────┬──────────┘
           │
           │ Sí
           ▼
    ⚠️ EVALUAR
    "Excedió período típico de garantía"
           
           │ No
           ▼
    ✅ APROBAR
    "Reembolso procesado"
```

---

## Implementación

### Tabla: orders

```sql
-- Campos relacionados con Safe-Guard
is_guarantee_eligible BOOLEAN DEFAULT TRUE,
    -- Se vuelve FALSE si el usuario consume el producto

days_of_guarantee_applied INT DEFAULT 7,
    -- Días de garantía del producto

release_at TIMESTAMP,
    -- Fecha de liberación de fondos
```

### Evaluación de Elegibilidad

```typescript
// services/refund.service.ts
export async function evaluateRefundEligibility(orderId: string): Promise<RefundDecision> {
  const order = await getOrder(orderId);
  const product = await getProduct(order.product_id);

  // 1. ¿Es producto descargable?
  if (product.type === 'ebook' || product.type === 'software') {
    return { allowed: false, reason: 'downloadable_not_eligible' };
  }

  // 2. ¿Es curso y tiene progreso?
  if (product.type === 'course') {
    const progress = await calculateProgress(order.user_id, order.product_id);
    
    if (progress > 30) {
      return { allowed: false, reason: 'excessive_consumption' };
    }
  }

  // 3. ¿Está dentro del período de garantía?
  const daysSincePurchase = getDaysSince(order.created_at);
  const guaranteeDays = product.guarantee_days || 7;
  
  if (daysSincePurchase > guaranteeDays) {
    return { allowed: false, reason: 'guarantee_expired' };
  }

  return { allowed: true, reason: 'eligible' };
}
```

---

## Tracking de Consumo

### Para Cursos

```sql
CREATE TABLE user_lessons_progress (
    user_id UUID,
    lesson_id UUID,
    product_id UUID,
    completed_at TIMESTAMP,
    time_spent_seconds INT,  -- Tiempo real visto
    PRIMARY KEY (user_id, lesson_id)
);
```

### Cálculo de Progreso

```typescript
export async function calculateCourseProgress(userId: string, productId: string): Promise<number> {
  const totalLessons = await countLessons(productId);
  const completedLessons = await countCompletedLessons(userId, productId);
  
  return (completedLessons / totalLessons) * 100;
}
```

### Actualización de Progreso

```typescript
// POST /api/learning/progress
export async function updateProgress(req, res) {
  const { lesson_id, product_id, time_spent } = req.body;
  
  // Marcar lección como completada
  await markLessonCompleted(userId, lessonId);
  
  // Recalcular progreso
  const progress = await calculateCourseProgress(userId, product_id);
  
  // Si progreso > 30%, marcar orden como no elegible para reembolso
  if (progress > 30) {
    await updateOrder(orderId, { is_guarantee_eligible: false });
  }
  
  // Si progreso = 100%, generar certificado
  if (progress === 100) {
    await generateCertificate(userId, productId);
  }
}
```

---

## Detección de Patrones Sospechosos

### Heurísticas

| Patrón | Puntuación | Acción |
|--------|------------|--------|
| Múltiples refunds en 30 días | +50 | Bloquear usuario |
| Siempre compra y reembolsos | +30 | Review manual |
| Usa VPN/Proxy | +20 | Review manual |
| Mismo dispositivo múltiples cuentas | +40 | Investigar |

### Implementación

```typescript
// services/refund.service.ts
export async function detectFraudPattern(userId: string): Promise<FraudSignal> {
  const recentRefunds = await getRefundsLast30Days(userId);
  const refundRate = recentRefunds.length / getTotalPurchases(userId);
  
  if (refundRate > 0.5) {
    return { suspicious: true, score: 50, reason: 'high_refund_rate' };
  }
  
  const devices = await getUniqueDevices(userId);
  if (devices > 5) {
    return { suspicious: true, score: 30, reason: 'multiple_devices' };
  }
  
  return { suspicious: false, score: 0 };
}
```

---

## API de Reembolsos

### Solicitar Reembolso

```
POST /api/refunds/:orderId
```

```json
{
  "reason": "No era lo que esperaba"
}
```

### Respuesta

```json
{
  "success": true,
  "message": "Reembolso procesado",
  "data": {
    "order_id": "uuid",
    "amount": 4999,
    "status": "refunded",
    "refund_type": "full",  // o "partial"
    "reason": "eligible"
  }
}
```

---

## Estados de Refund

| Estado | Descripción |
|--------|-------------|
| `pending` | Esperando evaluación |
| `approved` | Aprobado |
| `rejected` | Rechazado por Safe-Guard |
| `processing` | Procesando |
| `completed` | Reembolso realizado |
| `failed` | Falló el reembolso |

---

## Configuración por Producto

### Período de Garantía

```sql
-- products table
guarantee_days INT DEFAULT NULL
```

- `NULL`: Usa el global (7 días)
- `0`: Sin garantía
- `30`: 30 días

### Productos sin Reembolso

```sql
-- products table
refundable BOOLEAN DEFAULT TRUE
```

---

## Métricas de Safe-Guard

### Dashboard Admin

```
GET /api/admin/financial-health
```

```json
{
  "refunds_this_month": 45,
  "refunds_amount": 225000,
  "fraud_prevented": 12,
  "fraud_amount_saved": 60000
}
```

---

## Beneficios

### Para Creadores
- Protege de abuso
- Solo reembolsos legítimos
- Transparencia

### Para Plataforma
- Reduce costos de fraude
- Mantiene integridad del sistema
- Stats de comportamiento

### Para Usuarios
- Período de garantía claro
- Protección contra contenido vacío

---

## Ver También

- [API: Refunds](../api/endpoints/refund.md)
- [Features: LMS](./lms.md)
- [Features: Payments](./payments.md)
