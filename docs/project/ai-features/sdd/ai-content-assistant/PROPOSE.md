# SDD - PROPOSE: AI Content Assistant

**Change**: ai-content-assistant  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## 1. Objetivo

Habilitar asistencia inteligente para la creación de contenido en productos digitales (courses, ebooks, memberships, software, podcasts, audiobooks) mediante un agente unificado que detecta el tipo de producto y provee funcionalidades específicas de asistencia, lectura de contenido, generación de quizzes y transcripción de audio/video.

---

## 2. Scope

### 2.1 Módulos Incluidos

| Módulo | Descripción | Prioridad |
|--------|-------------|-----------|
| **ContentAssistantService** | Agente unificado con detección automática de tipo de producto | 🔴 Critical |
| **ContentReaderService** | Extracción y resumen de contenido desde múltiples fuentes (PDF, texto, URLs) | 🔴 Critical |
| **QuizGeneratorService** | Generación de quizzes/evaluaciones desde contenido | 🟡 Alta |
| **TranscriptionService** | Transcripción de audio/video a texto (Plan Pro - 60 min/mes) | 🟡 Alta |

### 2.2 API Endpoints

| Endpoint | Método | Descripción | Credits | Plan |
|----------|--------|-------------|---------|------|
| `/api/ai/content/assist` | POST | Asistencia de contenido | 5 | Pro |
| `/api/ai/quiz/generate` | POST | Generación de quizzes | 5 | Pro |
| `/api/ai/transcribe` | POST | Transcripción de audio | 1/min | Pro |
| `/api/ai/transcription/usage` | GET | Stats de uso | - | Pro |

### 2.3 Excluido del Scope

- Generación de voz (text-to-speech)
- Traducción automática de contenido
- Edición de video
- Integración con editors externos
- Funcionalidades para usuarios Free (solo Plan Pro)

---

## 3. Capabilities

### 3.1 New Capabilities

| Capability | Descripción |
|------------|-------------|
| `ai-content-assistant` | Agente unificado con type detection para 6 productos |
| `ai-content-reader` | Extracción de contenido de productos |
| `ai-quiz-generator` | Generación de quizzes desde contenido |
| `ai-transcription` | Transcripción de audio/video (Plan Pro: 60 min/mes, extra: 12 ARS/min) |

### 3.2 Modified Capabilities

| Capability | Cambio |
|------------|--------|
| `ai-credits` | Añadir operation type `generate_content` y `transcribe_audio` con costo específico |

---

## 4. Approach

Arquitectura **Unified Agent con Type Detection**:

```
┌─────────────────────────────────────────────────┐
│           ContentAssistantService            │
│  ┌─────────────────────────────────────┐ │
│  │ Type Detection (auto from product)     │ │
│  │ course | ebook | membership         │ │
│  │ software | podcast | audiobook      │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │ Product-Specific Prompt Templates    │ │
│  │ - course: curriculum + lessons     │ │
│  │ - ebook: chapters + summary       │ │
│  │ - membership: tier benefits       │ │
│  │ - software: docs + tutorials     │ │
│  │ - podcast: episodes + shownotes   │ │
│  │ - audiobook: chapters + narration │ │
│  └─────────────────────────────────────┘ │
│  ┌─────────────────────────────────────┐ │
│  │ LLMService (multi-provider)         │ │
│  └─────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Flujos Principales

**Content Assistant**:
1. User envía mensaje + productId
2. Service detecta tipo de producto desde DB
3. Carga prompt template específico
4. Envía a LLMService con context
5. Retorna respuesta + usa credits

**Transcription**:
1. User sube archivo de audio/video
2. Verifica Plan Pro (60 min/mes)
3. Si excede, cobra extra por credits
4. Whisper transcribe a texto
5. Retorna transcripción + usa credits

---

## 5. Gaps Identificados

| Gap | Impacto | Solución |
|-----|---------|----------|
| Whisper no integrado | Alto | Agregar a LLMService o crear wrapper |
| Transcription minutes tracking | Alto | Crear tabla de usage por usuario/mes |
| Rate limiting específico | Medio | Configurar nuevos limiters |

---

## 6. Dependencies

- **LLMService** (`backend/src/services/ai/llm.service.ts`): Ya implementado, multi-provider
- **CreditsService** (`backend/src/services/ai/credits.service.ts`): Ya implementado
- **ProductRepository**: Leer tipo de producto existente

---

## 7. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prompt injection | Medium | Input sanitization + delimiters (ya en LLMService) |
| Context overflow (>128K tokens) | Medium | Truncate context + warn user |
| Credits over-use | Low | Pre-check balance + max tokens |
| Transcription quota exceeded | Medium | Verificar quota antes de procesar |
| Provider API failure | Medium | Fallback entre providers |

---

## 8. Rollback Plan

1. **Feature Flag**: Deshabilitar en config sin deploy (`featureFlags.aiContentAssistant: false`)
2. **Revert**: Rollback a commit anterior si hay bugs críticos
3. **Database**: No hay migrations nuevas (solo leer productos existentes)

---

## 9. Success Criteria

- [ ] ContentAssistant responde correctamente para los 6 tipos de productos
- [ ] ContentReader extrae contenido de PDFs y texto
- [ ] QuizGenerator crea quizzes válidos desde contenido
- [ ] Transcription transcribe audio/video correctamente (60 min/mes Plan Pro)
- [ ] Credits se deducen correctamente por operación
- [ ] Rate limiting previene abuso (10 req/min, 100/day)
- [ ] API endpoint responde < 5s en promedio
- [ ] Tests unitarios coverage > 80% para nuevos servicios