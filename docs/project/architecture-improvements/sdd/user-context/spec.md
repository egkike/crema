# SDD Spec: User Context

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura / Feature  
**SDD Phase**: Spec  
**Estado**: ✅ DOC COMPLETA  
**Depends on**: proposal.md

---

## 1. Resumen

Implementar el sistema de User Context Memory con tablas y servicios.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| UC-001 | Crear tabla user_context | 🔴 ALTA |
| UC-002 | Crear tabla user_notes | 🔴 ALTA |
| UC-003 | UserContextService CRUD | 🔴 ALTA |
| UC-004 | UserNotesService CRUD | 🔴 ALTA |
| UC-005 | Aislamiento por user_id | 🔴 ALTA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia | < 100ms |
| Disponibilidad | 99.9% |
| Seguridad | user_id ownership validation |

---

## 3. User Stories

| ID | Como | quiero | Para |
|----|------|--------|------|
| MEM-01 | Sistema | guardar lo que pregunta el usuario | recordarlo después |
| MEM-02 | Sistema | guardar notas y highlights | poder recuperarlos |
| MEM-03 | IA | conocer progreso del usuario | personalizar respuesta |
| MEM-04 | IA | detectar si no entiende | ofrecer ayuda proactiva |

---

## 4. Data Model

### 4.1 Tabla: user_context

| Campo | Tipo | Notas |
|------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users, ON DELETE CASCADE |
| product_id | UUID | FK → products, ON DELETE CASCADE |
| context_data | JSONB | {questions:[], progress:0, notes:[], highlights:[]} |
| updated_at | TIMESTAMPTZ | |

### 4.2 Tabla: user_notes

| Campo | Tipo | Notas |
|------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users, ON DELETE CASCADE |
| product_id | UUID | FK → products, ON DELETE CASCADE |
| note_text | TEXT | |
| note_type | VARCHAR(20) | 'highlight', 'bookmark', 'note' |
| position | JSONB | {page, timestamp} |
| created_at | TIMESTAMPTZ | |

---

## 5. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | Tabla user_context permite CRUD |
| AC-002 | Tabla user_notes permite CRUD |
| AC-003 | Solo owner puede ver sus datos |
| AC-004 | Isolation por user_id funciona |

---

## 6. Estado

**Estado**: DRAFT