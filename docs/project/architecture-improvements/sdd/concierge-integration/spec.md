# SDD Spec: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Spec  
**Estado**: ✅ IMPLEMENTADO (2026-04-27)  
**Revision Note**: Spec actualizada post-implementación con fixes de seguridad y configuración
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Depends on**: proposal.md

---

## 1. Resumen

Integrar el Concierge con las capas de arquitectura existentes.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| INT-001 | Concierge usa ConfigService para settings (model, temperature, maxTokens, systemPrompt) | 🔴 ALTA |
| INT-002 | Concierge usa Orchestrator para capabilities | 🔴 ALTA |
| INT-003 | Concierge guarda User Context | 🟡 MEDIA |
| INT-004 | Errores de Concierge en formato estándar | 🔴 ALTA |
| INT-005 | Input sanitization para prevensión de inyección | 🔴 ALTA |
| INT-006 | Validación centralizada (handler valida, servicio no duplica) | 🟡 MEDIA |
| INT-007 | Support enabled check antes de procesar | 🟡 MEDIA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia adicional | < 100ms |
| Disponibilidad | 99.9% |
| Backward compatibility | 100% |
| Seguridad | Input sanitizado, prompt injection defense |
| Configurabilidad | 100% vía configService |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| INT-01 | Concierge | leer configuración de ConfigService | poder cambiar sin deploy |
| INT-02 | Concierge | usar Orchestrator para routing | capacidades centralizadas |
| INT-03 | Concierge | guardar contexto del usuario | recordar interacciones |
| INT-04 | Admin | ver logs de Concierge en formato estándar | debugging |
| INT-05 | Sistema | sanitizar input del usuario | prevenir prompt injection |
| INT-06 | Admin | poder deshabilitar Concierge via config | mantener control |

---

## 4. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | Concierge puede leer config de ConfigService (model, temperature, maxTokens, systemPrompt) |
| AC-002 | Concierge puede ejecutar capabilities via Orchestrator |
| AC-003 | Concierge guarda contexto en User Context |
| AC-004 | Errores de Concierge en formato estándar (AppError) |
| AC-005 | Input sanitizado con `sanitizeInput()` y `defensiveFramePrompt()` |
| AC-006 | Validación centralizada en handler, servicio no duplica |
| AC-007 | Soporte deshabilitable via `support.enabled` |
| AC-008 | TypeScript sin errores, lint limpio, tests passing |

---

## 5. Security Considerations

| Issue | Mitigation |
|-------|------------|
| Prompt Injection | `defensiveFramePrompt()` escapa `<` y `>` |
| Control Characters | `sanitizeInput()` elimina `\x00-\x1F\x7F` |
| Hardcoded Config | Todos los valores vía `configService` |
| Unsafe Type Cast | `safeConversationCount()` type guard |

---

## 6. Estado

**Estado**: ✅ IMPLEMENTADO