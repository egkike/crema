# SDD - AI Features

## Estado de Documentación SDD

### Completados ( ✅ ):

| SDD | proposal | spec | design | tasks | Código | Orchestrator | Estado |
|-----|:--------:|:----:|:------:|:-----:|:------:|:------------:|--------|
| memory-enhancement | ✅ | ✅ | ✅ | ✅ | ⚠️ Base | ✅ | ✅ Completado |
| ai-content-assistant | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ Completado |

### Pendientes ( ❌ ):

Ningún SDD pendiente — los servicios existen, solo necesitan registro en Orchestrator.

---

## Servicios Implementados

### Base Services (Core AI) ✅
| Servicio | Archivo | Tests | Orchestrator |
|----------|---------|-------|--------------|
| LLM Service | `ai/llm.service.ts` | ✅ | ✅ |
| Embedding Service | `ai/embedding.service.ts` | ✅ | ✅ |
| Memory Service | `ai/memory.service.ts` | ✅ | ✅ |
| Credits Service | `ai/credits.service.ts` | ✅ | ✅ |

### Content Services ✅
| Servicio | Archivo | Tests | Orchestrator |
|----------|---------|-------|--------------|
| ContentAssistantService | `ai/content/content-assistant.service.ts` | ✅ | ✅ |
| ContentReaderService | `ai/content/content-reader.service.ts` | ✅ | ✅ |
| QuizGeneratorService | `ai/content/quiz-generator.service.ts` | ✅ | ✅ |
| TranscriptionService | `ai/content/transcription.service.ts` | ✅ | ✅ |

### Agent Services ✅
| Servicio | Archivo | Tests | Orchestrator |
|----------|---------|-------|--------------|
| QAAgentService | `agents.service.ts` | ✅ | ✅ |
| TutorService | `agents.service.ts` | ✅ | ✅ |
| InsightsService | `agents.service.ts` | ✅ | ✅ |
| AnalyticsService | `agents.service.ts` | ✅ | ✅ |

### Moderation Services ✅
| Servicio | Archivo | Tests | Orchestrator |
|----------|---------|-------|--------------|
| ConciergeService | `ai/concierge.service.ts` | ✅ | ✅ |
| QAService | `ai/qa.service.ts` | ✅ | ✅ |
| ReviewService | `ai/review.service.ts` | ✅ | ✅ |
| DenunciationService | `ai/denunciation.service.ts` | ✅ | ✅ |

---

## Estado de PRDs

- **architecture-improvements PRD**: ✅ COMPLETO (2026-04-27)
- **AI-FEATURES PRD**: ✅ COMPLETO — 18 servicios, todos en Orchestrator (2026-04-28)
- **content-security PRD**: 🟡 PARCIAL - Validaciones técnicas realizadas

---

## Gaps Reales (Pendientes de Implementar - Option C)

> **Nota**: SDD actualizado para patrón RAG de Crema (NO session_id, NO memory.store/recall, NO summarization de conversaciones, NO memory_type, NO soft delete — no aplican al patrón de memoria de contenido de productos).

### Alta Prioridad
| Task | Descripción | Estado |
|------|-------------|--------|
| T1 | Schema: HNSW index + índices filtering | ❌ Pendiente |
| T2 | RBAC: validar acceso al producto en memory-search | ❌ Pendiente |

### Media Prioridad
| Task | Descripción | Estado |
|------|-------------|--------|
| T3 | HNSW index | ❌ Pendiente |
| T4 | Cleanup job (hourly, DELETE >30 días) | ❌ Pendiente |
| T5 | Per-user quota (10K) + LRU eviction | ❌ Pendiente |
| T6 | Rate limiting (100/min) | ❌ Pendiente |

### Baja Prioridad
| Task | Descripción | Estado |
|------|-------------|--------|
| T7 | Tests unitarios | ❌ Pendiente |

### Features del Catálogo (sección 4 del PRD)
- 4.3 Conversational Reader
- 4.4 Micro-Learning Generator
- 4.5 Smart Chapters
- 4.6 Personalized Learning Path
- 4.7 AI Content Studio
- 4.8 AI Insights (expandir)
- 4.9 AI Support Chatbot (Concierge) — expandrir capabilities
- 4.10-4.20 (otras features)

---

## Cómo usar

Para crear un nuevo SDD:

```bash
mkdir -p sdd/{change-name}
touch sdd/{change-name}/{proposal,spec,design,tasks}.md
```

Ver también: `../../common/verification-standard.md`