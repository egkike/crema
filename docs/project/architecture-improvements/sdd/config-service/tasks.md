# Tasks: ConfigService

**Cambio**: Implementar ConfigService  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: TODO  
**Fecha**: Abril 2026

---

## Fase 1: Setup (Semana 1)

### 1.1 Base de Datos

- [ ] **T-001**: Crear tabla `app_config` en PostgreSQL
  - Archivo: `backend/db/init/XX-config-service-tables.sql`
  - Validar: Query de creacion exitosa
  - VERIFICAR: Security constraints (check constraints, no SQL injection)

- [ ] **T-002**: Insertar seed data para las 13 variables iniciales
  - Validar: Todos los valores insertados

- [ ] **T-003**: Agregar indice unico en `config_key`
  - Validar: No hay duplicados

### 1.2 Repository

- [ ] **T-010**: Crear entidad `AppConfig` en `entities/`
  - Ubicación: `src/entities/app-config.entity.ts`
  - Validar: Tipos correctos
  - VERIFICAR: `pnpm tsc` sin errores
  - VERIFICAR: `pnpm lint --filter` sin errores

- [ ] **T-011**: Crear `ConfigRepository` en `repositories/`
  - Ubicación: `src/repositories/config.repository.ts`
  - Validar: Implementa `IConfigRepository`
  - VERIFICAR: `pnpm tsc` sin errores
  - VERIFICAR: `pnpm lint --filter` sin errores

- [ ] **T-012**: Agregar al pool de dependencias
  - Ubicación: `src/services/container.ts`
  - Validar: `Container.bind('ConfigRepository')`
  - VERIFICAR: `pnpm test` pasando

### 1.3 Service

- [ ] **T-020**: Crear `ConfigService` en `services/`
  - Ubicación: `src/services/config.service.ts`
  - Validar: Interfaz completa
  - VERIFICAR: `pnpm tsc` sin errores
  - VERIFICAR: `pnpm lint --filter` sin errores/warnings
  - VERIFICAR: Security - sanitizacion de keys

- [ ] **T-021**: Implementar metodos getter
  - `get()`, `getNumber()`, `getBoolean()`, `getJSON()`
  - Validar: Tests pasando

- [ ] **T-022**: Implementar metodos setter
  - `set()`, `setMany()`
  - Validar: Upsert funciona

- [ ] **T-023**: Registrar en Container
  - Ubicación: `src/services/container.ts`
  - Validar: `Container.bind('ConfigService')`
  - VERIFICAR: `pnpm test` pasando

---

## Fase 2: Cache (Semana 1-2)

### 2.1 Redis Integration

- [ ] **T-030**: Agregar Redis al ConfigService
  - Inyectar `RedisService`
  - Validar: Redis responde
  - VERIFICAR: Performance - latency < 10ms

- [ ] **T-031**: Implementar lectura de cache
  - Estrategia: Read-through
  - TTL: 5 minutos
  - Validar: Cache hit

- [ ] **T-032**: Implementar invalidacion
  - Al hacer `set()`, invalidar cache
  - Validar: Cache invalidado
  - VERIFICAR: Cache miss luego de invalidacion

- [ ] **T-033**: Agregar logs de cache
  - Debug: cache hit/miss, fallback
  - Validar: Logs visibles
  - VERIFICAR: No logging de valores sensibles

---

## Fase 3: API Admin (Semana 2)

### 3.1 Routes

- [ ] **T-040**: Crear routes de admin
  - Ubicación: `src/routes/admin.config.routes.ts`
  - Validar: Rutas registradas
  - VERIFICAR: `pnpm tsc` sin errores
  - VERIFICAR: `pnpm lint --filter` sin errores

- [ ] **T-041**: Implementar GET /admin/config
  - Query: `?category=ai`
  - Validar: Lista todos los configs
  - VERIFICAR: Rate limiting

- [ ] **T-042**: Implementar GET /admin/config/:key
  - Validar: Retorna valor especifico
  - VERIFICAR: 404 si no existe

- [ ] **T-043**: Implementar PUT /admin/config/:key
  - Body: `{ value: "123", type: "number" }`
  - Validar: Actualiza valor
  - VERIFICAR: Input validation (sanitize, tipos)

- [ ] **T-044**: Implementar POST /admin/config/batch
  - Body: `{ configs: [...] }`
  - Validar: Actualiza multiples

### 3.2 Auth

- [ ] **T-050**: Proteger rutas con auth
  - Solo admins pueden escribir
  - Validar: 403 para no admins

- [ ] **T-051**: Validar input
  - Sanitizar keys
  - Validar tipos
  - Validar: Input malicioso rechado
  - VERIFICAR: SQL injection protection

---

## Fase 4: Migración (Semana 2)

### 4.1 Servicios Core

- [x] **T-060**: Migrar `PayoutService`
  - Key: `retry.payout_delay`
  - Ubicación: `src/services/payout.service.ts`
  - Validar: Lee de ConfigService

- [x] **T-061**: Migrar `ReleaseService`
  - Key: `retry.release_delay`
  - Ubicación: `src/services/release.service.ts`
  - Validar: Lee de ConfigService

### 4.2 Servicios AI

- [x] **T-070**: Migrar `EmbeddingService`
  - Key: `ai.embedding_dimensions`
  - Ubicación: `src/services/ai/embedding.service.ts`
  - Validar: Lee de ConfigService

- [x] **T-071**: Migrar `TranscriptionService`
  - Keys: `ai.whisper_model`, `ai.default_transcription_lang`
  - Ubicación: `src/services/ai/content/transcription.service.ts`
  - Validar: Lee de ConfigService

- [x] **T-072**: Migrar `LLMService`
  - Key: `ai.simulator_delay`
  - Ubicación: `src/services/ai/llm.service.ts`
  - Validar: Lee de ConfigService

### 4.3Otros Servicios

- [x] **T-080**: Migrar `ProductService`
  - Key: `commission.default_margin`
  - Validar: Lee de ConfigService

- [x] **T-081**: Migrar `AdminRepository`
  - Key: `pagination.admin_limit`
  - Ubicación: `src/repositories/admin.repository.ts`
  - Validar: Lee de ConfigService

- [x] **T-082**: Migrar `BlockonomicsProvider`
  - Keys: `providers.blockonomics_timeout`, `providers.address_cleanup_ttl`
  - Ubicación: `src/services/payment/providers/BlockonomicsProvider.ts`
  - Validar: Lee de ConfigService

---

## Fase 5: Tests (Semana 2)

### 5.1 Unit Tests

- [ ] **T-090**: Tests de ConfigService
  - Cobertura: metodos principales (get, set, getNumber, getBoolean, getJSON)
  - Ubicación: `src/__tests__/services/config.service.test.ts`
  - Validar: 80%+ coverage
  - VERIFICAR: `pnpm vitest run` pasando sin errores
  - VERIFICAR: `pnpm tsc` sin errores
  - VERIFICAR: `pnpm lint --filter` sin errores/warnings

- [ ] **T-091**: Tests de ConfigRepository
  - Cobertura: CRUD (findByKey, findByCategory, upsert, delete)
  - Ubicación: `src/__tests__/repositories/config.repository.test.ts`
  - Validar: Tests pasando
  - VERIFICAR: `pnpm vitest run` pasando

### 5.2 Integration Tests

- [ ] **T-092**: Tests de API
  - GET/PUT endpoints, auth, validation
  - Ubicación: `src/__tests__/admin.config.test.ts`
  - Validar: Tests pasando
  - VERIFICAR: `pnpm vitest run` pasando

### 5.3 Performance Tests

- [ ] **T-094**: Tests de performance
  - Latencia de lectura (cache hit: <5ms, cache miss: <50ms)
  - Latencia de escritura: <100ms
  - Ubicación: `src/__tests__/services/config.performance.test.ts`
  - VERIFICAR: Benchmarks passing

### 5.4 Security Tests

- [ ] **T-095**: Tests de seguridad
  - SQL injection en keys
  - XSS en valores
  - Input validation
  - No logging de secrets
  - Ubicación: `src/__tests__/services/config.security.test.ts`
  - VERIFICAR: Security checks passing

### 5.5 E2E

- [ ] **T-093**: Test de migracion
  - Verificar que servicios funcionan igual
  - Validar: No breaking changes

---

## Fase 6: Deploy (Semana 2)

### 6.1 Staging

- [ ] **T-100**: Run migrations en staging
  - Tabla + seed
  - Validar: Funciona
  - VERIFICAR: Indexes creados correctamente

- [ ] **T-101**: Deploy ConfigService
  - Validar: Funciona
  - VERIFICAR: `pnpm build` sin errores

- [ ] **T-102**: Tests de staging
  - Validar: Todo passing
  - VERIFICAR: `pnpm test` passing en staging
  - VERIFICAR: `gga run` (code review) aprobado

### 6.2 Production

- [ ] **T-110**: Run migrations en production
  - Validar: Funciona
  - VERIFICAR: Indexes creados correctamente

- [ ] **T-111**: Deploy ConfigService
  - Validar: Funciona
  - VERIFICAR: `pnpm build` sin errores en prod

- [ ] **T-112**: Monitor
  - Verificar logs
  - Verificar cache hit rate
  - Validar: Sin errores
  - VERIFICAR: Performance metrics (latencia normal)

---

## Resumen de Tasks

| Fase | Tasks | Estado |
|------|------|--------|
| Fase 1: Setup | T-001 a T-023 | TODO |
| Fase 2: Cache | T-030 a T-033 | TODO |
| Fase 3: API | T-040 a T-051 | TODO |
| Fase 4: Migración | T-060 a T-082 | TODO |
| Fase 5: Tests | T-090 a T-095 | TODO |
| Fase 6: Deploy | T-100 a T-112 | TODO |
| **Total** | **37** | |

---

## Checklist de Verificación (todas las tareas)

Para cada tarea, verificar:

| Verificación | Comando | Criterio |
|--------------|---------|----------|
| TypeScript | `pnpm tsc` | Sin errores |
| Lint | `pnpm lint --filter` | Sin errores/warnings |
| Tests | `pnpm vitest run` | 100% pasando |
| Coverage | `pnpm vitest run --coverage` | >= 80% |
| Build | `pnpm build` | Sin errores |
| Security | Code review | Sin vulnerabilidades |
| Performance | Benchmarks | Latencia: lectura <50ms |

---

## Definition of Done

Una task se considera completada cuando:
- Código en `main`
- Tests unitarios pasando
- `pnpm tsc` sin errores
- `pnpm lint` sin errores/warnings
- Code review aprobado (`gga run`)
- Deploy a staging verificado
- Performance verificada
- Security verificado

---

**Siguiente paso**: Apply las tasks de Fase 1