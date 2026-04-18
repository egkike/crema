# Product Requirements Document (PRD)
## Crema - Mejoras de Arquitectura

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estado Actual](#2-estado-actual)
3. [Arquitectura Propuesta](#3-arquitectura-propuesta)
4. [Detalle por Mejora](#4-detalle-por-mejora)
5. [Roadmap de Implementación](#5-roadmap-de-implementación)
6. [Dependencias y Riesgos](#6-dependencias-y-riesgos)

---

## 1. Resumen Ejecutivo

### 1.1 Visión

Dotar al backend de Crema de una arquitectura más robusta, mantenible y escalable mediante tres mejoras clave que facilitan la implementación futura de features AI como el Concierge de Soporte.

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
| 4 | Unificar Configuración | MEDIA |

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
    temperature DECIMAL(2,1) DEFAULT 0.7,
    max_tokens INTEGER DEFAULT 2000,
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
    
    // 5. Ejecutar agente
    const response = await agent.execute(context);
    
    // 6. Registrar para métricas
    await this.metrics.record({ intent, agent, skills, response });
    
    return response;
  }
}
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| ARCH-01 | Sistema | recibir una query y determinar qué agente usar | responder correctamente |
| ARCH-02 | Sistema | cargar los skills correctos para el agente seleccionado | tener la información necesaria |
| ARCH-03 | Admin | ver qué agentes se usan más | optimizar experiencia |
| ARCH-04 | Desarrollador | agregar un nuevo skill | |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.2 Manejo de Errores Centralizado

#### Descripción
Unificar el manejo de errores para que todas las respuestas de error tengan formato consistente y se registre apropiadamente.

#### Formato de Error Propuesto

```typescript
// ErrorResponse
{
  success: false,
  error: {
    code: 'AUTH_001' | 'VALIDATION_001' | 'AI_001' | 'INTERNAL_001',
    message: 'Mensaje legible para usuario',
    details?: Record<string, unknown>,
    requestId: string  // Para debugging
  },
  timestamp: '2026-04-18T12:00:00Z'
}
```

#### Clasificación de Errores

| Categoría | Códigos | ej | Acción |
|-----------|---------|---|---|
| **AUTH** | AUTH_001 al AUTH_999 | AUTH_001: Token inválido | 401 Unauthorized |
| **VALIDATION** | VALIDATION_001 al 999 | VALIDATION_001: Campo requerido | 400 Bad Request |
| **AI** | AI_001 al AI_999 | AI_001: LLM no disponible | 503 con retry |
| **INTERNAL** | INTERNAL_001 al 999 | INTERNAL_001: Error DB | 500 + notificar |
| **EXTERNAL** | EXTERNAL_001 al 999 | EXTERNAL_001: MP falló | 502 + retry |

#### Notificación a Sistemas Externos

| Sistema | Cuándo | Qué |
|--------|--------|-----|
| **Logs (Datadog)** | Siempre | Error completo |
| **Slack/Discord** | Solo INTERNAL_001+ (errores críticos) | Alerta con requestId |
| **Metrics** | Siempre | Contador por tipo |

####User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| ERROR-01 | Usuario | recibir error en formato consistente | entender qué pasó |
| ERROR-02 | Admin | recibir notificación de errores críticos | actuar rápidamente |
| ERROR-03 | Desarrollador | ver el requestId en la respuesta | hacer debug |

#### Estado
🆕 **MEJORA** - Ampliar implementación existente

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

####User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| CONFIG-01 | Desarrollador | consultar config con una línea | no buscar en múltiples lugares |
| CONFIG-02 | Admin | cambiar config desde DB | hacer changes sin deploy |
| CONFIG-03 | Sistema | tener config unificado | saber qué valor usar |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

## 5. Roadmap de Implementación

### Fase 1: Fundamentos (Semanas 1-2)

| Semana | Mejora | Entregable |
|--------|--------|-------------|
| 1-2 | **Unificar Configuración** | ConfigService + tabla DB |

### Fase 2: Orquestación (Semanas 3-5)

| Semana | Mejora | Entregable |
|--------|--------|-------------|
| 3-4 | **Centralizar Orquestación** | Orchestrator + AgentsRegistry |
| 4-5 | **Skills Registry** | Tabla de skills en DB |

### Fase 3: Errores (Semanas 6-7)

| Semana | Mejora | Entregable |
|--------|--------|-------------|
| 6-7 | **Manejo de Errores** | Error handler + not |

### Fase 4: Integración (Semanas 8-10)

| Semana | Mejora | Entregable |
|--------|--------|-------------|
| 8-9 | **Integración Concierge** | Concierge usando nuevas capas |
| 10 | **Testing y documentación** | Tests end-to-end |

---

## 6. Dependencias y Riesgos

### 6.1 Dependencias

| Dependencia | De | Impacto |
|-------------|---|---------|
| ConfigService | Todas las mejoras | Bloqueador |
| SkillsRegistry | Orchestrator | Alto |
| LLMService existente | Orchestrator | Medio |
| DB existente | Todas | Bajo |

### 6.2 Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Breaking changes en código existente | Agregar migración gradual |
| Performance por configuración en DB | Redis caching |
| Keys de config no encontradas | Defaults obligatorios |

---

**Documento preparado para revisión.**