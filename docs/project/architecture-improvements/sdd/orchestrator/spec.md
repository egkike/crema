# SDD Specification: Orchestrator + Skills Registry

## Fase 2: Arquitectura de Orquestación de Agentes

---

## 1. Overview del Sistema

### 1.1 Propósito
Proporcionar un punto único de entrada para todas las queries AI del ecosistema Crema, con un registro centralizado de capacidades (skills) que permita descubrimiento y extensibilidad.

### 1.2 Usuarios del Sistema

| Usuario | Uso |
|---------|-----|
| Internos (servicios) | Routing de queries AI |
| Creadores | Potencialmente via API |
| Admin | Descubrimiento de skills disponibles |

---

## 2. Requisitos Funcionales

### 2.1 Core Requirements

#### RQ-001: Orchestrator Entry Point
- El sistema DEBE aceptar queries AI a través de un endpoint único
- El input DEBE incluir: `capability` y `input`
- El output DEBE incluir: `result` y `metadata`

```
Request:
{
  capability: "llm.chat" | "embedding.generate" | "qa.answer" | ...
  input: string | object
  options?: { temperature?, maxTokens?, ... }
}

Response:
{
  result: any
  metadata: { duration, tokens, ... }
}
```

#### RQ-002: Skills Registry
- El sistema DEBE mantener un registro de todas las skills disponibles
- Cada skill DEBE incluir: `name`, `capability`, `description`, `parameters`, `options`

#### RQ-003: Skill Discovery
- El sistema DEBE permitir listar todas las skills disponibles
- El sistema DEBE permitir buscar skills por capability

#### RQ-004: Skill Registration
- Las skills DEBEN poder registrarse automáticamente al iniciar la aplicación
- Las skills DEBEN poder registrarse manualmente via DB

### 2.2 User Stories

| ID | Story | Criterio de Éxito |
|----|-------|-------------------|
| US-001 | Como sistema, quiero rutear queries al agente correcto | La query llega al agente correcto |
| US-002 | Como admin, quiero ver todas las skills disponibles | Endpoint retorna lista completa |
| US-003 | Como developer, quiero agregar nuevo agente | ≤ 30 min de código |
| US-004 | Como sistema, quiero manejar errores uniformemente | Error tiene formato estándar |

---

## 3. Interface del Sistema

### 3.1 Tipos de Datos

```typescript
// Capability types - validadas contra ALLOWED_CAPABILITIES allowlist
// La validación se hace en runtime, no en tipo
type Capability = string;

// Skill definition
// NOTA: handler se guarda SOLO en memoria (in-memory Map)
// No se persiste a DB - solo metadata
interface Skill {
  id: string;
  name: string;
  capability: Capability;
  description: string;
  parameters: SkillParameter[];
  options: SkillOptions;
  // handler en memoria solo - no serializable
  handler?: SkillHandler;
  // serviceRef para lookup en runtime
  serviceRef?: string;
}

interface SkillParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
  default?: any;
}

interface SkillOptions {
  timeout?: number;
  retries?: number;
  cacheable?: boolean;
  streaming?: boolean;
}

type SkillHandler = (input: any, options?: any) => Promise<any>;

// Orchestrator Request
interface OrchestratorQuery {
  capability: Capability;
  input: any;
  options?: {
    temperature?: number;
    maxTokens?: number;
    // NOTA: signal y onChunk no son serializables en HTTP
    // Se usan internamente, no via API
  };
}

// Orchestrator Response
interface OrchestratorResponse {
  result: any;
  metadata: {
    skill: string;
    duration: number;
    tokens?: number;
  };
}
```

### 3.2 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|-----|-------------|
| POST | `/orchestrator/query` | JWT | Ejecutar skill |
| GET | `/orchestrator/skills` | Public | Listar todas las skills |
| GET | `/orchestrator/skills/:capability` | Public | Get skill por capability |
| GET | `/orchestrator/capabilities` | Public | Listar capabilities disponibles |
| POST | `/orchestrator/skills` | Admin | Registrar skill manualmente (admin) |

---

## 4. Comportamiento del Sistema

### 4.1 Flujo Principal: Query Execution

```
1. User POST /orchestrator/query
2. Validar payload (capability requerida)
3. Buscar skill en Registry
4. Verificar skill existe
5. Ejecutar handler con input
6. Capturar metadata (duration, tokens)
7. Retornar response
```

### 4.2 Flujo: Skill Discovery

```
1. GET /orchestrator/skills
2. Consultar Registry en cache (Redis)
3. Si cache miss, cargar de DB
4. Retornar lista de skills
```

### 4.3 Flujo: Auto-Registration

```
1. Importar servicios AI
2. ServiciosAI ejecutan registerSkill() en boot
3. Skill registra metadata en Registry
4. Registry persiste en DB
5. Redis cache actualiza
```

---

## 5. Manejo de Errores

### 5.1 Error Classes

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

### 5.2 HTTP Status Mapping

| Error Type | HTTP Status | Código |
|-----------|-----------|---------|
| ValidationError | 400 | ORCH_VALIDATION_ERROR |
| CapabilityNotFoundError | 404 | ORCH_CAPABILITY_NOT_FOUND |
| CapabilityExecutionError | 500 | ORCH_EXECUTION_ERROR |
| Generic Error | 500 | ORCH_INTERNAL_ERROR |

### 5.3 Formato de Respuesta

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;  // Always generic - no info leakage
    capability?: string;
    field?: string;
  };
}
```

---

## 6. Data Model

### 6.0 Arquitectura de Storage

> **IMPORTANTE**: Los handlers de las skills NO se pueden serializar a DB.
> - Solo se persisten **metadata** (name, capability, description, parameters, options)
> - Los **handlers** se almacenan en un `Map<string, Skill>` en memoria
> - Al boot, se cargan los services y se registra el handler
> - La DB solo sirve para **discovery** (listar skills disponibles)

### 6.1 Database: Skills Table

```sql
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

CREATE INDEX idx_skills_capability ON skills(capability);
CREATE INDEX idx_skills_enabled ON skills(enabled);
```

---

## 7. Integración con Servicios Existentes

### 7.1 Servicios a Registrar

| Servicio | Capability | Priority |
|----------|------------|----------|
| llm.service | llm.chat, llm.stream | ALTA |
| embedding.service | embedding.generate, embedding.batch | ALTA |
| qa.service | qa.answer, qa.with_context | ALTA |
| memory.service | memory.store, memory.recall | MEDIA |
| review.service | review.analyze | BAJA |
| transcription.service | transcribe.audio | BAJA |

### 7.2 Integración con ConfigService

- Skills Registry puede usar ConfigService para defaults de options
- `orchestrator.default_timeout`: 30000ms
- `orchestrator.max_retries`: 3

---

## 8. Requisitos No Funcionales

### 8.1 Performance

| Métrica | Target |
|---------|-------|
| Latencia routing | < 50ms |
| Time to first chunk (streaming) | < 100ms |
| Cache hit rate | > 90% |

### 8.2 Disponibilidad

| Métrica | Target |
|---------|-------|
| Uptime | 99.9% |
| Max concurrent queries | 100 |

### 8.3 Seguridad

- Validar capability contra allowlist
- Rate limiting por API key
- Sanitizar input antes de handler

---

## 9. Acceptance Criteria

- [ ] POST /orchestrator/query retorna resultado correcto
- [ ] GET /orchestrator/skills lista todas las skills
- [ ] Skills existentes registradas automáticamente
- [ ] Nuevas skills pueden agregarse en ≤ 30 min
- [ ] Errores tienen formato estándar
- [ ] Documentación de API completa

---

**Spec Creado**: Abril 2026  
**Estado**: Listo para Design  
**Author**: SDD Workflow