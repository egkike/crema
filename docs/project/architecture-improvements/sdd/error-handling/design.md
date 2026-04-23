# SDD Design: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Design  
**Estado**: ✅ DOC COMPLETA (notificaciones pending)  
**Depends on**: spec.md

---

## 1. Resumen del Diseño

Completar el sistema de notificaciones de errores críticos.

---

## 2. Arquitectura

### 2.1 Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    Error Flow                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Express Handler]                                           │
│       │                                                     │
│       ▼                                                     │
│  [Error Middleware] ──→ [Logger (Winston)]                  │
│       │                        │                             │
│       │                        ▼                             │
│       │               [Notification Service]                │
│       │                        │                             │
│       │                   ┌───┴───┐                         │
│       │                   │       │                         │
│       │               Slack   Datadog                        │
│       │                                                     │
│       ▼                                                     │
│  [Response to Client]                                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Notification Service

```typescript
class NotificationService {
  async notify(error: AppError, context: ErrorContext): Promise<void> {
    // 1. Check severity
    if (!this.isCritical(error)) return;
    
    // 2. Build message (no PII)
    const message = this.buildMessage(error, context);
    
    // 3. Send to Slack
    await this.slack.send(message);
    
    // 4. Send to Datadog
    await this.datadog.send(message);
  }
}
```

---

## 3. Data Model

N/A - No hay nuevas tablas

---

## 4. API Design

No hay nuevos endpoints

---

## 5. Integración

### 5.1 ConfigService Keys

| Key | Default | Descripción |
|-----|---------|-------------|
| error_notification.slack_webhook | - | Webhook URL |
| error_notification.datadog_api_key | - | Datadog API key |
| error_notification.enabled | true | Habilitar notificaciones |
| error_notification.severity_threshold | error | Nivel mínimo |

### 5.2 Servicios Existentes

- Winston logger (existente)
- ConfigService (existente)

---

## 6. Estado

**Estado**: DRAFT