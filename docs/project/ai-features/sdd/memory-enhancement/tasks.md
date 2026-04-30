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
| 1 | Schema: HNSW index + índices filtering | 🔴 ALTA | - | - |
| 2 | RBAC: validar acceso al producto en memory-search | 🔴 ALTA | - | - |
| 3 | HNSW index | 🟡 MEDIA | - | 1 |
| 4 | Cleanup job (hourly, DELETE >30 días) | 🟡 MEDIA | - | 1 |
| 5 | Per-user quota (10K) + LRU eviction | 🟢 BAJA | - | - |
| 6 | Rate limiting (verificar aiLimiter existente) | 🟢 BAJA | - | - |
| 7 | Tests unitarios | 🟡 MEDIA | - | 2, 4, 5 |

---

## Task Details

### Task 1: Schema Updates (HNSW + Filtering Indexes)

```sql
-- db/migrations/XX-memory-enhancement.sql

-- Índices para filtering y performance
CREATE INDEX IF NOT EXISTS idx_ai_embeddings_user ON ai_embeddings(user_id);
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

### Task 3: HNSW Index

**Dependencia**: Task 1 (índices de filtering deben existir primero)

```sql
-- Crear índice HNSW CONCURRENTLY para no bloquear reads
CREATE INDEX CONCURRENTLY ai_embeddings_hnsw_idx ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verificar que funciona correctamente
-- SELECT * FROM ai_embeddings ORDER BY embedding <=> '[...]' LIMIT 10;
```

**Parámetros:**
| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| m | 16 | Grado de conexión (32 para >500K vectores) |
| ef_construction | 64 | Calidad al construir el índice |
| ef_search | 40-100 | Búsqueda runtime (mayor = más preciso pero lento) |

**Consideraciones de performance:**
- Usar `CONCURRENTLY` para no bloquear writes durante la creación
- Crear en horas de baja actividad para datasets grandes
- Monitorear `ef_search` en producción y ajustar según necesidad

### Task 4: Cleanup Job (Hard Delete)

```typescript
// En queues/scheduler.ts
registerJob({
  name: 'memory:cleanup',
  cron: '0 * * * *', // hourly
  concurrency: 1,    // solo 1 instance
  processor: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db.query(
      `DELETE FROM ai_embeddings
       WHERE created_at < $1`,
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
     WHERE user_id = $1`,
    [userId]
  );

  const count = parseInt(rows[0].cnt);

  if (count >= QUOTA_MAX) {
    // LRU eviction: eliminar más antiguos (hard delete)
    await db.query(
      `DELETE FROM ai_embeddings
       WHERE id IN (
         SELECT id FROM ai_embeddings
         WHERE user_id = $1
         ORDER BY created_at ASC
         LIMIT $2
       )`,
      [userId, EVICT_BATCH]
    );

    logger.info({ userId, evicted: EVICT_BATCH }, 'LRU eviction completed');
  }
}
```

### Task 6: Rate Limiting (Verificar existente)

```typescript
// VERIFICACIÓN REQUERIDA antes de implementar:
// El endpoint /api/ai/embeddings/search ya usa aiLimiter (30/min)
// Located at: backend/src/routes/ai.routes.ts:274

// Si 30/min es insuficiente para memory-search:
// 1. Crear un rate limiter específico más permisivo (ej: 60/min)
// 2. O aumentar el límite de aiLimiter globalmente

// NO crear rate limiter duplicado sin verificar primero
```

**Nota**: El endpoint `GET /api/ai/embeddings/search` ya tiene `aiLimiter` (30/min).
Verificar si es suficiente antes de implementar rate limiting adicional.

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

  it('should delete old embeddings in cleanup job', async () => {
    // Test cleanup job (hard delete)
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