# SDD Proposal: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Proposal  
**Estado**: ✅ DOC COMPLETA (código pending)  
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Fecha**: Abril 2026

---

## 1. Resumen Ejecutivo

Integrar el Concierge (AI Support Chatbot) con las capas de arquitectura existentes:
- ConfigService
- Orchestrator + Skills Registry
- Error Handling
- User Context Memory (dependencia)

Esta integración permite que el Concierge use el sistema centralizado de capacidades y configuración.

> **Nota**: La tabla de contenido ya existe en `docs/project/architecture-improvements/PRD.md` sección "Fase 7: Concierge Integration"

---

## 1. Resumen Ejecutivo

Integrar el Concierge (AI Support Chatbot) con las nuevas capas de arquitectura:
- ConfigService
- Orchestrator + Skills Registry
- Error Handling
- User Context Memory

Esta integración permite que el Concierge use el sistema centralizado de capacidades y configuración.

> **Stack disponible**: Ver **[PRD.md > Stack Disponible](#0-stack-disponible)** antes de proponer soluciones. OrchestratorService, NotificationService y Redis ya están implementados y disponibles para reutilización.

---

## 2. Contexto

### Estado Actual

| Capa | Estado | ¿Concierge la usa? |
|------|:------:|:----------------:|
| ConfigService | ✅ Implementado | ❌ No |
| Orchestrator | ✅ Implementado | ❌ No |
| Error Handling | ⚠️ Parcial | ❌ No |
| User Context | ❌ Pendiente | ❌ No |

### Problema

El Concierge actual:
- Tiene configuración hardcoded
- No usa Orchestrator para capacidades
- No guardUser Context del usuario

---

## 3. Alcance

### En Scope

- Concierge → ConfigService
- Concierge → Orchestrator
- Concierge → Error Handling
- Concierge → User Context

### Out of Scope

- Nuevas features de Concierge (fuera de arquitectura)
- Frontend de Concierge

---

## 4. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| INT-01 | Concierge | leer configuración de ConfigService | poder cambiar sin deploy |
| INT-02 | Concierge | usar Orchestrator para routing | capacidades centralizadas |
| INT-03 | Concierge | guardar contexto del usuario | recordar interacciones |
| INT-04 | Admin | ver logs de Concierge en formato estándar | debugging |

---

## 5. Estado

**Estado**: DRAFT - Pendiente de completar spec