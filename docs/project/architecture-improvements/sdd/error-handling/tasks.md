# SDD Tasks: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: 🟡 DOC PARCIAL (clases+middleware/code existente, notificaciones pending)  
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Agregar config keys a ConfigService | 🔴 ALTA | - |
| 2 | Crear NotificationService | 🔴 ALTA | 1 |
| 3 | Integrar en error middleware | 🔴 ALTA | 2 |
| 4 | Tests unitarios | 🟡 MEDIA | 2 |
| 5 | Tests de integración | 🟡 MEDIA | 3 |

---

## Task Details

### Task 1: Agregar config keys

```typescript
// En app_config table
INSERT INTO app_config (config_key, config_value, config_type, category, description) VALUES
('error_notification.slack_webhook', '', 'string', 'app', 'Slack webhook URL'),
('error_notification.datadog_api_key', '', 'string', 'app', 'Datadog API key'),
('error_notification.enabled', 'true', 'boolean', 'app', 'Enable error notifications'),
('error_notification.severity_threshold', 'error', 'string', 'app', 'Severity threshold');
```

### Task 2: NotificationService

```typescript
// src/services/notification.service.ts
interface NotificationPayload {
  level: 'error' | 'warning' | 'info';
  message: string;
  requestId?: string;
  stack?: string;
  timestamp: string;
}
```

### Task 3: Integration

En `src/middlewares/error.middleware.ts`:
```typescript
app.use(async (err, req, res, next) => {
  await notificationService.notify(err, { requestId: req.id });
});
```

---

## Estado

**Estado**: DRAFT