# SDD Tasks: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI
**Tipo**: Arquitectura / Enhancement
**SDD Phase**: Tasks
**Estado**: ✅ DOC COMPLETA (implementación pendiente)
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Schema updates: memory_type, is_deleted, índices | 🔴 ALTA | - | - |
| 2 | RBAC: validar acceso al producto en memory-search | 🔴 ALTA | - | - |
| 3 | HNSW index (reemplazar IVFFlat) | 🟡 MEDIA | - | - |
| 4 | Cleanup job (hourly, marca is_deleted=TRUE) | 🟡 MEDIA | - | 1 |
| 5 | Per-user quota (10K) + LRU eviction | 🟢 BAJA | - | - |
| 6 | Rate limiting (100/min) | 🟢 BAJA | - | - |
| 7 | Tests unitarios | 🟡 MEDIA | - | 2, 4, 5 |

---

## Task Details

### Task 1: Schema Updates

```sql
-- db/migrations/XX-memory-enhancement.sql

-- Agregar columnas
ALTER TABLE ai_embeddings
ADD COLUMN IF NOT EXISTS memory_type VARCHAR(20)
DEFAULT 'message'
CHECK (memory_type IN ('message', 'summary', 'system_instruction'));

ALTER TABLE ai_embeddings
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Índices para filtering y performance
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user ON ai_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_is_deleted ON ai_embeddings(is_deleted);
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_created ON ai_embeddings(created_at DESC);
```

### Task 2: RBAC Validation (🔴 CRÍTICO)

```typescript
// En memory.service.ts - modificar searchSimilar

async searchSimilar(
  userId: string | null,
  query: string,
  limit: number = 10,
  sourceTypes?: EmbeddingSourceType[]
): Promise<EmbeddingSearchResult[]> {
  // RBAC: validar acceso al producto
  if (userId && sourceTypes && sourceTypes.length > 0) {
    const hasAccess = await this.validateProductAccess(userId, sourceTypes);
    if (!hasAccess) {
      throw new AppError('No tienes acceso a este contenido', 403);
    }
  }

  // Continuar con búsqueda normal...
  const queryEmbedding = await embeddingService.generateEmbedding(query);
  const vectorStr = `[${queryEmbedding.join(',')}]`;
  return memoryRepository.semanticSearch(vectorStr, userId, limit, sourceTypes);
}

async validateProductAccess(
  userId: string,
  sourceTypes: EmbeddingSourceType[]
): Promise<boolean> {
  // Para cada source_type, verificar que el usuario tiene acceso
  // source_type = 'lesson' → verificar purchase
  // source_type = 'faq' → verificar acceso al producto
  // etc.
  // Retornar true si tiene acceso a TODOS los tipos solicitados
}
```

### Task 3: HNSW Migration

```sql
-- Crear índice HNSW (sin borrar IVFFlat primero)
CREATE INDEX ai_embeddings_hnsw_idx ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Cuando esté listo y verificado, eliminar IVFFlat
-- DROP INDEX IF EXISTS idx_ai_embeddings_vector;
```

**Parámetros:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| m | 16 | Grado de conexión (32 para >500K vectores) |
| ef_construction | 64 | Calidad al construir el índice |
| ef_search | 40-100 | Búsqueda runtime (mayor = más preciso pero lento) |

### Task 4: Cleanup Job

```typescript
// En queues/scheduler.ts
registerJob({
  name: 'memory:cleanup',
  cron: '0 * * * *', // hourly
  concurrency: 1,    // solo 1 instance
  processor: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.query(
      `UPDATE ai_embeddings
       SET is_deleted = TRUE
       WHERE created_at < $1 AND is_deleted = FALSE`,
      [cutoff]
    );

    logger.info({ affected: result.rowCount }, 'Memory cleanup completed');
  }
});
```

### Task 5: Per-User Quota + LRU

```typescript
// En memory.service.ts - modificar createEmbedding

const QUOTA_MAX = 10000;
const EVICT_BATCH = 100;

async createEmbedding(...) {
  // Verificar quota antes de crear
  if (userId) {
    await this.checkQuotaAndEvict(userId);
  }

  // Crear embedding...
}

async checkQuotaAndEvict(userId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT COUNT(*) as cnt FROM ai_embeddings
     WHERE user_id = $1 AND is_deleted = FALSE`,
    [userId]
  );

  const count = parseInt(rows[0].cnt);

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

    logger.info({ userId, evicted: EVICT_BATCH }, 'LRU eviction completed');
  }
}
```

### Task 6: Rate Limiting

```typescript
// En middleware o capability handler
const memoryRateLimiter = {
  windowMs: 60 * 1000,
  maxRequests: 100,

  async check(userId: string): Promise<boolean> {
    const key = `memory:ratelimit:${userId}`;
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, 60);
    }

    if (count > this.maxRequests) {
      throw new AppError('Rate limit exceeded', 429);
    }

    return true;
  }
};
```

### Task 7: Tests

```typescript
// Tests necesarios:
describe('MemoryService', () => {
  it('should validate product access before search', async () => {
    // Test que user sin acceso no puede buscar
  });

  it('should evict oldest when quota exceeded', async () => {
    // Test LRU eviction
  });

  it('should mark is_deleted for old embeddings', async () => {
    // Test cleanup job
  });
});
```

---

## Orden de Implementación Recomendado

```
1. Task 1 (Schema) → siempre primero
2. Task 2 (RBAC) → seguridad crítica
3. Task 3 (HNSW) → performance
4. Task 4 (Cleanup) → independence
5. Task 5 (Quota) → independence
6. Task 6 (Rate limit) → independence
7. Task 7 (Tests) → al final
```

---

## Estado

**Estado**: ✅ Completado (pendiente implementación)