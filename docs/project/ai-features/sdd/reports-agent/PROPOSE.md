# SDD Proposal: Reports Agent (Triage Automático)

**Change**: reports-agent
**Type**: AI Feature (Moderation)
**SDD Phase**: Proposal
**Status**: ✅ APPROVED & COMPLETED
**Date**: Mayo 2026
**Owner**: Kike García
**PRD Ref**: AI-FEATURES-PRD.md §2.4.2

---

## 1. Intent

Agregar triage automático con IA al sistema de reports existente. Cuando llega una denuncia nueva, el Agent la clasifica por severity (1-3), sugiere el motivo probable, detecta spam, y propone una acción sugerida para el admin.

> **Del PRD (§2.4.2):** "Denuncia → AI clasifica (severity) → Respuesta automática → Admin revisa"

## 2. Scope

### In Scope
- Función `triageReport()` en `reportService`
- Integración con `memoryService` (políticas de contenido)
- Prompt de clasificación (severity 1-3, reason match, spam detection)
- Endpoint `POST /api/admin/reports/:reportId/triage` (admin only)
- Credit consumption (opcional, v1 puede ser gratis)

### Out of Scope
- Auto-resolución (admin siempre revisa antes de actuar)
- Notificaciones automáticas (ya existe `notificationService`, se puede agregar después)
- Retención de fondos automática (requiere lógica de negocio separate)
- Frontend (queda para frontend team)

## 3. Approach

### Ubicación del código

- **Service**: Extender `reportService` en `services/ai/denunciation.service.ts` (NO crear servicio nuevo)
- **Repository**: `repositories/ai/denunciation.repository.ts` — exportado como `denominationRepository`
- **Routes**: `routes/admin.routes.ts` (agregar endpoint)
- **Memory**: Reutilizar `memoryService` con `source_type = 'policy'`

### API Real del Repositorio

El repositorio existente (`denunciation.repository.ts`) exporta `denominationRepository` (así llamado por convención del codebase). Método para obtener un report por ID:

```typescript
denominationRepository.getReportById(reportId: string): Promise<Report | null>
```

### API Real de Memory Service

`memoryService.searchSimilar(userId, query, limit, sourceTypes?)` — no existe `retrieve()`.

```typescript
memoryService.searchSimilar(null, report.description, 3, ['policy']): Promise<EmbeddingSearchResult[]>
```

### API Real de LLM Service

```typescript
// Signature correcta:
llmService.chat({ messages, model?, temperature?, maxTokens? }): Promise<LLMResponse>

// Para construir messages con delimiters de seguridad:
llmService.buildPrompt(systemPrompt, context, userQuestion): LLMMessage[]
// → retorna [{ role: 'system', content: systemPrompt }, { role: 'system', content: context }, { role: 'user', content: '[USER_INPUT_START]\n${userQuestion}\n[USER_INPUT_END]' }]
```

### Patrones a Reutilizar

Ver `docs/project/reusable-resources.md`:
- **Singleton service** → `reportService` ya existe, solo agregar método
- **LLMService** → para generar clasificación (usar `OPENAI_MODEL` de config)
- **MemoryService** → para recuperar políticas de contenido (usar `searchSimilar`)
- **AppError** → manejo de errores
- **jwtAuthMiddleware** → auth admin

### Flujo de Clasificación

```
createReport (usuario)
    │
    ▼
admin ve la denuncia (GET /api/admin/reports)
    │
    ▼
POST /api/admin/reports/:id/triage  ← Admin pide triage
    │
    ▼
reportService.triageReport()
    ├── denominationRepository.getReportById(reportId)
    ├── memoryService.searchSimilar(null, description, 3, ['policy'])
    ├── llmService.buildPrompt(systemPrompt, policyContext, description)
    ├── llmService.chat({ messages, model: config.ai.openaiModel, ... })
    └── retorna { reason, severity, isSpam, suggestedAction }
    │
    ▼
Admin revisa sugerencia → decide acción
```

### Severity Levels

| Level | Criteria | Action |
|-------|----------|--------|
| 1 | Spam, técnico, trivial | Auto-resolver con respuesta automática |
| 2 | Copyright, misleading, inapropiado | Requiere revisión admin |
| 3 | Fraude, harassment | Alertar urgent, considerar retención de fondos |

### Security

- Prompt injection defense: `llmService.buildPrompt()` agrega delimiters automáticamente; NO poner user input en system prompt
- Solo admin puede pedir triage (`restrictTo('ADMIN')` en endpoint individual — aunque admin.routes ya tiene `router.use(restrictTo('ADMIN'))`)
- No exponer reasons/suggestions al usuario normal

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Prompt injection | `buildPrompt()` valida y rechaza input con delimiters, wrappea user input automáticamente |
| Clasificación incorrecta | Admin siempre decide, AI solo sugiere |
| Falso positivo (spam) | Threshold alto para `isSpam`, marcar como review manual |
| LLM no responde | Timeout 5s, retry 1 vez, si falla → fallback severity=2 |

## 5. Alternatives Considered

1. **Sin IA (solo reglas heurísticas)**: No — demasiados edge cases, no escala
2. **Auto-resolución sin admin**: No — demasiado riesgo, policy de Crema requiere supervisión
3. **Crear servicio nuevo `reportsAgentService`**: No — ya existe `reportService`, agregar método es más simple

---

## Next Step

Pasar a **SPEC.md** con requisitos funcionales detallados.