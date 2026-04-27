# SDD - AI Features

## Estado de Documentación SDD

### Completados ( ✅ ):

| SDD | proposal | spec | design | tasks | Código | Orchestrator | Estado |
|-----|:--------:|:----:|:------:|:-----:|:------:|:------------:|--------|
| memory-enhancement | ✅ | ✅ | ✅ | ✅ | ⚠️ Base | ❌ | 🟡 Parcial - Tareas 1-10 pendientes |
| ai-content-assistant | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | 🟡 Parcial - No registrado |

### Pendientes ( ❌ ):

| SDD | proposal | spec | design | tasks | Descripción |
|-----|:--------:|:----:|:------:|:-----:|-------------|
| qa-agent | ❌ | ❌ | ❌ | ❌ | Auto-respuesta IA para Q&A |
| reports-agent | ❌ | ❌ | ❌ | ❌ | Triage automático de denuncias |
| tutor-ai | ❌ | ❌ | ❌ | ❌ | Tutor IA Avanzado |
| insights-agent | ❌ | ❌ | ❌ | ❌ | Dashboard IA con NLP |
| interactive-agent | ❌ | ❌ | ❌ | ❌ | Talleres interactivos |

---

## Servicios Implementados (sin integrar Orchestrator)

| Servicio | Archivo | Tests | Orchestrator |
|----------|---------|-------|--------------|
| ContentAssistantService | `ai/content/content-assistant.service.ts` | ✅ | ❌ |
| ContentReaderService | `ai/content/content-reader.service.ts` | ✅ | ❌ |
| QuizGeneratorService | `ai/content/quiz-generator.service.ts` | ✅ | ❌ |
| TranscriptionService | `ai/content/transcription.service.ts` | ✅ | ❌ |

---

## Estado de PRDs

- **architecture-improvements PRD**: ✅ COMPLETO - Todas las fases 1-7 implementadas (2026-04-27)
- **AI-FEATURES PRD**: 🟡 PARCIAL - Servicios base implementados, integración pendiente
- **content-security PRD**: 🟡 PARCIAL - Validaciones técnicas hechas, AI pending

---

## Dependencias entre PRDs

| architecture-improvements | AI-FEATURES | content-security |
|------------------------|------------|-------------------|
| Orchestrator ✅ | usa capabilities | - |
| ConfigService ✅ | usa configs | usa configs |
| User Context ✅ | integra con memoria | - |
| Error Handling ✅ | usa en todos | usa en todos |

---

## Próximos Pasos

### AI-FEATURES PRD:
1. Registrar servicios en Orchestrator (ai/content/*)
2. Implementar Memory Enhancement Tasks (1-10)
3. Crear SDDs: qa-agent, reports-agent, tutor-ai, insights-agent, interactive-agent

### content-security PRD:
1. Implementar checkboxes de copyright (Fase 1)
2. Allowlist de dominios externos
3. Integrar AI Moderation (Fase 2)

---

## Cómo usar

Para crear un nuevo SDD:

```bash
# crear estructura de directorios
mkdir -p sdd/{change-name}
touch sdd/{change-name}/proposal.md
touch sdd/{change-name}/spec.md  
touch sdd/{change-name}/design.md
touch sdd/{change-name}/tasks.md
```

Ver también: `../../common/verification-standard.md`