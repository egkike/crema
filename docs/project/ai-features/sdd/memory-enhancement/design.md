# SDD Design: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI  
**Tipo**: Arquitectura / Enhancement  
**SDD Phase**: Design  
**Estado**: ✅ DOC COMPLETA  
**Depends on**: spec.md

> **Estandar de Verificación**: Voir `docs/project/common/verification-standard.md`

> **Stack disponible**: Ver **[AI-FEATURES-PRD.md > Stack Disponible](#0-stack-disponible)** antes de diseñar. Reutilizar MemoryService existente, SkillsRegistry (Redis) y OrchestratorService en lugar de crear nuevas dependencias.

---

## 1. Resumen del Diseño

Implementar mejoras de seguridad y escalabilidad al Memory Service existente.

---

## 2. Arquitectura

### 2.1 Flujo Propuesto

```
[Agente] → [Orchestrator] → [Memory Capability] → [Memory Service]
                │                    │                │
                │                    │                ▼
                │                    │      [Memory Repository]
                │                    │                │
                │                    │                ▼
                │                    │      [ai_embeddings + HNSW]
                │                    │                │
                │                    │                ▼
                │             [BullMQ Jobs]           
                │                    │                │
                │              ┌────┴────┐       
                ▼              │         ▼        
           [Response]     cleanup   summarize  
```

### 2.2 Orchestrator Capabilities

```typescript
// Nuevas capabilities
const memoryCapabilities = [
  {
    capability: 'memory.store',
    description: 'Guardar memoria',
    handler: memoryService.store.bind(memoryService),
    input: { sessionId: string, content: string, userId: string },
    validate: (input) => {
      // RBAC: user_id debe ser owner de session_id
      return validateOwnership(input.userId, input.sessionId);
    }
  },
  {
    capability: 'memory.recall',
    description: 'Recuperar memorias',
    handler: memoryService.recall.bind(memoryService),
    input: { sessionId: string, query: string, userId: string },
    validate: (input) => {
      return validateOwnership(input.userId, input.sessionId);
    }
  }
];
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
      'UPDATE ai_embeddings SET is_deleted = TRUE WHERE created_at < $1 AND is_deleted = FALSE',
      [cutoff]
    );
  }
};
```

### 3.2 Summarization Job

```typescript
// Job: memory:summarize
// Frequency: cada 30 min
// Concurrency: max 10

const summarizeJob: CronJobDef = {
  name: 'memory:summarize',
  cron: '*/30 * * * *', // cada 30 min
  concurrency: 10, // max 10 concurrentes
  processor: async () => {
    // Obtener sesiones > 50 mensajes
    const sessions = await getSessionsNeedingSummarization(50);
    
    for (const session of sessions) {
      // No exceder concurrency
      if (running >= 10) break;
      
      // Generar summary
      const summary = await llm.summarize(session.messages);
      
      // Guardar summary + marcar originales
      await storeSummary(session.id, summary);
    }
  }
};
```

---

## 4. Rate Limiting

```typescript
// Rate limiter per user
const memoryRateLimiter = {
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 100, // 100 embeddings por minuto
  
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

## 5. Per-User Quota

```typescript
// Quota: 10K embeddings por usuario
// Eviction: LRU (Least Recently Used)

const userQuota = {
  maxEmbeddings: 10000,
  
  async check(userId: string): Promise<boolean> {
    const count = await db.query(
      'SELECT COUNT(*) FROM ai_embeddings WHERE user_id = $1 AND is_deleted = FALSE',
      [userId]
    );
    
    if (count >= this.maxEmbeddings) {
      // LRU eviction
      await this.evictLRU(userId);
    }
    
    return true;
  },
  
  async evictLRU(userId: string): Promise<void> {
    // Eliminar más antiguo cuando excede quota
    await db.query(`
      DELETE FROM ai_embeddings 
      WHERE id IN (
        SELECT id FROM ai_embeddings 
        WHERE user_id = $1 AND is_deleted = FALSE
        ORDER BY created_at ASC 
        LIMIT 100
      )
    `, [userId]);
  }
};
```

---

## 6. Estado

**Estado**: DRAFT