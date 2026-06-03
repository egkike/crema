# SDD Design: Concierge Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Design  
**Estado**: ✅ IMPLEMENTADO (2026-04-27)  
**Revision Note**: Diseño actualizado post-implementación
**PRD Fase**: Fase 7 (Semanas 25-27)  
**Depends on**: spec.md

---

## 1. Resumen del Diseño

Implementación del Concierge Service como skill del Orchestrator de IA.

---

## 2. Arquitectura

### 2.1 Flujo Propuesto

```
[Usuario] → [Concierge Route] → [Concierge Handler (index.ts)]
                                    │
                                    ▼
                            [Concierge Service]
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             [ConfigService]  [LLM Service]  [User Context]
                    │               │               │
                    ▼               ▼               ▼
              (support.*)    (llmService)    (user-context.repository)
```

### 2.2 Configuración Dinámica

```typescript
// Todos los valores configurable via configService
- support.enabled         → boolean (default: true)
- support.temperature     → number (default: 0.7)
- support.max_tokens      → number (default: 1000)
- support.model           → string (opcional, default del LLM)
- support.system_prompt    → string (default: DEFAULT_SYSTEM_PROMPT)
- support.timeout_ms       → number (default: 30000)
```

### 2.3 Seguridad

```typescript
// Input sanitization
sanitizeInput(message)           → elimina \x00-\x1F\x7F
defensiveFramePrompt(message)   → escapa < > para prevenir injection
safeConversationCount(value)     → type guard para evitar NaN
```

---

## 3. Data Model

No hay nuevas tablas. User Context usa `app_user_context` existente.

---

## 4. API Design

### 4.1 Skill Registration (index.ts)

```typescript
{
  id: 'concierge-chat',
  name: 'Concierge Support',
  capability: 'concierge.chat',
  handler: conciergeService.chat
}
```

### 4.2 Request/Response

```typescript
interface ConciergeRequest {
  message: string;    // User message (max 2000 chars, sanitized)
  userId: string;      // User identifier
}

interface ConciergeResponse {
  response: string;    // LLM response
}
```

---

## 5. Implementación

### 5.1 Archivos

| Archivo | Responsabilidad |
|---------|-----------------|
| `concierge.service.ts` | Lógica de negocio, llamada LLM, contexto |
| `index.ts` | Registro del skill, validación de input |

### 5.2 Validación

- **Handler (index.ts)**: Validación robusta de tipos y longitud
- **Service**: Solo sanitización (no duplica validación)

### 5.3 Manejo de Errores

| Error | Status | Descripción |
|-------|--------|-------------|
| Message inválido | 400 | Faltante o tipo incorrecto |
| Concierge deshabilitado | 503 | `support.enabled = false` |
| Error LLM | 500 | Re-throw como AppError |

---

## 6. Integración

### 6.1 Skills Registrados

| Skill | Handler |
|-------|---------|
| concierge.chat | ConciergeService.chat() |

### 6.2 Servicios Existentes

- ConfigService (support.* keys)
- LLmService (llmService.chat)
- UserContextRepository (userContextRepository.upsert)

---

## 7. Estado

**Estado**: ✅ IMPLEMENTADO

### 7.1 Fixes Aplicados Post-Judgment

| # | Issue | Fix |
|---|-------|-----|
| 1 | Error no relanzado | `throw new AppError()` |
| 2 | Error object malformado | `error instanceof Error` |
| 3 | Bloque try/catch bloquea | Fire-and-forget `.then().catch()` |
| 4 | Input no sanitizado | `sanitizeInput()` + `defensiveFramePrompt()` |
| 5 | Config hardcoded | `configService.get()` para todo |
| 6 | support.model ignorado | Pasar `model` a `llmService.chat()` |
| 7 | support.enabled ignorado | Check throws 503 si deshabilitado |
| 8 | Handler Error genérico | `AppError` con 400 |
| 9 | Validación redundante | Centralizada en handler |
| 10 | Unsafe type cast | `safeConversationCount()` |
| 11 | Spanish error | Traducido a inglés |

### 7.2 Verificación

- TypeScript: ✅
- Lint: ✅ 0 errors
- Tests: ✅ 1025 passed
- Judgment Day: ✅ APPROVED (3 rounds)