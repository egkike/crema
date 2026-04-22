# Product Requirements Document (PRD)
## Crema - Mejoras de Arquitectura

**Versión**: 3.0  
**Fecha**: Abril 2026  
**Estado**: Fase 1-2 Completadas | Phase 3-5 Pendientes  
**Owner**: Kike García

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estado Actual](#2-estado-actual)
3. [Arquitectura Propuesta](#3-arquitectura-propuesta)
4. [Detalle por Mejora](#4-detalle-por-mejora)
   - [4.4 User Context Memory](#44-user-context-memory-evolución-del-memory-service)
5. [Roadmap de Implementación](#5-roadmap-de-implementación)
6. [Dependencias y Riesgos](#6-dependencias-y-riesgos)

---

## 1. Resumen Ejecutivo

### 1.1 Visión

Dotar al backend de Crema de una arquitectura más robusta, mantenible y escalable mediante tres mejoras clave que facilitan la implementación futura de features AI como el Concierge de Soporte.

> **Del Análisis 6**: La arquitectura debe evolucionar de "buscar en contenido" a "recordar la interacción del usuario". El Memory Service debe guardar el `user_context` para habilitar experiencias personalizadas.

### 1.2 Objetivos

| Objetivo | Métrica |
|----------|---------|
| Centralizar orquestación de agentes | 1 solo punto de entrada para todas las queries de AI |
| Manejo de errores consistente | 100% de errores tienen formato uniforme |
| Configuración unificada | 1 single source of truth para configuración |

### 1.3 Alcance

| # | Mejora | Prioridad |
|---|-------|:---------:|
| 1 | Centralizar Orquestación de Agentes | ALTA |
| 2 | Manejo de Errores Centralizado | MEDIA |
| 3 | Unificar Configuración | MEDIA |
| 4 | Skills Registry | BAJA |
| 5 | User Context Memory (Evolución) | ALTA |

---

## 2. Estado Actual

### 2.1 Estructura de Capas Actual

```
Routes → Controllers → Services → Repositories → Database
```

| Capa | Ubicación | Problemas |
|------|----------|----------|
| **Routes** | `backend/src/routes/` | Sin orquestación central |
| **Controllers** | `backend/src/controllers/` | Try/catch repetido en cada uno |
| **Services** | `backend/src/services/` | Instanciación manual |
| **Repositories** | `backend/src/repositories/` | Hardcoded configs |

### 2.2 Problemas Identificados

| # | Problema | Ubicación |
|---|---------|----------|
| 1 | Lógica de agentes dispersa en `agents.service.ts`, `ai.routes.ts`, `llm.service.ts` | AI |
| 2 | Try/catch manual en cada controller, sin formato consistente | General |
| 3 | Config en `config/index.ts`, `.env`, y DB dispersos | General |

---

## 3. Arquitectura Propuesta

### 3.1 Diagrama Conceptual

```
┌──────────────────────────────────────────────────────────────────┐
│                        API LAYER                                 │
├──────────────────────────────────────────────────────────────────┤
│  Routes (express)  →  Controllers  →  Error Handler Global       │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│  │AgentsOrchestrator│    │ SkillsRegistry  │    │ ConfigService│ │
│  │  - Route to agent│    │  - register()   │    │  - get()     │ │
│  │  - Build context │    │  - execute()    │    │  - getBool() │ │
│  │  - Route response│    │  - validate()   │    │  - getNum()  │ │
│  └──────────────────┘    └─────────────────┘    └──────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                      SERVICES LAYER                              │
├──────────────────────────────────────────────────────────────────┤
│  Services (inyectados via Container)                             │
│  - LLMService         - CreditsService    - ProductService       │
│  - ConciergeAgent    - TutorAgent        - MarketingAgent        │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                    REPOSITORIES LAYER                            │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                 │
├──────────────────────────────────────────────────────────────────┤
│  PostgreSQL + Redis + Config (DB)                                │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Flujo de una Query

```
Usuario envía query
        │
        ▼
Route → Controller
        │
        ▼
Error Handler (verifica)
        │
        ▼
AgentsOrchestrator
        ├── Clasifica intención
        ├── Selecciona agente
        ├── Carga skills relevantes
        └── Context building
        │
        ▼
Agente específico (Concierge, Tutor, etc.)
        │
        ▼
LLMService (inyectado)
        │
        ▼
Respuesta → Controller → Route → Usuario
```

---

## 4. Detalle por Mejora

---

### 4.1 Centralizar Orquestación de Agentes

#### Descripción
Crear una capa de orquestación centralizada que maneje el routing de queries AI a los agentes correctos, cargue sus skills y construya el contexto.

#### Componentes

| Componente | Descripción | Estado |
|------------|-------------|--------|
| **AgentsOrchestrator** | Punto único de entrada para queries AI | 🆕 Nuevo |
| **AgentsRegistry** | Registro de agentes disponibles en DB | 🆕 Nuevo |
| **SkillsRegistry** | Registro y ejecución de skills | 🆕 Nuevo |
| **ContextBuilder** | Construye el contexto para el agente | 🆕 Nuevo |

#### Tablas de Base de Datos

```sql
-- Registro de agentes
CREATE TABLE ai_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_key VARCHAR(50) UNIQUE NOT NULL,  -- 'concierge', 'tutor', 'marketing'
    name VARCHAR(100) NOT NULL,
    description TEXT,
    system_prompt TEXT NOT NULL,
    model VARCHAR(20) DEFAULT 'gpt-4o',
    fallback_model VARCHAR(20),  -- Modelo de fallback si el principal falla
    temperature DECIMAL(2,1) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 2000,
    is_default BOOLEAN DEFAULT FALSE,  -- TRUE = agente por defecto para queries no clasificadas
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registro de skills por agente
CREATE TABLE ai_agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES ai_agents(id),
    skill_key VARCHAR(50) NOT NULL,
    skill_name VARCHAR(100) NOT NULL,
    description TEXT,
    function_definition JSONB NOT NULL,  -- Define inputs/outputs
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registro de configuración de skills
CREATE TABLE ai_skills_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_key VARCHAR(50) UNIQUE NOT NULL,
    config JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Lógica del Orchestrator

```typescript
// AgentsOrchestrator.ts
interface QueryRequest {
  userId: string;
  query: string;
  context?: Record<string, unknown>;
}

interface QueryResponse {
  agent: string;
  response: string;
  skillUsed?: string;
  metadata: Record<string, unknown>;
}

class AgentsOrchestrator {
  async handleQuery(request: QueryRequest): Promise<QueryResponse> {
    // 1. Clasificar intención
    const intent = await this.classifyIntent(request.query);
    
    // 2. Seleccionar agente
    const agent = await this.selectAgent(intent);
    
    // 3. Cargar skills relevantes
    const skills = await this.skillsRegistry.getForAgent(agent.id);
    
    // 4. Construir contexto
    const context = await this.contextBuilder.build(request, skills);
    
    // 5. Ejecutar agente con fallback
    let response;
    try {
      response = await agent.execute(context);
    } catch (primaryError) {
      // Fallback 1: Intentar con modelo secundario
      try {
        const fallbackModel = await this.getFallbackModel(agent.model);
        context.model = fallbackModel;
        response = await agent.execute(context);
      } catch (fallbackError) {
        // Fallback 2: Responder con modo degradado
        response = await this.executeGracefulDegradation(context);
      }
    }
    
    // 6. Registrar para métricas
    await this.metrics.record({ intent, agent, skills, response });
    
    return response;
  }
  
  private async getFallbackModel(primary: string): Promise<string> {
    const fallbacks: Record<string, string> = {
      'gpt-4o': 'gemini-1.5-flash',
      'claude-3-opus': 'claude-3-haiku',
      'gemini-1.5-flash': 'claude-3-haiku',
    };
    return fallbacks[primary] || 'claude-3-haiku';
  }
  
  private async executeGracefulDegradation(context: QueryContext): Promise<QueryResponse> {
    return {
      agent: context.agentKey,
      response: 'Estoy tenido dificultades para procesar tu solicitud. Por favor, reformula tu pregunta o intenta más tarde.',
      skillUsed: undefined,
      metadata: { degraded: true }
    };
  }
}
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| ARCH-01 | Sistema | recibir una query y determinar qué agente usar | responder correctamente |
| ARCH-02 | Sistema | cargar los skills correctos para el agente seleccionado | tener la información necesaria |
| ARCH-03 | Admin | ver qué agentes se usan más | optimizar experiencia |
| ARCH-04 | Desarrollador | agregar un nuevo skill | extender la funcionalidad del sistema sin modificar código del agente |

#### Estado
✅ **IMPLEMENTADO** (Abril 2026) - SDD Orchestrator Phase 2

**Entregables:**
- ✅ Orchestrator service (`src/services/orchestrator.service.ts`)
- ✅ SkillsRegistry service (`src/services/skills-registry.service.ts`)
- ✅ Tabla `skills` en DB (`db/init/08-orchestrator-tables.sql`)
- ✅ Auto-registration en boot (`src/services/ai/index.ts`)
- ✅ Error middleware (`src/middlewares/orchestrator-error.middleware.ts`)

**Simplificaciones vs PRD original:**
- Una sola tabla `skills` en lugar de `ai_agents` + `ai_agent_skills` + `ai_skills_config`
- `serviceRef` enlaza skills a servicios existentes
- No usa DI Container (imports directos singleton pattern)

---

### 4.2 Manejo de Errores Centralizado

#### Descripción
Unificar el manejo de errores para que todas las respuestas de error tengan formato consistente y se registre apropiadamente.

#### Formato de Error Implementado

```typescript
// ErrorResponse - Orchestrator
{
  success: false,
  error: {
    code: string;        // 'ORCH_VALIDATION_ERROR' | 'ORCH_CAPABILITY_NOT_FOUND' | 'ORCH_EXECUTION_ERROR'
    message: string;    // Siempre genérico - sin info leakage
    capability?: string;
    field?: string;
  }
}
```

#### Error Classes Implementadas

```typescript
// src/services/orchestrator.service.ts
export class ValidationError extends Error {
  constructor(message: string, public readonly field: string) { ... }
}

export class CapabilityNotFoundError extends Error {
  constructor(public readonly capability: string) { ... }
}

export class CapabilityExecutionError extends Error {
  constructor(message: string, public readonly capability: string, public readonly cause?: Error) { ... }
}
```

#### HTTP Status Mapping

| Error Type | HTTP Status | Código |
|-----------|-----------|---------|
| ValidationError | 400 | ORCH_VALIDATION_ERROR |
| CapabilityNotFoundError | 404 | ORCH_CAPABILITY_NOT_FOUND |
| CapabilityExecutionError | 500 | ORCH_EXECUTION_ERROR |
| Generic Error | 500 | ORCH_INTERNAL_ERROR |

#### Notificación a Sistemas Externos
**Pendiente** - Sistema de notificaciones (Datadog/Slack) es Phase 3 del roadmap.

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| ERROR-01 | Usuario | recibir error en formato consistente | entender qué pasó |
| ERROR-02 | Admin | recibir notificación de errores críticos | actuar rápidamente |
| ERROR-03 | Desarrollador | ver el requestId en la respuesta | hacer debug |

#### Estado
✅ **IMPLEMENTADO parcialmente** (Abril 2026)
- ✅ Error classes
- ✅ Error middleware
- ✅ Formato consistente
- ✅ Sin info leakage (mensajes genéricos)
- ❌ Notificaciones a sistemas externos (Phase 3)

---

### 4.3 Unificar Configuración

#### Descripción
Crear un servicio de configuración centralizado que unifique todas las configuraciones de la aplicación en un solo lugar.

#### Tabla de Configuración

```sql
CREATE TABLE app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) DEFAULT 'string',  -- 'string', 'number', 'boolean', 'json'
    category VARCHAR(20) NOT NULL,               -- 'app', 'ai', 'payment', 'support'
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,             -- si se puede exponer al frontend
    is_encrypted BOOLEAN DEFAULT FALSE,          -- para passwords/secrets
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_config_type CHECK (config_type IN ('string', 'number', 'boolean', 'json'))
);

--seed inicial
INSERT INTO app_config (config_key, config_value, config_type, category, description) VALUES
-- Soporte / Concierge
('support.max_retries', '3', 'number', 'support', 'Máximo de reintentos para soporte'),
('support.timeout_ms', '30000', 'number', 'support', 'Timeout para queries LLM'),
('support.escalation_threshold', '2', 'number', 'support', 'Veces que AI no puede resolver antes de escalar'),

-- AI
('ai.default_model', 'gpt-4o', 'string', 'ai', 'Modelo LLM por defecto'),
('ai.temperature', '0.7', 'number', 'ai', 'Temperatura por defecto'),
('ai.max_tokens', '2000', 'number', 'ai', 'Máximo de tokens por respuesta'),
('ai.fallback_models', '["gemini-1.5-flash","claude-3-haiku"]', 'json', 'ai', 'Modelos de fallback'),

-- Rate Limiting
('rate_limit.support_per_minute', '10', 'number', 'app', 'Requests de soporte por minuto por usuario'),
('rate_limit.general_per_minute', '60', 'number', 'app', 'Requests generales por minuto por usuario');
```

#### Plan de Migración

> **Estrategia**: Migración gradual sin breaking changes. El ConfigService busca primero en DB, luego en variables de entorno, luego usa default.

**Fase 1: Lectura dual (compatibilidad)**

```typescript
class ConfigService {
  // Busca: 1) DB → 2) process.env → 3) default
  get(key: string, defaultValue?: string): string {
    // 1. Buscar en DB
    const dbValue = this.cache.get(key);
    if (dbValue !== undefined) return dbValue;
    
    // 2. Buscar en .env (backward compatibility)
    const envKey = key.toUpperCase().replace(/\./g, '_');
    if (process.env[envKey] !== undefined) return process.env[envKey];
    
    // 3. Usar default
    return defaultValue;
  }
}
```

**Fase 2: seed desde .env**

```bash
# script de migración:
# 1. Leer todos los valores de config/index.ts y .env
# 2. Insertar en app_config con category='migrated'
# 3. Verificar que funcionan iguales
```

**Fase 3: Cleanup (post deploy)**

```sql
-- Após validación completa:
-- 1. Eliminar código Legacy de config/index.ts
-- 2. Actualizar is_encrypted para secrets
-- 3. Quitar comentarios 'migrated'
```

**Reglas de migración**:
- ⚠️ No migrar secrets directamente — regenerar
- ⚠️ Validar 24h antes de quitar backward compatibility
- ⚠️ Mantener .env para local dev

#### Interfaz del ConfigService

```typescript
interface ConfigService {
  get(key: string, defaultValue?: string): string;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  getJSON<T>(key: string, defaultValue?: T): T;
  getAll(category?: string): Record<string, unknown>;
  set(key: string, value: string): void;
  setMany(configs: Record<string, string>): void;
}
```

#### Ejemplo de Uso

```typescript
// En lugar de:
const MAX_RETRIES = 3;
const TIMEOUT = 30000;

// Usar:
const config = Container.resolve(ConfigService);
const maxRetries = config.getNumber('support.max_retries', 3);
const timeout = config.getNumber('support.timeout_ms', 30000);

// En ConciergeAgent:
@injectable()
class ConciergeAgent {
  constructor(
    @inject('ConfigService') private config: ConfigService,
    @inject('LLMService') private llm: LLMService
  ) {}
  
  async handleQuery(query: string) {
    const timeout = this.config.getNumber('support.timeout_ms');
    const maxRetries = this.config.getNumber('support.max_retries');
    // ...
  }
}
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| CONFIG-01 | Desarrollador | consultar config con una línea | no buscar en múltiples lugares |
| CONFIG-02 | Admin | cambiar config desde DB | hacer changes sin deploy |
| CONFIG-03 | Sistema | tener config unificado | saber qué valor usar |

#### Estado
✅ **IMPLEMENTADO** (Marzo-Abril 2026)

**Entregables:**
- ✅ ConfigService (`src/services/config.service.ts`)
- ✅ Tabla `app_config` en DB
- ✅ Métodos: `get()`, `getNumber()`, `getBoolean()`, `getJSON()`
- ✅ Redis caching con TTL
- ✅ Lazy initialization

**Simplificaciones vs PRD original:**
- No usa DI Container (imports directos)
- `configLoaded` flag para evitar race conditions

---

### 4.4 User Context Memory (Evolución del Memory Service)

#### Descripción
Evolucionar el Memory Service actual de "solo buscar en contenido" a "recordar la interacción del usuario". Esto es esencial para la visión de "Plataforma de Experiencia".

#### Contexto del Problema
- El Memory Service actual busca en PDFs/contenido
- No guarda qué preguntó el usuario antes
- No sabe qué temas domina el usuario
- No tiene contexto de progreso

#### Nueva Funcionalidad

```typescript
interface UserContext {
  userId: string;
  productId: string;
  questions: QuestionHistory[];
  currentProgress: number;
  completedQuizzes: string[];
  notes: UserNote[];
  highlights: Highlight[];
  lastAccessedAt: Date;
  learningPath: LearningPath;
}

class UserMemoryService {
  // Guardar interacción
  async saveQuestion(userId, productId, question, answer): Promise<void>

  // Obtener contexto del usuario
  async getUserContext(userId, productId): Promise<UserContext>

  // Obtener progreso de aprendizaje
  async getLearningProgress(userId, productId): Promise<number>

  // Guardar nota/highlight
  async saveNote(userId, productId, note): Promise<void>
  async saveHighlight(userId, productId, highlight): Promise<void>

  // Generar lección de refuerzo basada en errores
  async generateReinforcementLesson(userId, productId): Promise<Lesson>
}
```

#### Tabla de Base de Datos

```sql
-- user_context: Contexto de cada usuario por producto
CREATE TABLE user_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    context_data JSONB DEFAULT '{}',  -- {questions:[], progress:0, notes:[], highlights:[]}
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- user_notes: Notas del usuario en un producto
CREATE TABLE user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    note_type VARCHAR(20),  -- 'highlight', 'bookmark', 'note'
    position JSONB,  -- {page, timestamp, etc.}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

####用例

| Caso de Uso | Descripción |
|------------|-------------|
| **Smart Playback** | El Tutor sabe dónde pausó el usuario y qué no entendió |
| **Lección de Refuerzo** | Si falla quiz, generar lección basada en errores |
| **Resumen IA** | Conocer nivel del usuario para generar resumen adecuado |
| **Progreso Personalizado** | Guardar ruta de aprendizaje |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| MEM-01 | Sistema | guardar lo que pregunta el usuario | recordarlo después |
| MEM-02 | Sistema | guardar notas y highlights | poder recuperarlos |
| MEM-03 | IA | conocer progreso del usuario | personalizar respuesta |
| MEM-04 | IA | detectar si no entiende | ofrecer ayuda proactiva |

#### Dependencias

- Memory Service existente (pgvector)
- Transcription Service (para Audio Notes)
- User profiles

#### Estado
🆕 **NUEVO** - Requiere desarrollo (Fase 5 del Roadmap AI-FEATURES)

---

## 5. Roadmap de Implementación

> **Fecha inicio**: Marzo 2026  
> **Duración**: 10 semanas  
> **Nota**: Todas las tareas de implementación siguen el Estándar de Verificación definido en `docs/project/common/verification-standard.md`

> **Definition of Done**: Cada fase se considera completada cuando:  
> - Código en `master` con tests passing  
> - `pnpm tsc` sin errores  
> - `pnpm lint --filter` sin errores/warnings  
> - `pnpm vitest run` 100% pasando  
> - Code review aprobado (`gga run`)  
> - Security verificado  
> - Despliegue a staging verificado

### Fase 1: Fundamentos (Semanas 1-2) ✅ COMPLETADO

| Semana | Mejora | Entregable | Estado |
|--------|--------|-------------|--------|
| 1-2 | **Unificar Configuración** | ConfigService + tabla DB | ✅ Completado |

### Fase 2: Orquestación (Semanas 3-5) ✅ COMPLETADO (Abril 2026)

| Semana | Mejora | Entregable | Estado |
|--------|--------|-------------|--------|
| 3-4 | **Centralizar Orquestación** | Orchestrator + SkillsRegistry | ✅ Completado |
| 4-5 | **Skills Registry** | Tabla de skills en DB | ✅ Completado |

**Entregables Phase 2:**
- ✅ Orchestrator service con error handling
- ✅ SkillsRegistry service con Redis caching
- ✅ Auto-registration en boot
- ✅ Error middleware con mensajes genéricos

### Fase 3: Errores (Semanas 6-7) ⏳ PENDIENTE

| Semana | Mejora | Entregable | Estado |
|--------|--------|-------------|--------|
| 6-7 | **Manejo de Errores** | Error handler + notificaciones | ⏳ Pendiente |

**Pendiente en Phase 3:**
- Sistema de notificaciones (Datadog/Slack) para errores críticos

### Fase 4: API Routes (Semana 4) ✅ COMPLETADO (Abril 2026)

| Semana | Mejora | Entregable | Estado |
|--------|--------|-------------|--------|
| 4 | **API Routes** | Orchestrator endpoints | ✅ Completado |

**Entregables Phase 4:**
- ✅ GET /api/orchestrator/capabilities (public)
- ✅ GET /api/orchestrator/skills (public)
- ✅ POST /api/orchestrator/query (JWT + rate limited)
- ✅ Input validation robusta
- ✅ Unit tests (959 tests passing)

### Fase 4: Integración (Semanas 8-10) [Agosto 2026]

| Semana | Mejora | Entregable | Depende de |
|--------|--------|-------------|-----------|
| 8-9 | **Integración Concierge** | Concierge usando nuevas capas | Todas las anteriores |
| 10 | **Testing y documentación** | Tests end-to-end | Fase 3 |

### Fase 5: User Context (Semanas 20-24) [Octubre - Noviembre 2026]

> Fase coordinada con AI-FEATURES Fase 3: Learning AI

| Semana | Mejora | Entregable | Depende de |
|--------|--------|-------------|-----------|
| 20-21 | **User Context Memory** | Tabla user_context + servicio | Memory Service |
| 22-23 | **User Notes & Highlights** | Tabla user_notes + servicio | User Context |
| 24 | **Integración** | Con AI Summary, Book Highlights | User Context |

---

## 6. Testing

### 6.1 Unit Tests (por fase)

| Fase | Tests | Archivos |
|------|-------|---------|
| Fase 1: ConfigService | T-090 a T-095 | `config.service.test.ts`, `config.repository.test.ts` |
| Fase 2: Orchestrator | T-110b, T-112b, T-130b | `skills-registry.service.test.ts`, `orchestrator.service.test.ts` |
| Fase 3: Errores | TBD | `error-handler.test.ts` |

### 6.2 Integration Tests

| Test | Descripción |
|------|-------------|
| Orchestrator full flow | Query pasa por orchestrator → skill → response |
| Skills discovery | GET /orchestrator/skills retorna todas |
| Capability routing | Cada capability rutea al skill correcto |

### 6.3 Test Fixtures

```typescript
// src/__tests__/fixtures/architecture-improvements.ts
export const mockSkills = [
  { capability: 'llm.chat', name: 'LLM Chat', handler: mockLLM },
  { capability: 'embedding.generate', name: 'Embedding', handler: mockEmbedding },
];
```

### 6.4 Coverage Target

| Tipo | Target |
|------|--------|
| Unit Tests | >= 80% |
| Integration | Core flows |

---

## 7. Dependencias y Riesgos

### 6.1 Dependencias

| Dependencia | De | Impacto | Orden |
|-------------|---|---------|-------|
| ConfigService | Todas las mejoras | Bloqueador | 1 (primera) |
| Orchestrator | SkillsRegistry | Alto | 2 |
| SkillsRegistry | Agentes AI | Medio | 3 |
| LLMService existente | Orchestrator | Medio | 2 |
| DB existente | Todas | Bajo | - |

### 6.2 Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Breaking changes en código existente | Agregar migración gradual |
| Performance por configuración en DB | Redis caching |
| Keys de config no encontradas | Defaults obligatorios |

### 6.3 Requisitos No Funcionales

#### 6.3.1 Performance del Orchestrator

| Métrica | Objetivo |
|---------|----------|
| **Tiempo de clasificación de intención** | < 200ms |
| **Tiempo de selección de agente** | < 100ms |
| **Tiempo de construcción de contexto** | < 500ms |
| **Tiempo total (sin LLM)** | < 1 segundo |

#### 6.3.2 Timeouts del Orchestrator

| Escenario | Timeout | Manejo |
|-----------|---------|--------|
| Clasificación de intención | 2s | Fallback a agente por defecto |
| Selección de agente | 1s | Error genérico |
| Construcción de contexto | 5s | Reintento 1 vez, luego error |
| Ejecución de agente | 60s (heredado del LLM) | Timeout del LLM |

#### 6.3.3 Monitoreo del Orchestrator

| Métrica | Descripción | Alerta |
|---------|-------------|--------|
| **Queries por segundo** | Requests al orquestador | > 100/s |
| **Tiempo promedio** | Latencia promedio | > 2s |
| **Errores por tipo** | Errors分类ados | > 5% |
| **Agente más usado** | Distribución de uso | Si > 80% un agente |
| **Skills ejecutados** | Uso por skill | Sin alerta |

#### 6.3.4 Seguridad

| Control | Descripción |
|---------|-------------|
| **Auth requerida** | JWT obligatorio en todas las queries |
| **Rate limiting** | 60 queries/min por usuario |
| **Audit logging** | Registrar todas las queries (sin PII) |
| **Sanitización de input** | Evitar prompt injection |

---

**Documento preparado para revisión.**