# SDD - SPEC: AI Content Assistant

**Change**: ai-content-assistant  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: ✅ Completado

> **Stack disponible**: Ver **[AI-FEATURES-PRD.md > Stack Disponible](#0-stack-disponible)** antes de planificar. OrchestratorService, LLMService, MemoryService, SkillsRegistry y BullMQ ya están implementados.

---

## 1. Requisitos (RFC 2119)

### 1.1 ContentAssistantService

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| REQ-CA-001 | El servicio DEBE detectar automáticamente el tipo de producto (course, ebook, membership, software, podcast, audiobook) | MUST |
| REQ-CA-002 | El servicio DEBE usar prompts específicos por tipo de producto | MUST |
| REQ-CA-003 | El servicio DEBE integrar con LLMService existente para llamadas al LLM | MUST |
| REQ-CA-004 | El servicio DEBE devolver respuesta en formato estructurado (JSON) | MUST |
| REQ-CA-005 | El servicio DEBE verificar credits del usuario antes de procesar | MUST |
| REQ-CA-006 | El servicio DEBE soportar contenido textual y archivos (PDF, MD, TXT) | SHOULD |
| REQ-CA-007 | El servicio DEBE incluir delimiters para prevenir prompt injection | MUST |

### 1.2 ContentReaderService

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| REQ-CR-001 | El servicio DEBE extraer texto de archivos PDF | MUST |
| REQ-CR-002 | El servicio DEBE extraer texto de archivos Markdown | MUST |
| REQ-CR-003 | El servicio DEBE extraer texto de archivos de texto plano | MUST |
| REQ-CR-004 | El servicio DEBE validar tipo de archivo contra allowlist | MUST |
| REQ-CR-005 | El servicio DEBE limitar tamaño de archivo (max 50MB) | MUST |
| REQ-CR-006 | El servicio DEBE procesar contenido en chunks para manejar archivos grandes | SHOULD |

### 1.3 QuizGeneratorService

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| REQ-QG-001 | El servicio DEBE generar quizzes en formato JSON | MUST |
| REQ-QG-002 | El servicio DEBE soportar preguntas multiple-choice | MUST |
| REQ-QG-003 | El servicio DEBE soportar preguntas true-false | SHOULD |
| REQ-QG-004 | El servicio DEBE soportar preguntas fill-blank | SHOULD |
| REQ-QG-005 | El servicio DEBE soportar preguntas matching | SHOULD |
| REQ-QG-006 | El servicio DEBE permitir configurar cantidad de preguntas | SHOULD |
| REQ-QG-007 | El servicio DEBE permitir configurar dificultad (easy, medium, hard) | SHOULD |

### 1.4 TranscriptionService

| ID | Requisito | Prioridad |
|----|-----------|-----------|
| REQ-TR-001 | El servicio DEBE transcribir archivos de audio (mp3, wav, m4a) | MUST |
| REQ-TR-002 | El servicio DEBE transcribir archivos de video (mp4, webm) | MUST |
| REQ-TR-003 | El servicio DEBE verificar Plan Pro activo antes de procesar | MUST |
| REQ-TR-004 | El servicio DEBE incluir 60 minutos/mes para usuarios Plan Pro | MUST |
| REQ-TR-005 | El servicio DEBE cobrar 12 ARS/min o credits cuando excede quota | MUST |
| REQ-TR-006 | El servicio DEBE trackear uso mensual de minutos | MUST |
| REQ-TR-007 | El servicio DEBE usar Whisper (OpenAI) para transcripción | MUST |

---

## 2. User Stories

### 2.1 ContentAssistantService

| ID | User Story | Criterios de Aceptación |
|----|------------|-------------------------|
| US-CA-001 | Como creador con Plan Pro, quiero asistencia para generar estructura de mi curso | [ ] Envío contenido del curso [ ] Sistema detecta tipo course [ ] Retorna outline con módulos y lecciones |
| US-CA-002 | Como creador con Plan Pro, quiero asistencia para resumir mi ebook | [ ] Envío contenido del ebook [ ] Sistema detecta tipo ebook [ ] Retorna resumen y capítulos sugeridos |

### 2.2 ContentReaderService

| ID | User Story | Criterios de Aceptación |
|----|------------|-------------------------|
| US-CR-001 | Como usuario, quiero subir un PDF y obtener el texto | [ ] Subo archivo .pdf [ ] Sistema extrae texto [ ] Retorna texto extraído |
| US-CR-002 | Como usuario, quiero subir un archivo Markdown | [ ] Subo archivo .md [ ] Sistema extrae texto [ ] Retorna texto con headings |

### 2.3 QuizGeneratorService

| ID | User Story | Criterios de Aceptación |
|----|------------|-------------------------|
| US-QG-001 | Como creador, quiero generar un quiz desde mi contenido | [ ] Envío contenido [ ] Especifico cantidad de preguntas [ ] Recebo quiz en JSON válido |

### 2.4 TranscriptionService

| ID | User Story | Criterios de Aceptación |
|----|------------|-------------------------|
| US-TR-001 | Como creador con Plan Pro, quiero transcribir mi audio | [ ] Subo archivo de audio [ ] Sistema verifica Plan Pro [ ] Sistema transcribe y retorna texto |

---

## 3. API Specs

### 3.1 POST /api/ai/content/assist

**Request**:
```typescript
{
  type?: 'course' | 'ebook' | 'membership' | 'software' | 'podcast' | 'audiobook';
  content?: string;        // Texto directo
  filePath?: string;      // Path a archivo
  task: 'outline' | 'summary' | 'topics' | 'questions' | 'full';
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    result: string;
    type: string;
    creditsUsed: number;
  };
}
```

**Errores**:
| Código | Descripción | HTTP |
|--------|-------------|------|
| INSUFFICIENT_CREDITS | Credits insuficientes | 402 |
| PLAN_REQUIRED | Feature requiere Plan Pro | 403 |
| INVALID_FILE_TYPE | Tipo de archivo no soportado | 400 |
| CONTENT_TOO_LONG | Contenido excede límite | 400 |

### 3.2 POST /api/ai/quiz/generate

**Request**:
```typescript
{
  content?: string;
  filePath?: string;
  productType?: string;
  options?: {
    questionCount?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    questionTypes?: string[];
    language?: 'es' | 'en';
  };
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    id: string;
    title: string;
    questions: QuizQuestion[];
    metadata: {
      createdAt: Date;
      sourceLength: number;
      questionCount: number;
    };
  };
}
```

### 3.3 POST /api/ai/transcribe

**Request**:
```typescript
{
  filePath: string;
  language?: string;  // default 'es'
}
```

**Response**:
```typescript
{
  success: true;
  data: {
    text: string;
    duration: number;
    language: string;
    creditsUsed: number;
  };
}
```

---

## 4. Testing Plan

### 4.1 Unit Tests

| Servicio | Coverage Mínimo |
|----------|----------------|
| ContentAssistantService | 80% |
| ContentReaderService | 80% |
| QuizGeneratorService | 80% |
| TranscriptionService | 80% |

### 4.2 Casos de Prueba

| Feature | Caso | Resultado Esperado |
|---------|------|-------------------|
| ContentReader | PDF válido | Texto extraído |
| ContentReader | Archivo grande | Chunking aplicado |
| ContentReader | Tipo inválido | Error INVALID_FILE_TYPE |
| QuizGenerator | Contenido válido | Quiz JSON válido |
| Transcription | Plan Pro activo | Transcripción exitosa |
| Transcription | Excede 60 min | Cobra extra |

---

## 5. Edge Cases

| Escenario | Manejo |
|-----------|--------|
| Contenido vacío | Retornar error con mensaje claro |
| Archivo corrupto | Retry 1 vez, luego error |
| LLM retorna malformed JSON | Parse fallback, retry |
| Credits agotados durante operación | Rollback de transacción |
| Timeout de Whisper | Retry con backoff |

---

## 6. Notas Técnicas

- No hay cambios en DB schema
- Todos los servicios reutilizan LLMService existente
- Credits se deducen atómicamente
- Rate limiting: 10 req/min para content, 5 para quiz, 3 para transcribe