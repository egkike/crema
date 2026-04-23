# SDD Proposal: User Context

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura / Feature  
**SDD Phase**: Proposal  
**Estado**: ✅ DOC COMPLETA (tabla DB pending)  
**Fecha**: Abril 2026

---

## 1. Resumen Ejecutivo

Implementar el sistema de User Context Memory que permite:
- Guardar el progreso de aprendizaje del usuario
- Guardar notas y highlights
- Recordar interacciones previas con el agente
- Personalizar respuestas según el nivel del usuario

> **Dependencia**: Este SDD está basado en **architecture-improvements PRD sección 4.4**

---

## 2. Contexto

### Estado Actual

| Tabla | Estado |
|-------|:------:|
| user_context | ❌ No existe |
| user_notes | ❌ No existe |

### Problema

El sistema no guarda:
- Progreso del usuario en cursos
- Notas tomadas por el usuario
- Highlights de contenido
- Contexto de conversaciones previas

---

## 3. Alcance

### En Scope

- Tabla user_context
- Tabla user_notes
- UserContextService
- UserNotesService

### Out of Scope

- Frontend de notas
- Integración con agentes (fuera de integración SDD)

---

## 4. User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| MEM-01 | Sistema | guardar lo que pregunta el usuario | recordarlo después |
| MEM-02 | Sistema | guardar notas y highlights | poder recuperarlos |
| MEM-03 | IA | conocer progreso del usuario | personalizar respuesta |
| MEM-04 | IA | detectar si no entiende | ofrecer ayuda proactiva |

---

## 5. Estado

**Estado**: DRAFT - Basado en architecture-improvements PRD sección 4.4

**Documentación existente**:
- Tablas SQL: voir PRD sección 4.4
- Interfaz: voir PRD sección 4.4