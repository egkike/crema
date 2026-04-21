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
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { orchestratorService } from '../services/orchestrator.service';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';

const router = Router();

// Validation schemas
// NOTA: signal y onChunk NO son serializables en HTTP
// Solo opciones serializables van en el schema
const querySchema = z.object({
  capability: z.string().min(1),
  input: z.any(),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    // signal y onChunk se usan internamente, no via HTTP API
  }).optional(),
});

// POST /orchestrator/query
router.post('/query', 
  jwtAuthMiddleware,
  async (req: Request, res: Response) => {
    const { capability, input, options } = querySchema.parse(req.body);
    
    const result = await orchestratorService.executeQuery(
      capability, input, options
    );
    
    res.json(result);
  }
);

// GET /orchestrator/skills
router.get('/skills', async (req: Request, res: Response) => {
  const skills = await skillsRegistry.listAll();
  res.json({ skills });
});

// GET /orchestrator/capabilities
router.get('/capabilities', async (req: Request, res: Response) => {
  const capabilities = await orchestratorService.listCapabilities();
  res.json({ capabilities });
});

export default router;
```

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

---

**Design Creado**: Abril 2026  
**Estado**: Listo para Tasks  
**Author**: SDD Workflow