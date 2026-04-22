# SDD Tasks: Orchestrator + Skills Registry

## Fase 2: Implementación de Orquestación de Agentes

---

## Definition of Done

> Cada tarea se considera completada cuando:
> - Código en `main` con tests passing
> - `pnpm tsc` sin errores
> - `pnpm lint` sin errores/warnings
> - `pnpm vitest run` 100% pasando

---

## 1. Infrastructure (Semana 3)

### 1.1 Database Setup

- [x] **T-100**: Create skills table migration
  - File: `db/init/08-orchestrator-tables.sql`
  - Validar: Tabla skills creada con índices

- [x] **T-100b**: Run and verify migration in dev environment
  - Command: Ejecutado en Docker DB
  - Validar: 10 skills insertadas

### 1.2 ConfigService Keys

- [x] **T-101**: Add orchestrator config keys to ALLOWED_CONFIG_KEYS
  - Location: `src/services/config.service.ts`
  - Keys: `orchestrator.default_timeout`, `orchestrator.max_retries`, `orchestrator.cache_ttl`
  - Validar: Keys en allowlist

---

## 2. Skills Registry (Semana 3-4)

### 2.1 Core Service

- [x] **T-110**: Create SkillsRegistry service
  - File: `src/services/skills-registry.service.ts`
  - Methods: `register()`, `findByCapability()`, `listAll()`, `findHandler()`
  - Validar: Unit tests passing

- [x] **T-110b**: Create unit tests for SkillsRegistry
  - File: `src/__tests__/services/skills-registry.service.test.ts`
  - Tests: 21 passing (register, validation, handlers, JSON parse error)
  - Validar: All tests passing

- [x] **T-111**: Add Redis caching to SkillsRegistry
  - Location: `src/services/skills-registry.service.ts`
  - Cache keys: `skills:all`, `skill:{capability}`
  - Validar: Cache hit/miss logging
  - Status: Integrado en T-110

- [x] **T-112**: Create skills table repository
  - File: N/A (usa pool.query directo en SkillsRegistry)
  - Validar: CRUD operations via SkillsRegistry
  - Status: Simplificado - no archivo separado necesario

- [x] **T-112b**: Create unit tests for skills repository
  - File: N/A (cubierto por T-110b)
  - Status: Cubierto por tests de T-110b

### 2.2 Auto-Registration

- [x] **T-119**: Call registerAISkills() in boot sequence
  - Location: `src/index.ts`
  - Call: `await registerAISkills()` en boot sequence (step 4)
  - Validar: Skills registradas en memoria antes de aceptar queries

- [x] **T-120**: Create AI skills boot registration
  - File: `src/services/ai/index.ts`
  - Function: `registerAISkills()` que registra servicios AI
  - Skills: `llm.chat`, `llm.stream`, `embedding.generate`, `embedding.batch`
  - Includes: Input validation (messages, temperature, maxTokens, text)
  - Includes: Throw on boot failure (consistent with Scheduler pattern)
  - Validar: TypeScript ✅, Lint ✅, Tests ✅ 933 passed

- [x] **(T-120b)**: Unit tests for registerAISkills
  - File: `src/__tests__/services/ai/ai-boot.test.ts`
  - Tests: 13 passing (registration + handler validation)
  - Validar: All tests passing

---

## 3. Orchestrator Service (Semana 4)

### 3.1 Core

- [x] **T-130**: Create Orchestrator service
  - File: `src/services/orchestrator.service.ts`
  - Methods: `executeQuery()`, `listCapabilities()`
  - Validar: Unit tests passing ✅

- [x] **T-130b**: Create unit tests for Orchestrator
  - File: `src/__tests__/services/orchestrator.service.test.ts`
  - Tests: 11 passing
  - Validar: All tests passing ✅

- [x] **T-131**: Add capability validation
  - Location: `src/services/orchestrator.service.ts`
  - Implemented: `isValidCapabilityName()` + `findByCapability()` returns null if not found
  - Validar: Solo allowlisted capabilities ✅

### 3.2 Error Handling

- [x] **T-132**: Create OrchestratorError class
  - File: `src/services/orchestrator.service.ts` (integrated)
  - Classes: `ValidationError`, `CapabilityNotFoundError`, `CapabilityExecutionError`
  - Validar: Errores con formato estándar ✅

- [x] **T-133**: Add error middleware
  - File: `src/middlewares/orchestrator-error.middleware.ts`
  - Validar: Errores retornan JSON correcto ✅
  - Security: Generic messages, no info leakage

---

## 4. API Routes (Semana 4)

### 4.1 Endpoints

- [x] **T-140**: Create orchestrator routes
  - File: `src/routes/orchestrator.routes.ts`
  - Endpoints: POST /query, GET /skills, GET /capabilities
  - Validar: All endpoints return correct response ✅

- [x] **T-141**: Add auth middleware to routes
  - Location: `src/routes/orchestrator.routes.ts`
  - Protected: /query (JWT)
  - Public: /skills, /capabilities
  - Validar: 401 sin token ✅

- [x] **T-142**: Add input validation
  - Location: `src/routes/orchestrator.routes.ts`
  - Validar: Bad input retorna 400 ✅
  - Features: capability length check, input type check (object only)

- [x] **T-143**: Register orchestrator routes in app.ts
  - Location: `src/app.ts`
  - Add: `app.use('/api/orchestrator', orchestratorRoutes)`
  - Validar: Rutas responden en /api/orchestrator/* ✅

- [ ] **T-143b**: Add streaming endpoint for llm.stream
  - Location: `src/routes/orchestrator.routes.ts`
  - Endpoint: GET /stream (WebSocket o Server-Sent Events)
  - Validar: Streaming response funciona

### 4.2 Backward Compatibility

- [x] **T-144**: Verify existing AI service imports still work
  - Files to verify: `ai.routes.ts`, `agents.service.ts`, `memory.service.ts`, `content/*.service.ts`
  - Endpoints to verify: POST /api/llm/chat, POST /api/embedding/generate, POST /api/qa/answer
  - Validar: Endpoints funcionan igual que antes (backward compatible) ✅

- [x] **T-145**: Verify existing tests still pass
  - After changes: Tests 959 passing
  - Validar: No nuevos failures ✅

- [x] **T-146**: Add configService mock to new test files
  - Location: Tests mocking orchestrator services
  - Pattern: Mock services to avoid Redis connection issues
  - Validar: Tests pass without Redis running ✅

---

## 5. Integration (Semana 5)

### 5.1 Register Existing Services

- [x] **T-150**: Register LLM service skill
  - Capability: `llm.chat`, `llm.stream`
  - Location: `src/services/ai/index.ts`
  - Validar: Skill en registry ✅

- [x] **T-151**: Register Embedding service skill
  - Capability: `embedding.generate`, `embedding.batch`
  - Validar: Skill en registry ✅

- [x] **T-152**: NOT APPLICABLE - QA Service
  - Capability: `qa.answer`, `qa.with_context`
  - Razón: QA Service ya tiene sus propias rutas en `ai.routes.ts`. Inputs complejos (productId, userId, question) no encajan en Orchestrator text-in/text-out pattern.
  - Estado: N/A - Usar rutas existentes

- [x] **T-153**: NOT APPLICABLE - Memory Service
  - Capability: `memory.store`, `memory.recall`
  - Razón: Memory Service usa pgvector para RAG. Ya integrado como contexto en LLM Service, no como capability independiente.
  - Estado: N/A - Contexto para LLM, no capability

- [x] **T-154**: NOT APPLICABLE - Review Service
  - Capability: `review.analyze`
  - Razón: Review Service requiere verificación de compra, lógica de negocio compleja. Ya tiene rutas propias en `ai.routes.ts`.
  - Estado: N/A - Usar rutas existentes

- [x] **T-155**: NOT APPLICABLE - Transcription Service
  - Capability: `transcribe.audio`
  - Razón: Transcription requiere input de archivo (Buffer), no texto. Whisper API procesa archivos, no queries.
  - Estado: N/A - Usar rutas existentes

### 5.2 Integration Tests

- [x] **T-160**: Integration test: full query flow
  - Validar: Query pasa por orchestrator → skill → response ✅
  - Note: Tests 959 passing

- [x] **T-160**: Integration test: full query flow
  - Validar: Query pasa por orchestrator → skill → response ✅
  - Tests: 969 passing

- [x] **T-161**: Integration test: skill discovery
  - Validar: GET /orchestrator/capabilities retorna todas ✅

- [x] **T-162**: Integration test: capability routing
  - Validar: Cada capability rutea al skill correcto ✅

- [x] **T-163**: Verify backward compatibility
  - Validar: Tests existentes no rompen por nuevos servicios ✅

---

## 6. Documentation (Semana 5)

- [ ] **T-170**: Update API documentation
  - OpenAPI/Swagger: /orchestrator/*
  - Validar: Docs generan correctamente

- [ ] **T-171**: Add usage examples
  - Location: `docs/orchestrator-usage.md`
  - Validar: Ejemplos claros

---

## Task Summary

| Phase | Tasks | Count | Status |
|-------|-------|-------|--------|
| 1. Infrastructure | T-100, T-100b, T-101 | 3 ✅ |
| 2. Skills Registry | T-110, T-110b, T-111, T-112, T-112b | 5 ✅ |
| 2b. Auto-Registration | T-119, T-120, T-120b | 3 ✅ |
| 3. Orchestrator | T-130, T-130b, T-131, T-132 | 4 ✅ |
| 3b. Error Middleware | T-133 | 1 ✅ |
| 4. API Routes | T-140, T-141, T-142, T-143, T-144, T-145, T-146 | 7 ✅ |
| 4b. Streaming | T-143b | 1 ⏳ |
| 5. Integration | T-150, T-151 | 2 ✅ |
| 5. Integration (N/A) | T-152, T-153, T-154, T-155 | 4 N/A |
| 5. Integration Tests | T-160 | 1 ✅ |
| 5. Integration Tests | T-161, T-162, T-163 | 3 ⏳ |
| 6. Documentation | T-170, T-171 | 2 ⏳ |

**Completado: 21 tasks**
**N/A (ya tienen rutas propias): 4 tasks**
**Pendiente: 8 tasks**

---

## Notes

- **T-111 y T-112 simplificadas**: Redis caching y repository integrados en T-110
  - SkillsRegistry usa pool.query directo (no repository separado)
  - Cache Redis implementado dentro del servicio
  - Tests cubren todas las operaciones

- T-100 requiere coordinación con DB migrations
- T-119 + T-120 son para boot registration (T-120 crea, T-119 llama)
- T-100b ejecute la migración en dev
- T-143b streaming endpoint es opcional (solo si hay demanda)
- T-144-T-145 ejecutarse siempre ANTES y DESPUÉS de cambios
- CRÍTICO: Handler siempre viene de registeredSkills (in-memory), NO de DB/Redis
- La DB solo guarda metadata para discovery, no handlers

---

**Tasks Creado**: Abril 2026  
**Estado**: Listo para Implementación  
**Author**: SDD Workflow