# SDD Spec: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI
**Tipo**: Arquitectura / Enhancement
**SDD Phase**: Spec
**Estado**: ✅ COMPLETO (implementado Mayo 2026)
**Depends on**: proposal.md

> **Estandar de Verificación**: Ver `docs/project/common/verification-standard.md`

---

## 1. Resumen

Mejorar el Memory Service existente para sistema de producción con:
- Aislamiento multi-tenant (user_id + product ownership)
- RBAC: validar acceso al producto antes de buscar memorias
- Políticas de gestión (cleanup, quotas, hard delete)
- Escalabilidad (HNSW index)
- Rate limiting

**Nota sobre el patrón de memoria**: En Crema, `ai_embeddings` almacena RAG de contenido de productos (lecciones, FAQs, reviews), NO conversaciones de chat. Por eso NO tiene `session_id` — el ownership se valida por `user_id` + acceso al producto.

---

## 2. Requirements

### 2.1 Requisitos Funcionales

| ID | Requirement | Prioridad |
|----|-------------|:---------:|
| ME-001 | RBAC: memory-search valida que caller tiene acceso al producto | 🔴 ALTA |
| ME-002 | HNSW index | 🟡 MEDIA |
| ME-003 | Cleanup job: DELETE físico (>30 días) | 🟡 MEDIA |
| ME-004 | Per-user quota (10K embeddings) + LRU eviction | 🟢 BAJA |
| ME-005 | Rate limiting (verificar aiLimiter existente: 30/min) | 🟢 BAJA |

### 2.2 Requisitos No Funcionales

| Requisito | Target |
|-----------|--------|
| Latencia búsqueda | < 100ms con 1M+ embeddings |
| Disponibilidad | 99.9% |
| Seguridad | user_id + product ownership validation 100% |
| Concurrency cleanup | 1 job hourly |

---

## 3. User Stories

| ID | Como | Quiero | Para |
|----|------|--------|------|
| MEM-01 | User A | solo ver memorias de productos que tengo acceso | no acceder a memorias de productos que no compré |
| MEM-02 | Sistema | validar que user tiene acceso al producto antes de buscar | impedir acceso no autorizado |
| MEM-03 | Sistema | hacer hard delete de memorias >30 días | reducir tamaño de DB |

---

## 4. Acceptance Criteria

| Criterio | Validación |
|----------|------------|
| AC-001 | memory-search filtra por user_id Y valida acceso al producto |
| AC-002 | HNSW search < 100ms con 1M+ registros |
| AC-003 | Cleanup job borra físicamente registros >30 días |
| AC-004 | Hard delete no deja registros huérfanos |
| AC-005 | > 10K embeddings → LRU eviction (borra más antiguos) |
| AC-006 | Rate limiting: verificar aiLimiter (30/min) o ajustar según necesidad |

---

## 5. Schema Updates

### 5.1 ai_embeddings Modifications

```sql
-- Índices necesarios para filtering y performance
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user ON ai_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_created ON ai_embeddings(created_at DESC);
```

### 5.2 HNSW Index

```sql
-- Agregar índice HNSW para búsqueda vectorial eficiente
CREATE INDEX ai_embeddings_hnsw_idx ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## 6. Security Requirements

### 6.1 Ownership Validation (RBAC)

El ownership se valida por **acceso al producto**, no por `session_id`.

| Operation | Validation | Error |
|-----------|------------|-------|
| `memory.search` | user tiene acceso al producto que contiene la memoria | 403 Forbidden |

**Flujo de validación:**

```
1. Caller proporciona userId + query + (opcional) sourceTypes
2. Para cada sourceId en los resultados, determinar el product_id asociado:
   - source_type='lesson' → obtener product_id de la tabla lessons
   - source_type='faq' → obtener product_id de la tabla product_faqs
   - source_type='review' → obtener product_id de la tabla product_reviews
   - etc.
3. Verificar acceso al producto (creator OR buyer OR affiliate)
4. Si user NO tiene acceso a cualquier producto → 403
5. Si tiene acceso → continuar con búsqueda
```

**Nota sobre sourceId → productId:**

La tabla `ai_embeddings` no tiene `product_id` directamente. Para validar acceso:
- **Opción recomendada**: Modificar `memory.repository.ts` para hacer un JOIN con las tablas originales
- **Alternativa**: Modificar `semanticSearch()` para retornar `source_id` y validar acceso en el service

**Casos de borde a manejar:**

| Caso | Comportamiento esperado |
|------|-------------------------|
| Producto borrado | Verificar que el source existe antes de retornar |
| Acceso revocado | Verificar en cada request, no caching |
| User sin purchases | Solo ver memorias propias (user_id match) |

### 6.2 Input Validation

| Campo | Validación |
|-------|------------|
| `query` | String, max 2000 chars, no empty |
| `limit` | Integer, 1-100, default 10 |
| `userId` | UUID válido |
| `sourceTypes` | Array de valores válidos del enum |

### 6.3 Rate Limiting

| Endpoint | Límite | Response | Notas |
|----------|--------|----------|-------|
| `memory.search` | 30-100 requests/min/user | 429 Too Many Requests | **Verificar**: El endpoint ya usa `aiLimiter` (30/min) en `ai.routes.ts:274`. Ajustar si es necesario. |

---

## 7. Performance Requirements

| Métrica | Target | Notas |
|---------|--------|-------|
| Latencia búsqueda | < 100ms | Con 1M+ embeddings, HNSW |
| Throughput | 1000 req/min | Por instance |
| Tiempo indexing | < 5 min | Para 100K embeddings |

---

## 8. Code Standards (referencia del proyecto)

> **Patrón del proyecto**: Standard Service Pattern — servicios importan repos directamente, NO DI container, NO decorators.

### 8.1 Service Layer (`memory.service.ts`)

```typescript
// ✅ CORRECTO - patrón del proyecto
export class MemoryService {
  async searchSimilar(userId, query, limit, sourceTypes) {
    // Validación de input
    if (!query || query.length === 0) {
      throw new AppError('Query is required', 400);
    }
    // Lógica...
  }
}
export const memoryService = new MemoryService();
```

### 8.2 Repository Layer (`memory.repository.ts`)

```typescript
// ✅ CORRECTO - patrón del proyecto
export const memoryRepository = {
  async semanticSearch(vector, userId, limit, sourceTypes) {
    // SQL con parameterized queries
    // Retornar mapped results
  }
};
```

### 8.3 Imports

```typescript
// ✅ CORRECTO
import { memoryRepository } from '../../repositories/ai/memory.repository';
import { embeddingService } from './embedding.service';
import { AppError } from '../../errors/AppError';

// ❌ INCORRECTO - no DI container
// import { container } from 'tsyringe';
// container.resolve(MemoryService);
```

### 8.4 Validación de Ownership (T2)

Para validar acceso al producto, usar los servicios/ repositories existentes:

```typescript
// Verificar acceso a producto antes de buscar memorias
async function checkProductAccess(
  userId: string,
  sourceTypes: EmbeddingSourceType[]
): Promise<boolean> {
  // Pattern: verificar purchase o acceso existente
  // Usar accessService, purchaseRepository, etc.
  // NO inventar nuevos patrones
}
```

---

## 9. Estado

**Estado**: ✅ COMPLETO (implementado Mayo 2026 - PRs #13, #14, #15 mergeados)