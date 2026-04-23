# SDD Tasks: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI  
**Tipo**: Arquitectura / Enhancement  
**SDD Phase**: Tasks  
**Estado**: ✅ DOC COMPLETA (código pending)  
**Depends on**: design.md

> **Estandar de Verificación**: Voir `docs/project/common/verification-standard.md`

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Agregar columnas a ai_embeddings | 🔴 ALTA | - |
| 2 | Crear índice user_id | 🔴 ALTA | 1 |
| 3 | Implementar RBAC en memory.store | 🔴 ALTA | 1 |
| 4 | Implementar RBAC en memory.recall | 🔴 ALTA | 1 |
| 5 | Crear HNSW índice | 🟡 MEDIA | - |
| 6 | Crear cleanup job (hourly) | 🟡 MEDIA | - |
| 7 | Crear summarize job (batch) | 🟢 BAJA | - |
| 8 | Implementar per-user quota | 🟡 MEDIA | - |
| 9 | Implementar rate limiting | 🟢 BAJA | - |
| 10 | Tests unitarios | 🟡 MEDIA | 3, 4, 6, 7 |

---

## Task Details

### Task 1: Schema Updates

```sql
-- db/init/XX-memory-enhancement.sql

-- Agregar columnas como nullable primero
ALTER TABLE ai_embeddings 
ADD COLUMN IF NOT EXISTS user_id UUID,
ADD COLUMN IF NOT EXISTS memory_type VARCHAR(20) CHECK (memory_type IN ('message', 'summary', 'system_instruction')),
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Migrar datos existentes (solo si hay registros sin user_id)
UPDATE ai_embeddings SET user_id = (SELECT id FROM users LIMIT 1) WHERE user_id IS NULL;

-- Hacer user_id NOT NULL después de la migración
ALTER TABLE ai_embeddings ALTER COLUMN user_id SET NOT NULL;

-- Indexes
CREATE INDEX idx_ai_embeddings_user ON ai_embeddings(user_id);
CREATE INDEX idx_ai_embeddings_is_deleted ON ai_embeddings(is_deleted);
```

### Task 3-4: RBAC Implementation

```typescript
// En memory.service.ts
async store(input: StoreInput): Promise<void> {
  // RBAC: validar ownership
  const session = await sessionRepository.find(input.sessionId);
  
  if (!session || session.userId !== input.userId) {
    throw new AppError('No autorizado', 403);
  }
  
  // Guardar
  await this.repository.create({ ...input, userId: input.userId });
}

async recall(input: RecallInput): Promise<Memory[]> {
  // RBAC: validar ownership
  const session = await sessionRepository.find(input.sessionId);
  
  if (!session || session.userId !== input.userId) {
    throw new AppError('No autorizado', 403);
  }
  
  // Buscar
  return this.repository.find({
    userId: input.userId,
    query: input.query,
    isDeleted: false
  });
}
```

### Task 5: HNSW Migration

```sql
-- Crear índice HNSW (sin borrar IVFFlat primero)
CREATE INDEX ai_embeddings_hnsw_idx ON ai_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Cuando esté listo,(drop old index
-- DROP INDEX IF EXISTS ai_embeddings_ivfflat_idx;
```

### Task 6: Cleanup Job

```typescript
// En queues/scheduler.ts
registerJob({
  name: 'memory:cleanup',
  cron: '0 * * * *', // hourly
  processor: async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    await db.query(
      'UPDATE ai_embeddings SET is_deleted = TRUE WHERE created_at < $1',
      [cutoff]
    );
  }
});
```

### Task 7: Summarize Job

```typescript
registerJob({
  name: 'memory:summarize',
  cron: '*/30 * * * *',
  concurrency: 10,
  processor: async () => {
    const sessions = await getSessionsNeedingSummarization(50);
    
    for (const session of sessions.slice(0, 10)) {
      const summary = await llm.summarize(session.messages);
      await storeSummary(session.id, summary);
    }
  }
});
```

### Task 8: Quota

```typescript
// En memory.service.ts
async checkQuota(userId: string): Promise<boolean> {
  const count = await this.repository.count({ userId, isDeleted: false });
  
  if (count >= 10000) {
    // LRU eviction
    await this.repository.evictOldest(userId, 100);
  }
  
  return true;
}
```

---

## Estado

**Estado**: DRAFT