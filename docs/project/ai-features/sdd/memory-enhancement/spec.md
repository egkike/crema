# SDD Spec: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI  
**Tipo**: Arquitectura / Enhancement  
**SDD Phase**: Spec  
**Estado**: ✅ DOC COMPLETA  
**Depends on**: proposal.md

> **Estandar de Verificación**: Voir `docs/project/common/verification-standard.md`

---

## 1. Resumen

Mejorar el Memory Service existente para convertirlo de "prototipo" a "sistema de producción" con:
- Aislamiento multi-tenant (user_id)
- Ownership validation (RBAC)
- Políticas de gestión (cleanup, quotas, summarization)
- Escalabilidad (HNSW index)

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| ME-001 | Agregar user_id a ai_embeddings table | 🔴 ALTA |
| ME-002 | Validar ownership en memory.store | 🔴 ALTA |
| ME-003 | Validar ownership en memory.recall | 🔴 ALTA |
| ME-004 | Agregar is_deleted column (soft delete) | 🟡 MEDIA |
| ME-005 | Migrar índice a HNSW | 🟡 MEDIA |
| ME-006 | Cleanup job hourly | 🟡 MEDIA |
| ME-007 | Batch summarization job (max 10 concurrent) | 🟢 BAJA |
| ME-008 | Per-user quota (10K) + LRU eviction | 🟡 MEDIA |
| ME-009 | Rate limiting (100/min) | 🟢 BAJA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia búsqueda | < 100ms con 1M+ embeddings |
| Disponibilidad | 99.9% |
| Seguridad | user_id ownership validation 100% |
| Concurrency summarization | max 10 concurrent |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| MEM-01 | User A | solo ver mis memorias | no acceder a otras memorias |
| MEM-02 | Sistema | validar que session_id.owner = user_id | impedir acceso no autorizado |
| MEM-03 | Sistema | hacer soft delete | no borrar datos originales |
| MEM-04 | Admin | ver quota por usuario | entender uso |

---

## 4. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | query con user_id=A retorna solo memorias de A |
| AC-002 | memory.store valida session_id.owner = caller |
| AC-003 | memory.recall retorna 403 si no es owner |
| AC-004 | is_deleted=TRUE preserva registro |
| AC-005 | HNSW search < 100ms con 1M+ registros |
| AC-006 | Cleanup marca is_deleted=TRUE |
| AC-007 | Summarization max 10 concurrent jobs |
| AC-008 | > 10K embeddings → LRU eviction |
| AC-009 | > 100 embeddings/min → 429 |

---

## 5. Schema Updates

### 5.1 ai_embeddings Modifications

```sql
ALTER TABLE ai_embeddings 
ADD COLUMN user_id UUID NOT NULL,
ADD COLUMN memory_type VARCHAR(20) CHECK (memory_type IN ('message', 'summary', 'system_instruction')),
ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

CREATE INDEX idx_ai_embeddings_user ON ai_embeddings(user_id);
CREATE INDEX idx_ai_embeddings_is_deleted ON ai_embeddings(is_deleted);
```

### 5.2 HNSW Index

```sql
CREATE INDEX ai_embeddings_hnsw_idx ON ai_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## 6. Estado

**Estado**: DRAFT (Pendiente de completar design y tasks)