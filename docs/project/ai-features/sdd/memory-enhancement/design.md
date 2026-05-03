# SDD Design: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI
**Tipo**: Arquitectura / Enhancement
**SDD Phase**: Design
**Estado**: ✅ COMPLETO (implementado Mayo 2026)
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
// Action: DELETE físico WHERE older than 30 days

const cleanupJob: CronJobDef = {
  name: 'memory:cleanup',
  cron: '0 * * * *', // hourly
  processor: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const result = await db.query(
      `DELETE FROM ai_embeddings
       WHERE created_at < $1`,
      [cutoff]
    );
    logger.info({ affected: result.rowCount }, 'Memory cleanup completed');
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
     WHERE user_id = $1`,
    [userId]
  );

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
  }
}
```

---

## 5. Rate Limiting

**Verificar antes de implementar:**

El endpoint `GET /api/ai/embeddings/search` ya utiliza `aiLimiter` (30/min) definido en `backend/src/middlewares/rateLimit/rateLimit.ts`.

```typescript
// Rate limiter existente en ai.routes.ts:274
router.get('/embeddings/search', jwtAuthMiddleware, aiLimiter, async (req, res) => {
  // aiLimiter = 30 requests/min por usuario
});
```

**Opciones:**
1. **Mantener aiLimiter** (30/min) — si es suficiente para memory-search
2. **Aumentar límite** — ajustar `maxRequests` en `rateLimit.ts`
3. **Crear memory-specific limiter** — solo si memory-search necesita límites diferentes

**NO crear rate limiter duplicado sin verificar el existente.**

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
// En memory.repository.ts - nuevo método para validar acceso
async validateProductAccessForSources(
  userId: string,
  sourceIds: { sourceType: EmbeddingSourceType; sourceId: string }[]
): Promise<boolean> {
  // Para cada source, determinar el product_id y verificar acceso
  const schema = config.db?.schema || 'public';

  for (const { sourceType, sourceId } of sourceIds) {
    // Obtener product_id según el source_type
    let productIdQuery = '';
    switch (sourceType) {
      case 'lesson':
        productIdQuery = `SELECT product_id FROM "${schema}".lessons WHERE id = $1`;
        break;
      case 'faq':
        productIdQuery = `SELECT product_id FROM "${schema}".product_faqs WHERE id = $1`;
        break;
      case 'review':
        productIdQuery = `SELECT product_id FROM "${schema}".product_reviews WHERE id = $1`;
        break;
      // ... otros casos
    }

    if (!productIdQuery) continue;

    const { rows: products } = await pool.query(productIdQuery, [sourceId]);
    if (products.length === 0) continue; // Source no existe

    const productId = products[0].product_id;

    // Verificar acceso: creator OR buyer OR affiliate
    const accessCheck = await pool.query(`
      SELECT 1 FROM (
        SELECT id FROM "${schema}".products WHERE id = $1 AND creator_id = $2
        UNION ALL
        SELECT id FROM "${schema}".orders WHERE product_id = $1 AND buyer_id = $2 AND status = 'completed'
        UNION ALL
        SELECT id FROM "${schema}".affiliate_sales WHERE product_id = $1 AND affiliate_id = $2
      ) AS access_check
      LIMIT 1
    `, [productId, userId]);

    if (accessCheck.rows.length === 0) {
      return false; // No tiene acceso
    }
  }

  return true; // Tiene acceso a todos
}
```

**Nota**: Usar el mismo patrón de queries que `ai.routes.ts:1233-1256` para consistencia.

### 6.3 Casos de Borde

| Scenario | Handling |
|---------|---------|
| User sin purchases | Retornar solo memorias propias (user_id match) |
| Producto eliminado | Verificar que source existe antes de retornar |
| Acceso revocado | Verificar en cada request, no cachear permisos |

---

## 7. Performance Considerations

### 7.1 HNSW Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| `m` | 16 | Default para <500K vectors |
| `ef_construction` | 64 | Balance quality/speed |
| `ef_search` | 40-100 | Runtime, mayor = más preciso |

### 7.2 Index Creation Strategy

```sql
-- Crear índice HNSW (la tabla solo tiene UNIQUE constraint, no hay IVFFlat)
CREATE INDEX CONCURRENTLY ai_embeddings_hnsw_idx ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Verificar que funciona correctamente
-- SELECT * FROM ai_embeddings ORDER BY embedding <=> '[...]' LIMIT 10;
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

**Estado**: ✅ COMPLETO (implementado Mayo 2026 - PRs #13, #14, #15 mergeados)