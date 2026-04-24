# SDD Spec: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Spec  
**Estado**: ✅ COMPLETO  
**Depends on**: proposal.md

---

## 1. Resumen

Sistema de manejo de errores centralizado con notificaciones a Slack y Datadog.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad | Estado |
|----|-------------|:---------:|--------|
| ERR-001 | Notificar errores críticos a Slack | 🔴 ALTA | ✅ |
| ERR-002 | Notificar errores críticos a Datadog | 🟡 MEDIA | ✅ |
| ERR-003 | Incluir requestId en notificación | 🔴 ALTA | ✅ |
| ERR-004 | Filtrar por nivel de severidad | 🔴 ALTA | ✅ |
| ERR-005 | Rate limiting (max/min) | 🔴 ALTA | ✅ |
| ERR-006 | Timeout en notification calls | 🟡 MEDIA | ✅ |
| ERR-007 | Sanitizar PII en mensajes | 🔴 ALTA | ✅ |
| ERR-008 | Sanitizar stack traces | 🔴 ALTA | ✅ |
| ERR-009 | Escapar Slack markdown | 🔴 ALTA | ✅ |
| ERR-010 | Error logging sin raw error objects | 🔴 ALTA | ✅ |

### 2.2 Requisitos No Funcionales

| Requisito | Target | Estado |
|-----------|--------|--------|
| Latencia de notificación | < 5s (timeout) | ✅ |
| Rate limit | 10/min default | ✅ |
| Disponibilidad | 99.9% | ✅ |
| Seguridad | No exponer PII/Secrets | ✅ |

---

## 3. User Stories

| ID | Como | Quiero | Para | Estado |
|----|------|--------|------|--------|
| ERROR-01 | Usuario | recibir error en formato consistente | entender qué pasó | ✅ |
| ERROR-02 | Admin | recibir notificación de errores críticos | actuar rápidamente | ✅ |
| ERROR-03 | Desarrollador | ver el requestId en la respuesta | hacer debug | ✅ |
| ERROR-04 | Admin | no recibir spam de errores esperados | no perder señal en ruido | ✅ |

---

## 4. Errores Críticos — Definición

| Tipo | Descripción | Notificar? | Env var |
|------|-----------|:---------:|---------|
| DB_CONNECTION_ERROR | No se puede conectar a PostgreSQL | ✅ Siempre | `ERROR_NOTIFICATION_NOTIFY_DB_ERRORS` |
| REDIS_CONNECTION_ERROR | No se puede conectar a Redis | ✅ Siempre | `ERROR_NOTIFICATION_NOTIFY_DB_ERRORS` |
| LLM_TIMEOUT | Timeout de LLM > 30s | ✅ Siempre | `ERROR_NOTIFICATION_NOTIFY_TIMEOUT` |
| UNHANDLED_EXCEPTION | Excepción no manejada | ✅ Siempre | `ERROR_NOTIFICATION_NOTIFY_UNHANDLED` |
| RATE_LIMIT_EXCEEDED | Rate limit excedido | ❌ No | — |
| VALIDATION_ERROR | Error de validación | ⚠️ Solo en dev | — |

---

## 5. Security — Sanitización

### 5.1 Stack Traces (sanitizeStack)

Remueve antes de enviar a Slack/Datadog:
- Paths absolutos (`/home/.../file.ts` → `...file.ts`)
- Vars de entorno (`API_KEY=secret` → `API_KEY=***`)
- Query strings con datos (`?token=abc` → `?...=***`)
- Secret patterns (Bearer, api_key, token, password)

### 5.2 Slack Markdown (escapeSlackMarkdown)

Escapa caracteres Block Kit:
- `* _ ` > < | → `\?`

### 5.3 Error Logging

Nunca loguear el objeto Error completo. Solo el mensaje:
```typescript
const errorMessage = error instanceof Error ? error.message : String(error);
logger.error({ service: 'Slack', status: 'failed', message: errorMessage }, '...');
```

---

## 6. Acceptance Criteria

| Criterio | Validación | Estado |
|----------|------------|--------|
| AC-001 | Errors críticos notifican a Slack en < 5s (timeout) | ✅ |
| AC-002 | Errors críticos notifican a Datadog | ✅ |
| AC-003 | Notificación incluye requestId | ✅ |
| AC-004 | No expone PII en notificaciones | ✅ |
| AC-005 | Errores esperados no notifican | ✅ |
| AC-006 | Rate limiter previene spam | ✅ |
| AC-007 | Sanitized stack traces | ✅ |
| AC-008 | Escaped Slack markdown | ✅ |
| AC-009 | Sanitized error logging | ✅ |
| AC-010 | Judgment Day CLEAN (3 rounds) | ✅ |

---

## 7. Configuration — Environment Variables

Las vars de entorno siguen el patrón `ERROR_NOTIFICATION_<KEY>` para matchear la DB allowlist:

| Env Var | DB Key | Default | Descripción |
|---------|--------|---------|-------------|
| `ERROR_NOTIFICATION_SLACK_WEBHOOK` | `error_notification.slack_webhook` | `''` | URL del webhook |
| `ERROR_NOTIFICATION_SLACK_CHANNEL` | `error_notification.slack_channel` | `#alerts` | Canal de Slack |
| `ERROR_NOTIFICATION_DATADOG_API_KEY` | `error_notification.datadog_api_key` | `''` | API key de Datadog |
| `ERROR_NOTIFICATION_DATADOG_SITE` | `error_notification.datadog_site` | `datadoghq.com` | Sitio de Datadog |
| `ERROR_NOTIFICATION_ENABLED` | `error_notification.enabled` | `true` | Habilitar notificaciones |
| `ERROR_NOTIFICATION_THRESHOLD` | `error_notification.severity_threshold` | `error` | Nivel mínimo |
| `ERROR_NOTIFICATION_MAX_PER_MINUTE` | `error_notification.max_per_minute` | `10` | Rate limit |
| `ERROR_NOTIFICATION_NOTIFY_DB_ERRORS` | `error_notification.notify_db_errors` | `true` | Notificar DB errors |
| `ERROR_NOTIFICATION_NOTIFY_TIMEOUT` | `error_notification.notify_timeout_errors` | `true` | Notificar timeouts |
| `ERROR_NOTIFICATION_NOTIFY_UNHANDLED` | `error_notification.notify_unhandled` | `true` | Notificar unhandled |

---

## 8. Estado

**Estado**: COMPLETADO ✅  
**Judgment Day**: 3 rounds, CLEAN ✅