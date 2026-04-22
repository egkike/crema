# SDD Design: Orchestrator + Skills Registry

## Fase 2: Arquitectura de Orquestación de Agentes

---

## 1. Arquitectura General

### 1.1 Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Routes Layer                           │
│  - POST /orchestrator/query    → Execute skill                  │
│  - GET  /orchestrator/skills   → List skills                    │
│  - GET  /orchestrator/capabilities → List capabilities          │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Service                         │
│  ┌─────────────────┐    ┌──────────────────────┐                │
│  │ Query Router    │───▶│ Skills Registry     │                │
│  │                 │    │ - findByCapability   │                │
│  │                 │    │ - listAll()          │                │
│  │                 │    │ - register()         │                │
│  └─────────────────┘    └──────────────────────┘                │
│           │                              │                      │
│           ▼                              ▼                      │
│  ┌─────────────────┐    ┌──────────────────────┐                │
│  │ Error Handler   │    │ Cache (Redis)        │                │
│  │                 │    │ - skills:cache       │                │
│  └─────────────────┘    └──────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
           │                                                        
           ▼                                                        
┌─────────────────────────────────────────────────────────────────┐
│                    Skill Execution Layer                        │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │ LLM      │  │Embedding │  │   QA     │  │ Memory   │         │
│  │ Service  │  │ Service  │  │ Service  │  │ Service  │         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Capas

| Capa | Responsabilidad | Location |
|------|---------------|----------|
| Routes | HTTP handling, validación | `src/routes/orchestrator.routes.ts` |
| Orchestrator | Routing, logging | `src/services/orchestrator.service.ts` |
| Skills Registry | CRUD de metadata | `src/services/skills-registry.service.ts` |
| Skills | Ejecución real | `src/services/ai/*.service.ts` |

---

## 2. Diseño de Componentes

### 2.1 Orchestrator Service

```typescript
// src/services/orchestrator.service.ts
import { configService } from './config.service';
import { skillsRegistry, registeredSkills } from '../services/skills-registry.service';
import { isValidCapability } from './valid-capabilities';

export const orchestratorService = {
  /**
   * Execute a skill by capability
   */
  async executeQuery(
    capability: string,
    input: any,
    options?: QueryOptions
  ): Promise<QueryResponse> {
    const startTime = Date.now();
    
    // 1. Validate capability against allowlist
    if (!isValidCapability(capability)) {
      throw new OrchestratorError('ORCH001', 'Capability not found', 404);
    }
    
    // 2. CRITICAL: Always get handler from registeredSkills (in-memory), NOT from DB/Redis
    // DB/Redis only stores metadata, not serializable handlers
    const skill = registeredSkills.get(capability);
    if (!skill?.handler) {
      throw new OrchestratorError('ORCH002', 'Skill not registered', 404);
    }
    
    // 3. Get metadata from DB (if needed for response)
    const dbSkill = await skillsRegistry.findByCapability(capability);
    const skillName = dbSkill?.name ?? capability;
    
    // 4. Execute handler
    const result = await skill.handler(input, options);
    
    // 5. Build response
    return {
      result,
      metadata: {
        skill: skillName,
        duration: Date.now() - startTime,
      },
    };
  },
  
  /**
   * List all available capabilities
   */
  async listCapabilities(): Promise<string[]> {
    const skills = await skillsRegistry.listAll();
    return skills.map(s => s.capability);
  },
};
```

### 2.2 Skills Registry Service

```typescript
// src/services/skills-registry.service.ts
import pool from '../db/postgres';
import Redis from 'ioredis';

// In-memory registry for auto-registration
// NOTA: Los handlers NO se persisten a DB - solo metadata
// El handler se recupera del in-memory registry
const registeredSkills = new Map<string, Skill>();

// Lazy Redis - NO instanciar en tiempo de módulo
let redisClient: Redis | null = null;

function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      keyPrefix: 'crema:orchestrator:',
      lazyConnect: true,
    });
  }
  return redisClient;
}

export const skillsRegistry = {
  /**
   * Register a skill (called at boot)
   */
  async register(skill: Skill): Promise<void> {
    registeredSkills.set(skill.capability, skill);
    
    // Persist to DB
    await pool.query(
      `INSERT INTO skills (id, name, capability, description, parameters, options)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (capability) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         parameters = EXCLUDED.parameters,
         options = EXCLUDED.options,
         updated_at = NOW()`,
[skill.id, skill.name, skill.capability, skill.description, 
        JSON.stringify(skill.parameters), JSON.stringify(skill.options)]
    );
    
    // Invalidate cache (lazy Redis)
    try {
      await getRedisClient().del('skills:all');
    } catch {
      // Redis no disponible, continuar sin cache
    }
  },
   
  /**
   * Find skill by capability
   */
  async findByCapability(capability: string): Promise<Skill | null> {
    // Check in-memory first (handlers siempre ahí)
    if (registeredSkills.has(capability)) {
      return registeredSkills.get(capability)!;
    }
    
    // Check cache (lazy Redis)
    try {
      const redis = getRedisClient();
      const cached = await redis.get(`skill:${capability}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis no disponible, continue
    }
    
    // Load from DB (metadata only, sin handler)
    const { rows } = await pool.query(
      'SELECT * FROM skills WHERE capability = $1 AND enabled = true',
      [capability]
    );
    
    if (rows.length === 0) return null;
    
    // El handler NO está en DB - crear runtime si se necesita
    const skill = rows[0];
    return {
      ...skill,
      // El caller debe verificar registeredSkills para tener handler
    };
  },
   
  /**
   * List all skills
   */
  async listAll(): Promise<Skill[]> {
    // Check cache (lazy Redis)
    try {
      const redis = getRedisClient();
      const cached = await redis.get('skills:all');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // Redis no disponible
    }
    
    const { rows } = await pool.query(
      'SELECT * FROM skills WHERE enabled = true ORDER BY name'
    );
    
    // Cache: NO guardar handlers, solo metadata
    try {
      await getRedisClient().setex('skills:all', 300, JSON.stringify(rows));
    } catch {
      // Redis no disponible
    }
    return rows;
  },
};
```

### 2.3 Auto-Registration Boot

```typescript
// src/services/ai/index.ts - Boot file
import { skillsRegistry } from '../services/skills-registry.service';
import { llmService } from './llm.service';
import { embeddingService } from './embedding.service';
import { qaService } from './qa.service';
import { memoryService } from './memory.service';

// Register all skills at boot
// NOTA: Los handlers se almacenan SOLO en memoria, no en DB
// La DB guarda solo metadata para discovery
export async function registerAISkills() {
  await skillsRegistry.register({
    id: 'llm-chat',
    name: 'LLM Chat',
    capability: 'llm.chat',
    description: 'Chat completion with LLM',
    parameters: [
      { name: 'messages', type: 'object', required: true },
      { name: 'model', type: 'string', required: false },
    ],
    options: { timeout: 60000, retries: 2 },
    // Handler se guarda en memoria solo - no a DB
    handler: llmService.chat.bind(llmService),
    // Service reference para ejecutar en runtime
    serviceRef: 'llmService',
  });
  
  await skillsRegistry.register({
    id: 'embedding-generate',
    name: 'Embedding Generation',
    capability: 'embedding.generate',
    description: 'Generate vector embeddings',
    parameters: [
      { name: 'text', type: 'string', required: true },
    ],
    options: { timeout: 30000, retries: 1 },
    handler: embeddingService.generateEmbedding.bind(embeddingService),
    serviceRef: 'embeddingService',
  });
  
  // ... more skills
}
```

### 2.4 Patrón de Ejecución (Handler Lookup)

```typescript
// En orchestrator.service.ts - como ejecutar un skill
// CORREGIDO: Siempre obtener handler desde registeredSkills (in-memory)
async executeSkill(capability: string, input: any, options?: any) {
  // Validate capability first
  if (!isValidCapability(capability)) {
    throw new OrchestratorError('ORCH001', 'Capability not found', 404);
  }
  
  // Get handler from registeredSkills (in-memory), NOT from DB
  const skill = registeredSkills.get(capability);
  if (!skill?.handler) {
    throw new OrchestratorError('ORCH002', 'Skill not registered', 404);
  }
  
  // Execute handler
  return skill.handler(input, options);
}
```

---

## 3. Database

### 3.1 Tabla: skills

```sql
-- Migración en db/init/XX-orchestrator-tables.sql

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  capability VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  parameters JSONB DEFAULT '[]',
  options JSONB DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_skills_capability ON skills(capability);
CREATE INDEX idx_skills_enabled ON skills(enabled);
```

---

## 4. Routes

### 4.1 Orchestrator Routes

```typescript
// src/routes/orchestrator.routes.ts
import { Router, Request, Response, NextFunction } from 'express';
import { orchestratorService } from '../services/orchestrator.service';
import { skillsRegistry } from '../services/skills-registry.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { orchestratorErrorMiddleware } from '../middlewares/orchestrator-error.middleware';
import { ValidationError } from '../services/orchestrator.service';
import { aiLimiter } from '../middlewares/rateLimit/rateLimit';

const router = Router();

// GET /api/orchestrator/capabilities (public)
router.get('/capabilities', async (_req, res, next) => {
  try {
    const capabilities = await orchestratorService.listCapabilities();
    res.json({ success: true, data: { capabilities, count: capabilities.length } });
  } catch (error) {
    next(error instanceof Error ? error : new Error('Unknown error'));
  }
});

// GET /api/orchestrator/skills (public)
router.get('/skills', async (_req, res, next) => {
  try {
    const skills = await skillsRegistry.listAll();
    res.json({ success: true, data: { skills, count: skills.length } });
  } catch (error) {
    next(error instanceof Error ? error : new Error('Unknown error'));
  }
});

// POST /api/orchestrator/query (protected, rate limited)
router.post('/query', jwtAuthMiddleware, aiLimiter, async (req, res, next) => {
  try {
    const { capability, input } = req.body;

    // Input validation
    if (!capability || typeof capability !== 'string') {
      throw new ValidationError('Capability is required and must be a string', 'capability');
    }
    if (capability.length > 100) {
      throw new ValidationError('Capability name too long (max 100 characters)', 'capability');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input) || input === null) {
      throw new ValidationError('Input must be a non-empty object', 'input');
    }

    const userId = req.user?.id;
    const result = await orchestratorService.executeQuery(capability, { userId, input });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error instanceof Error ? error : new Error('Unknown error'));
  }
});

// Error middleware (last)
router.use(orchestratorErrorMiddleware);

export default router;
```

**Features implemented:**
- ✅ Error handling via `next(err)` (proper Express flow)
- ✅ Input validation: capability type, length, input type check
- ✅ Rate limiting via `aiLimiter`
- ✅ JWT auth on /query
- ✅ Error middleware for consistent error responses

### 4.2 Streaming Endpoint (T-143b)

```typescript
// GET /api/orchestrator/stream (SSE - Server-Sent Events)
// For real-time streaming responses from llm.stream capability
router.get(
  '/stream',
  jwtAuthMiddleware,
  aiLimiter,
  async (req: Request, res: Response) => {
    const { capability, input } = req.query;

    // Validate capability is streaming-capable
    if (capability !== 'llm.stream') {
      return res.status(400).json({
        success: false,
        error: { code: 'ORCH_INVALID_CAPABILITY', message: 'Only llm.stream supports streaming' }
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const userId = req.user?.id;
      
      // Call streaming capability
      const result = await orchestratorService.executeQuery(
        capability as string,
        { userId, ...input }
      );

      // Send SSE events
      res.write(`data: ${JSON.stringify({ done: true, result })}\n\n`);
      res.end();
    } catch (error) {
      res.write(`data: ${JSON.stringify({ done: true, error: error.message })}\n\n`);
      res.end();
    }
  }
);
```

**Features:**
- Server-Sent Events (SSE) for real-time streaming
- JWT auth required
- Rate limited via aiLimiter
- Only `llm.stream` capability supported

---

## 5. ConfigService Keys

Agregar a `ALLOWED_CONFIG_KEYS`:

```typescript
// En config.service.ts
export const ALLOWED_CONFIG_KEYS = [
  // ... existentes
  
  // Orchestrator
  'orchestrator.default_timeout',
  'orchestrator.max_retries',
  'orchestrator.cache_ttl',
];
```

---

## 6. Security

### 6.1 Allowlist de Capabilities

```typescript
// src/services/orchestrator/valid-capabilities.ts
const ALLOWED_CAPABILITIES = [
  'llm.chat',
  'llm.stream',
  'embedding.generate',
  'embedding.batch',
  'qa.answer',
  'qa.with_context',
  'memory.store',
  'memory.recall',
  'review.analyze',
  'transcribe.audio',
];

export function isValidCapability(capability: string): boolean {
  return ALLOWED_CAPABILITIES.includes(capability);
}
```

---

## 7. Errores y Manejo

### 7.1 Error Classes

```typescript
// src/services/orchestrator.service.ts
export class ValidationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CapabilityNotFoundError extends Error {
  constructor(public readonly capability: string) {
    super(`Capability not found: ${capability}`);
    this.name = 'CapabilityNotFoundError';
  }
}

export class CapabilityExecutionError extends Error {
  constructor(message: string, public readonly capability: string, public readonly cause?: Error) {
    super(message);
    this.name = 'CapabilityExecutionError';
  }
}
```

### 7.2 Error Handler Middleware

```typescript
// src/middlewares/orchestrator-error.middleware.ts
export function orchestratorErrorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // SECURITY: Do NOT expose error.message to clients - use generic messages
  if (err instanceof ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'ORCH_VALIDATION_ERROR',
        message: 'Invalid request parameters',
        field: err.field,
      },
    });
  }

  if (err instanceof CapabilityNotFoundError) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'ORCH_CAPABILITY_NOT_FOUND',
        message: 'Capability not found',
        capability: err.capability,
      },
    });
  }

  if (err instanceof CapabilityExecutionError) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'ORCH_EXECUTION_ERROR',
        message: 'An error occurred while executing the capability',
        capability: err.capability,
      },
    });
  }

  // Fallback - generic error
  res.status(500).json({
    success: false,
    error: {
      code: 'ORCH_INTERNAL_ERROR',
      message: 'An internal error occurred while processing the request',
    },
  });
}
```

---

## 8. Testing

### 8.1 Unit Tests

- `orchestrator.service.test.ts` - Query routing
- `skills-registry.service.test.ts` - CRUD operations
- `valid-capabilities.test.ts` - Allowlist validation

### 8.2 Integration Tests

- `orchestrator.routes.test.ts` - Endpoints
- `skills-registration.test.ts` - Auto-registration

---

## 9. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| express | ^5.0.0 | HTTP server |
| zod | ^3.0.0 | Validation |
| ioredis | ^5.0.0 | Cache |
| pg | ^8.0.0 | Database |

## 10. Performance y Seguridad

### 10.1 Performance

| Métrica | Valor | Notes |
|---------|-------|-------|
| Timeout default | 30s | Configurable via `orchestrator.default_timeout` |
| Redis cache TTL | 5 min | `orchestrator.cache_ttl` |
| Max retries | 3 | `orchestrator.max_retries` |

### 10.2 Seguridad

| Control | Implementación |
|---------|-------------|
| **Auth** | JWT via `jwtAuthMiddleware` en `/query` |
| **Rate Limiting** | `aiLimiter` (30 req/min por usuario) |
| **Input Validation** | capability (type + length), input (object only) |
| **Capability Allowlist** | `isValidCapabilityName()` valida contra lista |
| **Error Messages** | Genéricos - sin info leakage |
| **Prompt Injection** | Capability validada, no ejecución directa |

### 10.3 Logging

- Errors: `logger.error()` con capability y mensaje
- No PII logueada (solo capability name, no user inputs)

---

## 11. API Documentation (T-170)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/orchestrator/capabilities` | ❌ Public | List available capabilities |
| GET | `/api/orchestrator/skills` | ❌ Public | List available skills |
| POST | `/api/orchestrator/query` | ✅ JWT | Execute capability |
| GET | `/api/orchestrator/stream` | ✅ JWT | SSE streaming for llm.stream |

### Request/Response Formats

**POST /query**
```json
// Request
{
  "capability": "llm.chat",
  "input": {
    "messages": [{"role": "user", "content": "Hello"}]
  }
}

// Response (success)
{
  "success": true,
  "data": {
    "success": true,
    "result": {...},
    "capability": "llm.chat",
    "metadata": {...}
  }
}

// Response (error)
{
  "success": false,
  "error": {
    "code": "ORCH_VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "field": "capability"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-----------|-------------|
| ORCH_VALIDATION_ERROR | 400 | Invalid input |
| ORCH_CAPABILITY_NOT_FOUND | 404 | Capability not registered |
| ORCH_EXECUTION_ERROR | 500 | Execution failed |
| ORCH_INTERNAL_ERROR | 500 | Internal error |

---

## 12. Usage Examples (T-171)

### Example 1: Chat with LLM

```bash
curl -X POST https://api.crema.io/api/orchestrator/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "llm.chat",
    "input": {
      "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is Crema?"}
      ],
      "temperature": 0.7,
      "maxTokens": 500
    }
  }'
```

### Example 2: Generate Embedding

```bash
curl -X POST https://api.crema.io/api/orchestrator/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "capability": "embedding.generate",
    "input": {
      "text": "The quick brown fox jumps over the lazy dog"
    }
  }'
```

### Example 3: List Available Capabilities

```bash
curl https://api.crema.io/api/orchestrator/capabilities
```

Response:
```json
{
  "success": true,
  "data": {
    "capabilities": ["llm.chat", "llm.stream", "embedding.generate", "embedding.batch"],
    "count": 4
  }
}
```

### Example 4: List Skills

```bash
curl https://api.crema.io/api/orchestrator/skills
```

### Example 5: Streaming Response (SSE)

```javascript
const response = await fetch('https://api.crema.io/api/orchestrator/stream?capability=llm.stream&input={"messages":[{"role":"user","content":"Tell me a story"}]}', {
  headers: {
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  }
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  console.log(chunk); // Processes SSE events
}
```

---

**Design Creado**: Abril 2026  
**Estado**: Listo para Tasks  
**Author**: SDD Workflow