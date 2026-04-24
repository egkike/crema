# SDD Tasks: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: ✅ DOC COMPLETA (código pending)  
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Depends on**: design.md

---

## Task List

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Registrar Concierge como skill en Orchestrator | 🔴 ALTA | - |
| 2 | Reemplazar config hardcoded con ConfigService | 🔴 ALTA | 1 |
| 3 | Integrar Concierge routes con Orchestrator | 🔴 ALTA | 1 |
| 4 | Integrar con User Context (pending) | 🟡 MEDIA | user-context |
| 5 | Tests E2E | 🟡 MEDIA | 3 |

---

## Task Details

### Task 1: Registrar Concierge como skill

En `src/services/ai/index.ts`:
```typescript
skillsRegistry.register({
  capability: 'concierge.chat',
  name: 'Concierge Support',
  description: 'AI Support Chatbot',
  handler: conciergeAgent.handle.bind(conciergeAgent),
  config: {
    timeout: configService.getNumber('support.timeout_ms'),
    maxRetries: configService.getNumber('support.max_retries'),
  }
});
```

### Task 2: Reemplazar config hardcoded

```typescript
// src/services/concierge.service.ts
import { configService } from './config.service';

// Antes
const TIMEOUT = 30000;

// Después  
const TIMEOUT = configService.getNumber('support.timeout_ms', 30000);
```

### Task 3: Integrar con Orchestrator

```typescript
// routes/concierge.routes.ts
router.post('/chat', 
  jwtAuthMiddleware,
  async (req, res) => {
    const result = await orchestrator.execute({
      capability: 'concierge.chat',
      input: req.body.message,
    });
    res.json(result);
  }
);
```

---

## Estado

**Estado**: DRAFT