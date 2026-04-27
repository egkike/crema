# SDD Tasks: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: ✅ DOC COMPLETA (2026-04-27)  
**Revision**: 2026-04-27 - Corregido: Concierge NO existe en código, se debe crear primero
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Depends on**: design.md

---

## Descubrimiento / Hallazgo

**El SDD actual asume que "Concierge agent existente" pero:**
- ❌ No existe `concierge.service.ts`
- ❌ No existe `concierge.routes.ts`
- ❌ Skill `concierge.chat` NO está registrado
- El Concierge debe CREARSE primero

---

## Task List (REVISADO)

| # | Task | Prioridad | Estado | Depende de |
|---|------|:---------:|--------|-----------|
| 1 | Crear Concierge service/agent | 🔴 ALTA | - |
| 2 | Agregar config keys support.* a ConfigService | 🔴 ALTA | 1 |
| 3 | Registrar Concierge como skill en Orchestrator | 🔴 ALTA | 1, 2 |
| 4 | Agregar routes /api/concierge con Orchestrator | 🔴 ALTA | 3 |
| 5 | Integrar con User Context | 🟡 MEDIA | user-context |
| 6 | Tests E2E | 🟡 MEDIA | 5 |

---

## Task Details

### Task 1: Crear Concierge service/agent

El Concierge no existe. Debe crearse en `src/services/ai/concierge.service.ts`:

```typescript
// src/services/ai/concierge.service.ts
export const conciergeService = {
  async handleChat(userId: string, message: string): Promise<{ response: string }> {
    // Implementar lógica de chat de soporte
    // Usar llmService para generar respuestas
    // Opcional: integrar memoryService para contexto
  }
}
```

### Task 2: Agregar config keys support.*

En `src/services/config.service.ts`:

```typescript
'support.timeout_ms',
'support.max_retries', 
'support.enabled',
'support.system_prompt',
'support.model',
```

### Task 3: Registrar Concierge como skill

En `src/services/ai/index.ts`:

```typescript
{
  id: 'concierge-chat',
  capability: 'concierge.chat',
  name: 'Concierge Support',
  description: 'AI Support Chatbot',
  handler: conciergeService.handleChat.bind(conciergeService),
  options: {
    timeout: configService.getNumber('support.timeout_ms', 30000),
    retries: configService.getNumber('support.max_retries', 2),
  }
}
```

### Task 4: Agregar routes /api/concierge

En `src/routes/` (nuevo archivo o existente):

```typescript
router.post('/concierge/chat',
  jwtAuthMiddleware,
  async (req, res) => {
    const result = await orchestrator.execute({
      capability: 'concierge.chat',
      input: { message: req.body.message, userId: req.user.id }
    });
    res.json(result);
  }
);
```

---

## Estado

**Estado**: 🟡 REVISIÓN (2026-04-27)
**Nota**: SDD corregido - Concierge debe crearse primero