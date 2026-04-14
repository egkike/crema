# SDD - TASKS: AI Content Assistant

**Change**: ai-content-assistant  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: En progreso

---

## Roadmap de Implementación

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Infrastructure & Setup | ✅ Completado |
| Phase 2 | ContentReaderService | ✅ Completado |
| Phase 3 | ContentAssistantService | ✅ Completado |
| Phase 4 | QuizGeneratorService | ✅ Completado |
| Phase 5 | TranscriptionService | ✅ Completado |
| Phase 6 | API Routes | ✅ Completado |
| Phase 7 | Rate Limiting | ✅ Completado |
| Phase 8 | Testing | 📋 Pendiente |
| Phase 9 | Documentation | 📋 En progreso |

---

## Phase 1: Infrastructure & Setup ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 1.1 | Crear tipos TypeScript en `backend/src/types/ai-content.types.ts` | ✅ |
| 1.2 | Crear config en `backend/src/config/ai-content.config.ts` | ✅ |
| 1.3 | Crear directorio `backend/src/services/ai/content/` | ✅ |

---

## Phase 2: ContentReaderService ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 2.1 | Implementar `content-reader.service.ts` - extracción de PDF, MD, TXT | ✅ |
| 2.2 | Implementar test `content-reader.service.test.ts` (24 tests) | ✅ |
| 2.3 | Crear schema de validación | ✅ |

---

## Phase 3: ContentAssistantService ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 3.1 | Implementar `content-assistant.service.ts` - agente unificado | ✅ |
| 3.2 | Implementar test `content-assistant.service.test.ts` | ✅ |
| 3.3 | Crear prompt templates por tipo de producto | ✅ |
| 3.4 | Integrar con LLMService existente | ✅ |

---

## Phase 4: QuizGeneratorService ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 4.1 | Implementar `quiz-generator.service.ts` - generación de quizzes | ✅ |
| 4.2 | Implementar test `quiz-generator.service.test.ts` | ✅ |
| 4.3 | Integrar con ContentReaderService | ✅ |

---

## Phase 5: TranscriptionService ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 5.1 | Implementar `transcription.service.ts` - transcripción audio/video | ✅ |
| 5.2 | Implementar test `transcription.service.test.ts` | ✅ |
| 5.3 | Integrar con Plan Pro y credits | ✅ |

---

## Phase 6: API Routes ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 6.1 | Agregar endpoint POST `/api/ai/content/assist` | ✅ |
| 6.2 | Agregar endpoint POST `/api/ai/quiz/generate` | ✅ |
| 6.3 | Agregar endpoint POST `/api/ai/transcribe` | ✅ |
| 6.4 | Agregar endpoint GET `/api/ai/transcription/usage` | ✅ |

**Dependencies**: Phase 1-5 completados

---

## Phase 7: Rate Limiting ✅

| Task | Descripción | Status |
|------|-------------|--------|
| 7.1 | Configurar rate limiter para `/ai/content/assist` (10/min) | ✅ |
| 7.2 | Configurar rate limiter para `/ai/quiz/generate` (5/min) | ✅ |
| 7.3 | Configurar rate limiter para `/ai/transcribe` (3/min) | ✅ |
| 7.4 | Implementar Plan-based limits | ✅ |

**Dependencies**: Phase 6 (API Routes)

---

## Phase 8: Testing 📋

| Task | Descripción | Status |
|------|-------------|--------|
| 8.1 | Ejecutar integration tests end-to-end | 📋 |
| 8.2 | Validar coverage > 80% en todos los servicios | 📋 |
| 8.3 | Testing de carga básico | 📋 |
| 8.4 | Testing de seguridad (prompt injection) | 📋 |
| 8.5 | Testing de edge cases | 📋 |

**Dependencies**: Phases 1-7 completados

---

## Phase 9: Documentation 📋

| Task | Descripción | Status |
|------|-------------|--------|
| 9.1 | Crear PROPOSE.md | ✅ Completado |
| 9.2 | Crear SPEC.md | ✅ Completado |
| 9.3 | Crear DESIGN.md | ✅ Completado |
| 9.4 | **Crear SECURITY.md** | 📋 En progreso |
| 9.5 | Actualizar README del proyecto | 📋 |

---

## Dependencies Map

```
Phase 1 (Setup)
    ↓
Phase 2 (ContentReader)
    ↓
Phase 3 (ContentAssistant) ← Phase 2
    ↓
Phase 4 (QuizGenerator) ← Phase 2
    ↓
Phase 5 (Transcription) ← Phase 2
    ↓
Phase 6 (API Routes) ← Phase 1-5
    ↓
Phase 7 (Rate Limiting) ← Phase 6
    ↓
Phase 8 (Testing) ← Phase 1-7
    ↓
Phase 9 (Docs) ← Todas las fases
```

---

## Estimación de Esfuerzo

| Phase | Complejidad | Estimación |
|-------|-------------|------------|
| Phase 1 | Baja | 2 horas |
| Phase 2 | Media | 4 horas |
| Phase 3 | Media | 6 horas |
| Phase 4 | Media | 4 horas |
| Phase 5 | Alta | 6 horas |
| Phase 6 | Media | 4 horas |
| Phase 7 | Baja | 2 horas |
| Phase 8 | Media | 4 horas |
| Phase 9 | Baja | 2 horas |
| **Total** | | **34 horas** |

---

## Siguiente Step

**Phase 6: API Routes** - Agregar los endpoints REST para consumir los servicios implementados.