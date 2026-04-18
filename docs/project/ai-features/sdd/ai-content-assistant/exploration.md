# Exploration: AI Content Assistant Integration

**Fecha**: Abril 2026  
**Estado**: Exploration Completada  
**Owner**: Kike García

---

## Current State

### Sistema de Productos Existente

| Componente | Status | Ubicación |
|------------|--------|-----------|
| **product_types** | ✅ Existe | `db/init/03-create-seeds.sql` línea 143 |
| **products table** | ✅ Existe | `db/init/01-create-tables.sql` línea 147 |
| **product_modules** | ✅ Existe | Tabla para organizar contenido |
| **product_lessons** | ✅ Existe | Contenido por lección |
| **product_lesson_quizzes** | ✅ Existe | JSON de preguntas |
| **product_prices** | ✅ Existe | Precios por moneda |

**Tipos de productos definidos**:
- `course` - Curso Online
- `ebook` - Libro Digital
- `membership` - Membresía
- `software` - Software / Acceso
- `podcast` - Podcast Premium
- `audiobook` - Audiolibro

### Sistema de AI Existente

| Componente | Status | Descripción |
|-----------|--------|-------------|
| **LLMService** | ✅ Existe | Multi-provider (OpenAI, Ollama, Anthropic, Gemini) |
| **credits.service** | ✅ Existe | Sistema de créditos AI |
| **agents.service** | ✅ Existe | QA Agent, Tutor AI, Insights |
| **embedding.service** | ✅ Existe | Embeddings para RAG |
| **memory.service** | ✅ Existe | Memoria de conversaciones |

**Arquitectura de agentes existente**:
- QA Agent: Chat con contexto de producto + FAQs
- Tutor AI: Tutor personalizado por producto
- Insights: Natural language to SQL

---

## Affected Areas

### Backend - Archivos a modificar

| Archivo | Why |
|--------|-----|
| `src/routes/ai.routes.ts` | Agregar nuevos endpoints para AI Content Assistant |
| `src/schemas/ai.schema.ts` | Agregar schemas de validación |
| `src/services/ai/llm.service.ts` | Reutilizar para generar contenido |

### Backend - Archivos a crear

| Archivo | Why |
|--------|-----|
| `src/services/ai/content-assistant.service.ts` | Nuevo servicio principal |
| `src/services/ai/content-reader.service.ts` | Parser para archivos |
| `src/services/ai/quiz-generator.service.ts` | Generador de quizzes |

### Base de datos

| Tabla | Acción |
|------|--------|
| `platform_plans` | Agregar `ai_transcription_minutes: 60` al Plan Pro |

---

## Approaches

### Approach 1: Unified Agent con Type Detection (Recomendado)

**Descripción**: Un solo agente que detecta el tipo de producto y adapta su comportamiento.

```typescript
// Flow
1. Creador selecciona tipo de producto (o se detecta del existing)
2. Creador proporciona contenido (.md, .txt, .pdf)
3. AI detecta tipo y genera asistencia específica
4. Creador revisa y confirma
5. Guardar en DB existente
```

| Pros | Cons |
|-----|------|
| Reutiliza `LLMService` existente | Prompt complexo |
| Un solo endpoint | Mayor carga cognitiva del LLM |
| Fácil de mantener | Puede tener edge cases |

**Esfuerzo**: Medium

### Approach 2: Múltiples Agentes Específicos

**Descripción**: Un agente diferente por tipo de producto.

| Pros | Cons |
|-----|------|
| Prompts optimizados por tipo | Más código a mantener |
| Mejor calidad por tipo | 6+ agentes diferentes |
| Easier testing | Más complexity |

**Esfuerzo**: High

### Approach 3: Pipeline Genérico

**Descripción**: Separar lectura de contenido de generación.

```
ContentReader → Parser → LLM → Generator → Output
```

| Pros | Cons |
|-----|------|
| Componentes reutilizables | Más archivos |
| Easy to test | Más integración |

**Esfuerzo**: Medium

---

## Recommendation

**Approach 1** (Unified Agent con Type Detection) por las siguientes razones:

1. **Reutilización máxma**: Usa `LLMService` existente sin duplicar código
2. **Mantenibilidad**: Un solo agente para mantener
3. **Simplicidad**: Un solo endpoint en la API
4. **Escalabilidad**: Agregar nuevos tipos es solo agregar prompts

### Implementation Plan

1. **Fase 1** (MVP - Course Assistant):
   - `CourseAssistantAgent` con prompts para courses
   - Parser para .md, .txt
   - Quiz generator

2. **Fase 2** (Extensión a otros tipos):
   - Agregar `ebook`, `digital_download`, etc.
   - ContentReader para PDF

3. **Fase 3** (Transcription):
   - Integrar Whisper API
   - Agregar feature al Plan Pro

---

## Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|-------|------------|--------|------------|
| **Prompt injection** | Media | Alto | Input sanitization + delimiters |
| **Output mal formato** | Baja | Medio | JSON validation + fallbacks |
| **Context overflow** | Media | Medio | Token limits |
| **Credito consumo excesivo** | Alta | Alto | Rate limiting + budget |
| **Tipo no detectado** | Baja | Bajo | Manual selection fallback |

### Security Considerations

- [x] **Input validation**: Max 10MB, extension allowlist (.md, .txt, .pdf)
- [x] **Auth required**: JWT + Plan Pro check
- [x] **Rate limiting**: 5 req/min
- [x] **Token budget**: 8000 max
- [x] **Prompt injection guard**: Delimiters + sanitization

---

## Ready for Proposal

**Yes** - La exploración está completa.

### Lo que sigue:

1. El usuario debe revisar este documento
2. Confirmar el approach recomendado
3. Proceder a **sdd-propose** para crear el change proposal

### Información necesaria del usuario:

- ¿Prioridad de tipos de productos a soportar en MVP?
- ¿Límites de transcripción deseados?
- ¿Pricing para AI Credits adicional?