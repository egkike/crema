# SDD Spec: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Spec  
**Estado**: ✅ DOC COMPLETA (código existente)  
**Depends on**: proposal.md

---

## 1. Resumen

Completar el sistema de manejo de errores con notificaciones a sistemas externos.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| ERR-001 | Notificar errores críticos a Slack | 🔴 ALTA |
| ERR-002 | Notificar errores críticos a Datadog | 🟡 MEDIA |
| ERR-003 | Incluir requestId en notificación | 🔴 ALTA |
| ERR-004 | Filtrar por nivel de severidad | 🔴 ALTA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia de notificación | < 500ms |
| Disponibilidad | 99.9% |
| Seguridad | No exponer PII/Secrets |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| ERROR-01 | Usuario | recibir error en formato consistente | entender qué pasó |
| ERROR-02 | Admin | recibir notificación de errores críticos | actuar rápidamente |
| ERROR-03 | Desarrollador | ver el requestId en la respuesta | hacer debug |

---

## 4. Errores Críticos (definición)

| Tipo | Descripción | Notificar? |
|------|-----------|:---------:|
| DB_CONNECTION_ERROR | No se puede conectar a PostgreSQL | ✅ Siempre |
| REDIS_CONNECTION_ERROR | No se puede conectar a Redis | ✅ Siempre |
| LLM_TIMEOUT | Timeout de LLM > 30s | ✅ Siempre |
| UNHANDLED_EXCEPTION | Excepción no manejada | ✅ Siempre |
| RATE_LIMIT_EXCEEDED | Rate limit excedido | ❌ No (esperado) |
| VALIDATION_ERROR | Error de validación | ❌ No (esperado) |
| AUTH_ERROR | Error de autenticación | ⚠️ Solo si sospechoso |

---

## 5. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | Errors críticos notifican a Slack en < 500ms |
| AC-002 | Errors críticos notifican a Datadog |
| AC-003 | Notificación incluye requestId |
| AC-004 | No expone PII en notificaciones |
| AC-005 | Errores esperados no notifican |

---

## 6. Estado

**Estado**: DRAFT