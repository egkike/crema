# SDD - DESIGN: AI Content Assistant

**Change**: ai-content-assistant  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

> **Stack disponible**: Ver **[AI-FEATURES-PRD.md > Stack Disponible](#0-stack-disponible)** antes de diseñar. Reutilizar servicios existentes en lugar de crear nuevos.

---

## 1. Arquitectura General

### 1.1 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        AI CONTENT ASSISTANT ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐   │
│  │   Frontend  │────▶│  API Layer  │────▶│  Services   │────▶│  LLM Layer  │   │
│  │   (Astro)   │     │(ai.routes)  │     │   (AI)      │     │(llm.service)│   │
│  └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘   │
│         │                   │                   │                   │              │
│         │                   │                   │                   │              │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐   │
│  │  UI/UX      │    │ Auth +      │    │ Credit      │    │ Multi-      │   │
│  │  Components │    │ Rate Limit   │    │ Management  │    │ Provider   │   │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘   │
│                                                                    │              │
│  ┌───────────────────────────────────────────────────────────────────▼─────────┐  │
│  │                        BACKEND SERVICES                              │  │
│  ├──────────────────────────────────────────────────────────────────────────────┤  │
│  │                                                                       │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │  │
│  │  │ContentAssistant │  │ ContentReader     │  │ QuizGenerator    │   │  │
│  │  │   Service       │  │   Service         │  │   Service        │   │  │
│  │  │  (Unified Agent)│  │  (Parser)         │  │  (Quiz Gen)      │   │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │  │
│  │           │                  │                  │                │   │  │
│  │  ┌──────▼──────────────────▼──────────────────▼──────────────┐   │  │
│  │  │            CONTENT PIPELINE                             │   │  │
│  │  │  1. Input Processing - File validation                   │   │  │
│  │  │  2. AI Processing - Context building + LLM call         │   │  │
│  │  │  3. Output Generation - Response parsing                 │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                       │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │  │
│  │  │ Transcription   │  │  Credits         │  │   Memory         │   │  │
│  │  │   Service        │  │  Service         │  │   Service        │   │  │
│  │  │  (Whisper API)   │  │ (ai-credits)     │  │ (embeddings)     │   │  │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Componentes Principales

| Componente | Responsabilidad | Ubicación |
|-----------|--------------|------------|
| **ContentAssistantService** | Agente unificado con type detection para 6 productos | `services/ai/content/content-assistant.service.ts` |
| **ContentReaderService** | Extracción de contenido de PDF, texto, URLs | `services/ai/content/content-reader.service.ts` |
| **QuizGeneratorService** | Generación de quizzes desde contenido | `services/ai/content/quiz-generator.service.ts` |
| **TranscriptionService** | Transcripción audio/video (60 min/mes Pro) | `services/ai/content/transcription.service.ts` |
| **LLMService** | Interfaz unificada multi-provider | `services/ai/llm.service.ts` |
| **CreditsService** | Gestión de créditos y balance | `services/ai/credits.service.ts` |

### 1.3 Tipos de Productos Soportados

| Tipo | Extensiones | Capability |
|------|-------------|-----------|
| **course** | .md, .txt, .pdf | Course outline, Lessons, Quizzes |
| **ebook** | .md, .txt, .pdf | Chapter summary, Table of contents |
| **membership** | .txt, .md | Benefits, Tier description |
| **software** | .txt, .md | Features, Documentation |
| **podcast** | .mp3, .wav, .m4a | Show notes, Transcription |
| **audiobook** | .mp3, .wav, .m4a | Chapter markers, Summary |

---

## 2. Sequence Diagrams

### 2.1 Content Assistant Flow

```
Client → Routes → ContentAssistant → ContentReader → LLMService
                                      ↓
                               CreditsService
```

1. Client envía POST /ai/content/assist
2. Routes valida JWT y rate limit
3. ContentAssistant detecta tipo de producto
4. ContentReader extrae contenido
5. LLMService procesa y retorna respuesta
6. CreditsService deduce créditos

### 2.2 Quiz Generator Flow

```
Client → Routes → QuizGenerator → ContentReader → LLMService
                                       ↓
                                CreditsService
```

1. Client envía POST /ai/quiz/generate
2. Routes valida JWT y credits
3. QuizGenerator extrae contenido
4. LLMService genera quiz JSON
5. CreditsService deduce 5 créditos

### 2.3 Transcription Flow

```
Client → Routes → Transcription → Credits(Plan) → Whisper API
                                    ↓
                              Update quota
```

1. Client envía POST /ai/transcribe
2. Routes valida JWT y Plan Pro
3. Transcription verifica quota (60 min/mes)
4. Whisper API transcribe audio
5. CreditsService deduce minutos usados

---

## 3. Módulos Afectados

### 3.1 Archivos Creados

| Archivo | Descripción |
|---------|-------------|
| `backend/src/types/ai-content.types.ts` | Tipos TypeScript + Zod schemas |
| `backend/src/config/ai-content.config.ts` | Configuración centralizada |
| `backend/src/services/ai/content/content-reader.service.ts` | Extracción de contenido |
| `backend/src/services/ai/content/content-assistant.service.ts` | Agente unificado |
| `backend/src/services/ai/content/quiz-generator.service.ts` | Generación de quizzes |
| `backend/src/services/ai/content/transcription.service.ts` | Transcripción audio |

### 3.2 Archivos a Modificar (pendiente)

| Archivo | Cambio |
|---------|--------|
| `backend/src/routes/ai.routes.ts` | Agregar endpoints /api/ai/content/* |
| `backend/src/middlewares/rate-limit.ts` | Agregar rate limiters específicos |

---

## 4. Integración con Servicios Existentes

### 4.1 LLMService

```typescript
// Reutilizar LLMService existente
import { llmService, type LLMMessage } from './llm.service';

// Construcción de prompts
const messages: LLMMessage[] = [
  { role: 'system', content: SYSTEM_PROMPT },
  { role: 'user', content: `[USER_INPUT_START]\n${input}\n[USER_INPUT_END]` },
];

const response = await llmService.chat({
  messages,
  model: 'gpt-4o-mini',
  temperature: 0.7,
  maxTokens: 2000,
});
```

### 4.2 CreditsService

```typescript
// Verificar y usar créditos
const hasCredits = await aiCreditService.hasSufficientCredits(userId, cost);
if (!hasCredits) {
  throw new AppError('Insufficient credits', 402);
}

await aiCreditService.useCredits(userId, cost, 'Content Assistant', referenceId);
```

---

## 5. Data Flow

### 5.1 Content Assistant

```
Input (file/url)
     │
     ▼ Validation (JWT, size, type)
     │
     ▼ Type Detection (6 tipos)
     │
     ▼ Content Reader (PDF/MD/TXT)
     │
     ▼ Context Builder (prompt)
     │
     ▼ LLM Call (provider)
     │
     ▼ Response Parser
     │
     ▼ Credit Deduction
     │
     ▼ Output (JSON/Markdown)
```

### 5.2 Transcription

```
Input (audio file)
     │
     ▼ Validation (JWT, Pro plan)
     │
     ▼ Duration Check
     │
     ▼ Plan Quota Check (60 min/mes)
     │
     ▼ Upload to Whisper
     │
     ▼ Transcribe
     │
     ▼ Deduct Minutes
     │
     ▼ Output (Transcript text)
```

---

## 6. Rate Limiting Strategy

### 6.1 Límites por Endpoint

| Endpoint | Límite | Ventana |
|----------|-------|---------|
| `POST /ai/content/assist` | 10 | minute |
| `POST /ai/quiz/generate` | 5 | minute |
| `POST /ai/transcribe` | 3 | minute |
| `GET /ai/content/status` | 30 | minute |

### 6.2 Plan-Based Limits

| Feature | Plan Free | Plan Pro | Plan Enterprise |
|---------|-----------|----------|-----------------|
| Content Assist | N/A | 100/month | Unlimited |
| Quiz Generate | N/A | 50/month | Unlimited |
| Transcription | N/A | 60 min/month | 300 min/month |

---

## 7. Error Handling

### 7.1 Códigos de Error

| Código | Mensaje | HTTP |
|-------|---------|------|
| INVALID_FILE_TYPE | File type not supported | 400 |
| FILE_TOO_LARGE | File exceeds limit | 400 |
| CONTENT_TOO_LONG | Content exceeds limit | 400 |
| TRANSCRIPTION_LIMIT_EXCEEDED | Minutes exceeded | 402 |
| INSUFFICIENT_CREDITS | Credits required | 402 |
| PLAN_REQUIRED | Pro plan required | 403 |
| LLM_ERROR | AI service error | 500 |
| TRANSCRIPTION_FAILED | Transcription failed | 500 |

### 7.2 Manejo de Errores

```typescript
try {
  validateInput(req.body);
  await checkAccess(userId, feature);
  const result = await processContent(input);
  res.json({ success: true, data: result });
} catch (error) {
  if (error instanceof AppError) throw error;
  logger.error({ error }, 'Content Assistant error');
  throw new AppError('Content generation failed', 500, { code: 'LLM_ERROR' });
}
```

---

## 8. Patrones a Reutilizar

| Patrón | Ubicación | Aplicación |
|--------|-----------|------------|
| Multi-provider LLM | `services/ai/llm.service.ts` | Reutilizar misma arquitectura |
| Credits management | `services/ai/credits.service.ts` | Balance checking |
| Agent conversation | `services/ai/agents.service.ts` | State management |
| SSE streaming | `routes/ai.routes.ts` | Streaming responses |
| Rate limiting | `middlewares/rateLimit/` | Limiter per-endpoint |
| Error handling | `errors/AppError.ts` | Consistent errors |

---

## 9. Consideraciones de Seguridad

### 9.1 Input Validation
- ✅ Validar tipo de archivo (allowlist: .pdf, .md, .txt, .mp3, .wav, .m4a)
- ✅ Limitar tamaño (10MB max)
- ✅ Sanitizar input (prompt injection prevention)
- ✅ Verificar JWT en todos los endpoints

### 9.2 Prompt Injection Prevention
- ✅ Usar delimiters: `[USER_INPUT_START]`, `[USER_INPUT_END]`
- ✅ Validar que input no contenga delimiters
- ✅ No ejecutar instrucciones del usuario como sistema

### 9.3 Rate Limiting
- ✅ Por usuario, por endpoint
- ✅ Plan-based limits
- ✅ Credit-based limits

---

## 10. Roadmap de Implementación

### Fase 1: MVP (Semana 1-2)
- [x] ContentReaderService (PDF, MD, TXT)
- [x] ContentAssistantService básico
- [x] Endpoints REST
- [x] Unit tests

### Fase 2: Quiz (Semana 2-3)
- [x] QuizGeneratorService
- [x] JSON schema validation
- [ ] Integration tests

### Fase 3: Transcription (Semana 3-4)
- [x] TranscriptionService
- [x] Whisper API integration
- [x] Minute tracking
- [x] Plan Pro limits

### Fase 4: Polish (Semana 4-5)
- [ ] SSE streaming
- [ ] Error handling completo
- [ ] Documentation (SECURITY.md)
- [ ] Load testing