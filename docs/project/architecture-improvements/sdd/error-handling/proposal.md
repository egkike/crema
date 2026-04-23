# SDD Proposal: Error Handling

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Proposal  
**Estado**: ✅ DOC COMPLETA (código existente, notificaciones pending)  
**Fecha**: Abril 2026

---

## 1. Resumen Ejecutivo

El sistema de manejo de errores de Crema necesita evolucionar para proporcionar:
1. **Formato consistente** en todas las respuestas de error (ya implementado ✅)
2. **Clases de errores centralizadas** (ya implementado ✅)
3. **Middleware de errores** (ya implementado ✅)
4. **Notificaciones a sistemas externos** (pendiente ❌)

### Estado Actual

| Componente | Estado | Notas |
|-----------|:------:|-------|
| Error classes | ✅ | ValidationError, CapabilityNotFoundError, CapabilityExecutionError |
| Error middleware | ✅ | Formato consistente + sin info leakage |
| Formato respuesta | ✅ | { success, error: { code, message } } |
| Notificaciones | ❌ | Datadog/Slack pending |

---

## 2. Contexto

### Problema

Los errores críticos (caídas de servicios, timeouts, fallos de base de datos) actualmente:
- Se registran en logs únicamente
- No alertan al equipo de forma proactiva
- Requieren revisión manual de logs para detección

### Solución Propuesta

Agregar sistema de notificaciones que:
- Detecte errores críticos
- Notifique a Datadog/Slack
- Incluya contexto suficiente para debugging

---

## 3. Alcance

### En Scope

- ✅ Sistema existente de error handling (ya implementado)
- ⬜ Notificaciones a sistemas externos

### Out of Scope

- Cambios a errores de negocio (no son críticos)
- Sistema de alerts de negocio (fuera de arquitectura)

---

## 4. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| ERROR-01 | Usuario | recibir error en formato consistente | entender qué pasó |
| ERROR-02 | Admin | recibir notificación de errores críticos | actuar rápidamente |
| ERROR-03 | Desarrollador | ver el requestId en la respuesta | hacer debug |

---

## 5. Approach

### Arquitectura Propuesta

```
[App Error] → [Error Middleware] → [Logger] → [Notification Service]
                                        ↓
                                   [Slack/Datadog]
```

### Stack

| Servicio | Descripción |
|----------|-------------|
| Logger | Winston (existente) |
| Notifications | Slack webhooks + Datadog API |

---

## 6. Estado

**Estado**: DRAFT - Pendiente de completar spec

**Depends on**:
- architecture-improvements PRD sección 4.2