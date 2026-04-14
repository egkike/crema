# SDD - SECURITY: AI Content Assistant

**Change**: ai-content-assistant  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## 1. Security Overview

El AI Content Assistant introduce funcionalidades de AI que requieren consideraciones de seguridad específicas, especialmente relacionadas con:
- Protección contra prompt injection
- Gestión de créditos y prevención de abuso
- Validación de archivos subidos por usuarios
- Protección de datos sensibles en transcripciones

---

## 2. Input Validation

### 2.1 Validación de Archivos

|check | Descripción | Implementación |
|------|-------------|----------------|
| Extension allowlist | Solo extensiones permitidas | `.pdf`, `.md`, `.txt`, `.mp3`, `.wav`, `.m4a`, `.mp4`, `.webm` |
| Size limit | Máximo 50MB para archivos | Verificar antes de procesar |
| MIME type | Validar MIME type real | No confiar solo en extensión |
| Magic bytes | Verificar tipo de archivo real | Comparar con signatures conocidas |

```typescript
// Ejemplo de validación
const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.txt', '.mp3', '.wav', '.m4a', '.mp4', '.webm'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function validateFile(file: File): boolean {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new AppError('INVALID_FILE_TYPE', 400);
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new AppError('FILE_TOO_LARGE', 400);
  }
  return true;
}
```

### 2.2 Validación de Contenido Textual

|check | Descripción | Implementación |
|------|-------------|----------------|
| Max length | Limitar caracteres de entrada | 50,000 caracteres máximo |
| Encoding | Validar encoding UTF-8 | Normalizar a UTF-8 |
| Sanitization | Eliminar caracteres perigosos | Strip de null bytes, control chars |

---

## 3. Authentication & Authorization

### 3.1 Autenticación

Todos los endpoints de AI Content Assistant REQUIEREN JWT válido:

```typescript
// Middleware de autenticación
router.post('/content/assist', jwtAuthMiddleware, validate(schema), handler);
router.post('/quiz/generate', jwtAuthMiddleware, validate(schema), handler);
router.post('/transcribe', jwtAuthMiddleware, validate(schema), handler);
```

### 3.2 Autorización - Plan Requirements

| Feature | Plan Required | Validación |
|---------|---------------|------------|
| Content Assist | Plan Pro | Verificar `user.subscription.plan === 'pro'` |
| Quiz Generate | Plan Pro | Verificar `user.subscription.plan === 'pro'` |
| Transcription | Plan Pro | Verificar `user.subscription.plan === 'pro'` |

```typescript
async function verifyProPlan(userId: string): Promise<boolean> {
  const user = await userRepository.findById(userId);
  if (!user?.subscription?.isActive) return false;
  return user.subscription.plan === 'pro';
}
```

### 3.3 Ownership Validation

Para transcripciones y contenido asociado a productos:

```typescript
async function verifyProductOwnership(userId: string, productId: string): Promise<boolean> {
  const product = await productRepository.findById(productId);
  return product?.creatorId === userId;
}
```

---

## 4. Rate Limiting

### 4.1 Rate Limits por Endpoint

| Endpoint | Límite | Ventana | Rationale |
|----------|--------|---------|-----------|
| `POST /ai/content/assist` | 10 | minute | Content generation cost |
| `POST /ai/quiz/generate` | 5 | minute | Quiz generation cost |
| `POST /ai/transcribe` | 3 | minute | Transcription heavy |
| `GET /ai/transcription/usage` | 30 | minute | Read operation |

### 4.2 Rate Limiter Implementation

```typescript
// rate-limit config
const contentAssistLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req) => req.user.id, // por user ID
  handler: (req, res) => {
    res.status(429).json({
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Try again later.'
    });
  }
});
```

### 4.3 Plan-Based Limits Adicionales

| Plan | Content/Month | Quiz/Month | Transcription |
|------|---------------|------------|---------------|
| Pro | 100 | 50 | 60 min |
| Enterprise | Unlimited | Unlimited | 300 min |

---

## 5. Data Privacy

### 5.1 Datos Sensibles en Transcripciones

**CUIDADO**: Las transcripciones pueden contener información sensible.

| Concern | Mitigación |
|---------|------------|
| PII en audio | Auditoría de logs sin guardar audio |
| Almacenamiento de transcripciones | No persistir por defecto, solo retornar |
| Retención | Configurable TTL para logs |

### 5.2 Manejo de Contenido del Usuario

| Datos | Tratamiento |
|--------|-------------|
| Contenido subido (PDF, MD, TXT) | Procesar y descartar, no guardar |
| Transcripciones | Retornar al cliente, no almacenar en DB |
| Contenido de productos | Asociado al producto existente |

### 5.3 Logging

```typescript
// NO loguear contenido sensible
logger.info({ 
  userId, 
  feature: 'transcription',
  duration: processingTime,
  // NO: fileContent, transcriptText
}, 'Transcription completed');

// SI loguear metadata
logger.info({
  userId,
  fileSize: file.size,
  fileType: file.mimetype,
  duration: audioDuration,
}, 'Transcription metadata');
```

---

## 6. API Security

### 6.1 Security Headers

```typescript
// Helmet.js config
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://api.openai.com"],
    },
  },
}));
```

### 6.2 CORS

```typescript
// CORS config - solo origins permitidos
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### 6.3 Error Responses

**IMPORTANTE**: No exponer información sensible en errores.

```typescript
// ❌ NO: Exponer detalles internos
catch (error) {
  res.status(500).json({ 
    error: error.message, // Stack trace expuesta
    stack: error.stack 
  });
}

// ✅ SI: Mensajes genéricos
catch (error) {
  logger.error({ error, userId }, 'Internal error');
  res.status(500).json({ 
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred'
  });
}
```

### 6.4 Códigos de Error Seguro

| Código Expuesto | Descripción | HTTP |
|-----------------|-------------|------|
| `INVALID_FILE_TYPE` | Tipo de archivo no soportado | 400 |
| `FILE_TOO_LARGE` | Archivo excede límite | 400 |
| `CONTENT_TOO_LONG` | Contenido muy largo | 400 |
| `TRANSCRIPTION_LIMIT_EXCEEDED` | Minutos excedidos | 402 |
| `INSUFFICIENT_CREDITS` | Credits insuficientes | 402 |
| `PLAN_REQUIRED` | Plan Pro requerido | 403 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INTERNAL_ERROR` | Error interno | 500 |

---

## 7. AI-Specific Security

### 7.1 Prompt Injection Prevention

**CRÍTICO**: Prevenir que usuarios manipulen los prompts del sistema.

```typescript
// Delimiters para separar user input
const INJECTION_DELIMITERS = {
  start: '[USER_INPUT_START]',
  end: '[USER_INPUT_END]'
};

// Sanitización de input
function sanitizeUserInput(input: string): string {
  // Remover delimiters del usuario
  let sanitized = input
    .replace(/\[USER_INPUT_START\]/gi, '')
    .replace(/\[USER_INPUT_END\]/gi, '')
    .replace(/\[\/?SYSTEM\]/gi, '')
    .replace(/\[\/?SYSTEM_PROMPT\]/gi, '');
  
  // Remover null bytes y control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  return sanitized;
}

// Construcción de prompt segura
function buildPrompt(userInput: string): string {
  const sanitized = sanitizeUserInput(userInput);
  return `${SYSTEM_PROMPT}\n\n${INJECTION_DELIMITERS.start}\n${sanitized}\n${INJECTION_DELIMITERS.end}`;
}
```

### 7.2 Context Overflow Protection

```typescript
// Limitar tamaño de contexto
const MAX_CONTEXT_TOKENS = 128000;

async function truncateContext(content: string): Promise<string> {
  // Aproximación: 1 token ≈ 4 caracteres
  const maxChars = MAX_CONTEXT_TOKENS * 4;
  
  if (content.length > maxChars) {
    logger.warn({ originalLength: content.length, truncatedTo: maxChars }, 'Content truncated');
    return content.slice(0, maxChars);
  }
  
  return content;
}
```

### 7.3 Credits Abuse Prevention

```typescript
// Pre-check de credits antes de operación costosa
async function checkCreditsBeforeOperation(
  userId: string, 
  requiredCredits: number
): Promise<void> {
  const balance = await creditsService.getBalance(userId);
  
  if (balance < requiredCredits) {
    throw new AppError('INSUFFICIENT_CREDITS', 402, {
      required: requiredCredits,
      available: balance
    });
  }
}

// Deducción atómica
async function deductCredits(userId: string, amount: number, operation: string) {
  await creditsService.useCredits(userId, amount, operation, transactionId);
}
```

### 7.4 Provider API Security

```typescript
// Whisper API - no exponer keys en logs
const whisperConfig = {
  apiKey: process.env.OPENAI_API_KEY, // No loguear
  maxFileSize: 25 * 1024 * 1024,
};

// Timeout para operaciones largas
const transcriptionTimeout = 120000; // 2 minutes

async function transcribeWithTimeout(audioBuffer: Buffer): Promise<string> {
  try {
    return await Promise.race([
      whisper.transcribe(audioBuffer),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), transcriptionTimeout)
      )
    ]);
  } catch (error) {
    logger.error({ error: error.message }, 'Transcription failed');
    throw new AppError('TRANSCRIPTION_FAILED', 500);
  }
}
```

---

## 8. Threat Model

### 8.1 Assets

| Asset | Sensitivity | Protección |
|-------|-------------|------------|
| User credits balance | Alta | Verificación en cada request |
| Plan Pro status | Alta | Cache con TTL corto |
| Audio files | Media | Procesamiento en memoria, no persistir |
| Transcription output | Media | Solo retornar, no guardar |
| API keys (OpenAI) | Crítica | Environment variables, no hardcode |

### 8.2 Threats

| Threat | Likelihood | Impact | Mitigation |
|--------|------------|--------|------------|
| Prompt injection | Medium | Alta | Delimiters + sanitization |
| Credit theft | Low | Alta | Pre-check + atomic deduction |
| Rate limit bypass | Medium | Media | Per-user limits + Plan limits |
| File upload abuse | Medium | Media | Size limit + type validation |
| API key exposure | Low | Crítica | No logging + env vars |

### 8.3 Mitigation Summary

| Control | Implementado |
|---------|--------------|
| JWT Authentication | ✅ |
| Plan Pro Check | ✅ |
| Rate Limiting (per-user) | ✅ |
| File Type/Size Validation | ✅ |
| Prompt Injection Prevention | ✅ |
| Input Sanitization | ✅ |
| Error Message Sanitization | ✅ |
| API Key Protection | ✅ |
| Logging (no PII) | ✅ |
| Credit Pre-check | ✅ |

---

## 9. Compliance Notes

- **No almacenar audio/transcripciones**: Por defecto, solo retornar al cliente
- **Logs sin PII**: No loguear contenido de archivos ni transcripciones
- **Retención de logs**: Configurar TTL apropiado (recomendado: 30 días)
- **Auditoría**: Mantener logs de acceso para compliance

---

## 10. Testing de Seguridad

| Test | Descripción | Herramienta |
|------|-------------|-------------|
| Prompt injection | Validar que delimiters funcionan | Manual + Unit tests |
| File upload | Validar que archivos maliciosos son rechazados | Integration tests |
| Rate limiting | Validar que límites se aplican | Load tests |
| Auth bypass | Validar que endpoints requieren JWT | Integration tests |
| Error exposure | Validar que errores no exponen info sensible | Manual review |

---

## 11. Monitoreo

### 11.1 Alerts Recomendados

| Alert | Threshold | Acción |
|-------|-----------|--------|
| High error rate | > 10% en 5 min | Review de errores |
| Rate limit hits | > 100/hour | Posible abuse |
| Credit consumption anomaly | > 2x avg | Investigar |
| Transcription quota abuse | > 200% de quota | Bloquear usuario |

### 11.2 Metrics a Monitorear

- Request rate por endpoint
- Error rate por tipo
- Credit consumption por usuario
- Transcription minutes por usuario
- Latency p95/p99