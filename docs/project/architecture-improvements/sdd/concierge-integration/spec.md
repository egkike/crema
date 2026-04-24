# SDD Spec: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Spec  
**Estado**: ✅ DOC COMPLETA  
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Depends on**: proposal.md

> **Stack disponible**: Ver **[PRD.md > Stack Disponible](#0-stack-disponible)** antes de planificar la implementación. OrchestratorService, NotificationService, ConfigService y BullMQ ya están disponibles.

---

## 1. Resumen

Integrar el Concierge con las capas de arquitectura existentes.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| INT-001 | Concierge usa ConfigService para settings | 🔴 ALTA |
| INT-002 | Concierge usa Orchestrator para capabilities | 🔴 ALTA |
| INT-003 | Concierge guarda User Context | 🟡 MEDIA |
| INT-004 | Errores de Concierge en formato estándar | 🔴 ALTA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia adicional | < 100ms |
| Disponibilidad | 99.9% |
| Backward compatibility | 100% |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| INT-01 | Concierge | leer configuración de ConfigService | poder cambiar sin deploy |
| INT-02 | Concierge | usar Orchestrator para routing | capacidades centralizadas |
| INT-03 | Concierge | guardar contexto del usuario | recordar interacciones |
| INT-04 | Admin | ver logs de Concierge en formato estándar | debugging |

---

## 4. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | Concierge puede leer config de ConfigService |
| AC-002 | Concierge puede ejecutar capabilities via Orchestrator |
| AC-003 | Concierge guarda contexto en User Context |
| AC-004 | Errores de Concierge en formato estándar |

---

## 5. Estado

**Estado**: DRAFT