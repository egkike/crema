# SDD - AI Features

## Estado de Documentación SDD

### Completados ( ✅ ):

| SDD | proposal | spec | design | tasks | Código | Orchestrator | Estado |
|-----|:--------:|:----:|:------:|:-----:|:------:|:------------:|--------|
| memory-enhancement | ✅ | ✅ | ✅ | ✅ | ⚠️ Base | ✅ | ✅ Completado |
| ai-content-assistant | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Completado |

### Pendientes ( ❌ ):

Nenhum SDD pendente - todos los servicios están registrados en Orchestrator.

---

## Serviços Implementados

### Base Services (Core AI) ✅
| Serviço | Arquivo | Tests | Orchestrator |
|---------|---------|-------|--------------|
| LLM Service | `ai/llm.service.ts` | ❌ | ✅ |
| Embedding Service | `ai/embedding.service.ts` | ❌ | ✅ |
| Memory Service | `ai/memory.service.ts` | ❌ | ✅ |
| Credits Service | `ai/credits.service.ts` | ❌ | ✅ |

### Content Services (AI Content Assistant) ✅
| Serviço | Arquivo | Tests | Orchestrator |
|---------|---------|-------|--------------|
| ContentAssistantService | `ai/content/content-assistant.service.ts` | ✅ | ✅ |
| ContentReaderService | `ai/content/content-reader.service.ts` | ✅ | ✅ |
| QuizGeneratorService | `ai/content/quiz-generator.service.ts` | ✅ | ✅ |
| TranscriptionService | `ai/content/transcription.service.ts` | ✅ | ✅ |

### Agent Services (implementados) ✅
| Serviço | Arquivo | Orchestrator |
|---------|---------|--------------|
| QAAgentService | `agents.service.ts` | ✅ |
| TutorService | `agents.service.ts` | ✅ |
| InsightsService | `agents.service.ts` | ✅ |
| AnalyticsService | `agents.service.ts` | ✅ |

### Moderation Services ✅ Parcial
| Serviço | Arquivo | Orchestrator |
|---------|---------|--------------|
| ConciergeService | `ai/concierge.service.ts` | ✅ |
| QAService | `ai/qa.service.ts` | ❌ |
| ReviewService | `ai/review.service.ts` | ❌ |
| DenunciationService | `ai/denunciation.service.ts` | ❌ |

---

## Estado de PRDs

- **architecture-improvements PRD**: ✅ COMPLETO (2026-04-27)
- **AI-FEATURES PRD**: ✅ COMPLETO - 18 serviços, todos en Orchestrator (2026-04-28)
- **content-security PRD**: 🟡 PARCIAL - Validações técnicas feitas

---

## Próximos Pasos

1. **Memory Enhancement Tasks 1-10** - RBAC, HNSW, Quota

---

## Cómo usar

Para criar um novo SDD:

```bash
mkdir -p sdd/{change-name}
touch sdd/{change-name}/{proposal,spec,design,tasks}.md
```

Ver también: `../../common/verification-standard.md`