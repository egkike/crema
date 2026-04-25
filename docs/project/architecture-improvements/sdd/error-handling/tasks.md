# SDD Tasks: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: ✅ COMPLETADO  
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Agregar config keys a ConfigService | 🔴 ALTA | ✅ Completado |
| 2 | Crear NotificationService | 🔴 ALTA | ✅ Completado |
| 3 | Integrar en error middleware | 🔴 ALTA | ✅ Completado |
| 4 | Tests unitarios | 🔴 ALTA | ✅ Completado |
| 5 | Judgment Day (security + performance review) | 🔴 ALTA | ✅ Completado (3 rounds, CLEAN) |

---

## Task Details

### Task 1: Agregar config keys ✅

Agregadas a `config.service.ts` allowlist:

```
error_notification.slack_webhook
error_notification.slack_channel
error_notification.datadog_api_key
error_notification.datadog_site
error_notification.enabled
error_notification.severity_threshold
error_notification.max_per_minute
error_notification.notify_db_errors
error_notification.notify_timeout_errors
error_notification.notify_unhandled
```

### Task 2: NotificationService ✅

```typescript
// src/services/notification.service.ts
export const notificationService = {
  shouldNotify(level: NotificationLevel): boolean
  checkRateLimit(): boolean          // atomic via mutex
  shouldNotifyForError(error: Error): boolean
  buildPayload(error, context, level): NotificationPayload  // sanitized
  async sendToSlack(payload): Promise<void>
  async sendToDatadog(payload): Promise<void>
  async notify(error, context): Promise<void>
}
```

**Security fixes applied:**
- `sanitizeStack()`: remueve paths, env vars, secrets del stack trace
- `escapeSlackMarkdown()`: escapa `* _ ` > < | en mensajes Slack
- Error logging sanitizado: nunca se loguea el objeto Error completo
- Timeout en fetch: 5s máximo por notificación

### Task 3: Integration ✅

```typescript
// src/middlewares/global-error.middleware.ts
app.use(globalErrorHandler);
```

- `getErrorCode()` mapea AppError status codes + error.name para no-AppError
- Mensaje genérico al cliente (no info leakage)
- Logger server-side con stack en development
- Notification async (no bloquea response)

### Task 4: Tests ✅

```
backend/src/__tests__/services/notification.service.test.ts
backend/src/__tests__/middlewares/global-error.middleware.test.ts
```

**Tests passing**: 1000/1000

### Task 5: Judgment Day ✅

3 rounds de juicio adversarial. 16 issues encontrados y fijos.

**Issues críticos/real fixed:**
| # | Issue | Severity |
|---|-------|----------|
| 1 | Env var naming mismatch | CRITICAL |
| 2 | Stack trace exposure | CRITICAL |
| 3 | Rate limiter race condition | WARNING (real) |
| 4 | Slack markdown injection | WARNING (real) |
| 5 | Message length not validated | WARNING (real) |
| 6 | Secret logging in catch blocks | WARNING (real) |
| 7 | `.catch()` without sanitization | WARNING (real) |

---

## Verification

```bash
pnpm tsc --noEmit   # ✅
pnpm lint           # ✅
pnpm test           # ✅ 1000 passed
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/services/notification.service.ts` | ✅ Nuevo |
| `backend/src/middlewares/global-error.middleware.ts` | ✅ Nuevo |
| `backend/src/app.ts` | ✅ Remove unused logger |
| `backend/src/services/config.service.ts` | ✅ Add error config keys |
| `backend/db/init/09-error-handling-config.sql` | ✅ Migration SQL |
| `backend/src/__tests__/services/notification.service.test.ts` | ✅ Tests |
| `backend/src/__tests__/middlewares/global-error.middleware.test.ts` | ✅ Tests |

---

## Estado

**Estado**: ✅ COMPLETO (2026-03-20)