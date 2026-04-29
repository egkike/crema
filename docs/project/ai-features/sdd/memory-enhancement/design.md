# SDD Design: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI
**Tipo**: Arquitectura / Enhancement
**SDD Phase**: Design
**Estado**: ✅ DOC COMPLETA
**Depends on**: spec.md

> **Estandar de Verificación**: Ver `docs/project/common/verification-standard.md`

---

## 1. Resumen del Diseño

Implementar mejoras de seguridad, performance y mantenimiento al Memory Service existente.

**Patrón de memoria en Crema**: RAG de contenido de productos (NO conversaciones de chat). El `user_id` filtra las memorias, y el ownership se valida por acceso al producto.

---

## 2. Arquitectura

### 2.1 Flujo Propuesto

```
[Caller] → [Orchestrator] → [memory-search capability]
                                    │
                                    ▼
                            [Memory Service]
                                    │
                        ┌───────────┴───────────┐
                        ▼                       ▼
              [Validate RBAC]          [Search Embeddings]
                        │                       │
                        ▼                       ▼
              [checkProductAccess]      [ai_embeddings + HNSW]
                        │
                        ▼
              [BullMQ Jobs]
                        │
                        ▼
              [memory:cleanup] (hourly)
```

### 2.2 RBAC Validation

```typescript
// En memory-search capability handler
async function handleMemorySearch(input: {
  userId: string;
  query: string;
  limit: number;
  sourceTypes?: EmbeddingSourceType[];
}) {
  // 1. Validar que tiene acceso a los productos
  if (sourceTypes && sourceTypes.length > 0) {
    const hasAccess = await checkProductAccessForSources(userId, sourceTypes);
    if (!hasAccess) {
      throw new AppError('No tienes acceso a este contenido', 403);
    }
  }

  // 2. Continuar con la búsqueda
  return memoryService.searchSimilar(userId, query, limit, sourceTypes);
}
```

---

## 3. Jobs (BullMQ)

### 3.1 Cleanup Job

```typescript
// Job: memory:cleanup
// Frequency: hourly
// Action: UPDATE is_deleted = TRUE WHERE older than 30 days

const cleanupJob: CronJobDef = {
  name: 'memory:cleanup',
  cron: '0 * * * *', // hourly
  processor: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE ai_embeddings
       SET is_deleted = TRUE
       WHERE created_at < $1 AND is_deleted = FALSE`,
      [cutoff]
    );
  }
};
```

---

## 4. Per-User Quota + LRU Eviction

```typescript
// Quota: 10K embeddings por usuario
// Eviction: LRU (Least Recently Used)

const QUOTA_MAX = 10000;
const EVICT_BATCH = 100;

async function checkQuotaAndEvict(userId: string): Promise<void> {
  const count = await db.query(
    `SELECT COUNT(*) as cnt FROM ai_embeddings
     WHERE user_id = $1 AND is_deleted = FALSE`,
    [userId]
  );

  if (count >= QUOTA_MAX) {
    // LRU eviction: eliminar más antiguos
    await db.query(
      `DELETE FROM ai_embeddings
       WHERE id IN (
         SELECT id FROM ai_embeddings
         WHERE user_id = $1 AND is_deleted = FALSE
         ORDER BY created_at ASC
         LIMIT $2
       )`,
      [userId, EVICT_BATCH]
    );
  }
}
```

---

## 5. Rate Limiting

```typescript
// Rate limiter per user (usando Redis existente)
const memoryRateLimiter = {
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 100,    // 100 embeddings por minuto

  async check(userId: string): Promise<boolean> {
    const key = `memory:ratelimit:${userId}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 60);
    }

    return count <= 100;
  }
};
```

---

## 6. Security Implementation (T2)

### 6.1 RBAC Validation Flow

```typescript
// En memory.service.ts - validar acceso antes de buscar

async searchSimilar(
  userId: string | null,
  query: string,
  limit: number = 10,
  sourceTypes?: EmbeddingSourceType[]
): Promise<EmbeddingSearchResult[]> {
  // 1. Validar input
  if (!query || query.trim().length === 0) {
    throw new AppError('Query is required', 400);
  }

  // 2. RBAC: validar acceso al producto (si sourceTypes especificados)
  if (userId && sourceTypes && sourceTypes.length > 0) {
    await this.validateProductAccess(userId, sourceTypes);
  }

  // 3. Continuar con búsqueda normal...
}
```

### 6.2 checkProductAccess Implementation

```typescript
// El método debe verificar que el usuario tiene acceso a TODOS los productos
// representados por los sourceTypes antes de hacer la búsqueda vectorial

async validateProductAccess(
  userId: string,
  sourceTypes: EmbeddingSourceType[]
): Promise<void> {
  // Para cada source_type, determinar qué productos están involucrados
  // y verificar que el usuario tiene acceso (purchase, subscription, etc.)

  // Si CUALQUIER sourceType no tiene acceso → 403
  const hasAccess = await checkUserProductAccess(userId, sourceTypes);
  if (!hasAccess) {
    throw new AppError('No tienes acceso a este contenido', 403);
  }
}
```

**Importante**: Usar los servicios/repositories existentes del proyecto:
- `accessService` para verificar acceso
- `purchaseRepository` para verificar compras
- **NO** crear nuevos patrones de verificación

### 6.3 Casos de Borde

| Scenario | Handling |
|---------|----------|
| User sin purchases | Retornar array vacío |
| Producto eliminado | Excluir del resultado (soft delete o check) |
| Acceso revocado | Verificar en cada request, no cachear permisos |

---

## 7. Performance Considerations

### 7.1 HNSW Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `m` | 16 | Default para <500K vectors |
| `ef_construction` | 64 | Balance quality/speed |
| `ef_search` | 40-100 | Runtime, mayor = más preciso |

### 7.2 Index Migration Strategy

```sql
-- Paso 1: Crear HNSW sin borrar IVFFlat
CREATE INDEX ai_embeddings_hnsw_idx ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Paso 2: Verificar que funciona correctamente
-- SELECT * FROM ai_embeddings ORDER BY embedding <=> '[...]' LIMIT 10;

-- Paso 3: Una vez verificado, eliminar IVFFlat
-- DROP INDEX IF EXISTS idx_ai_embeddings_vector;
```

### 7.3 Vacuum Schedule

- **Weekly**: `VACUUM ANALYZE ai_embeddings;`
- **After bulk deletes**: `VACUUM ANALYZE ai_embeddings;`
- **Autovacuum**: Configurar agresivo para esta tabla

---

## 8. Code Standards & Patterns

### 8.1 Patrón del Proyecto (del AGENTS.md)

> - **No DI Container**: Servicios importan repos directamente
> - **No Decorators**: TypeScript sin experimental decorators
> - **Standard Service Pattern**: Singleton exports

### 8.2 Estructura de Archivos

```
backend/src/services/ai/
├── memory.service.ts        ← NO es clase injectada, es singleton
├── embedding.service.ts
└── ...

backend/src/repositories/ai/
└── memory.repository.ts      ← NO DI, export directo
```

### 8.3 Validación de Input

```typescript
// Pattern correcto:
if (!input || typeof input !== 'object') {
  throw new AppError('Invalid input: must be an object', 400);
}

const { userId, query } = input as { userId: unknown; query: unknown };

if (typeof userId !== 'string' || userId.length === 0) {
  throw new AppError('userId is required', 400);
}
```

### 8.4 Errores

```typescript
// Usar AppError con status codes correctos:
// 400 - Bad Request (validation errors)
// 403 - Forbidden (RBAC failures)
// 429 - Too Many Requests (rate limiting)
// 500 - Internal Server Error (no exponer detalles)

// ✅ CORRECTO
throw new AppError('No tienes acceso a este contenido', 403);

// ❌ INCORRECTO
throw new Error('User does not have access'); // No AppError, mensaje genérico
```

---

## 9. Estado

**Estado**: ✅ Completado (pendiente implementación)