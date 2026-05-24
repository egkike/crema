# Tasks: ConfigService

**Cambio**: Implementar ConfigService  
**Tipo**: Arquitectura  
**SDD Phase**: Tasks  
**Estado**: TODO  
**Fecha**: Abril 2026

---

## Fase 1: Setup (Semana 1) ✅ COMPLETADO

### 1.1 Base de Datos

- [x] **T-001**: Crear tabla `app_config` en PostgreSQL
- [x] **T-002**: Insertar seed data para las 13 variables iniciales
- [x] **T-003**: Agregar indice unico en `config_key`

### 1.2 Repository

- [x] **T-010**: Crear entidad `AppConfig` en `entities/`
- [x] **T-011**: Crear `ConfigRepository` en `repositories/`
- [x] **T-012**: Agregar al pool de dependencias

### 1.3 Service

- [x] **T-020**: Crear `ConfigService` en `services/`
- [x] **T-021**: Implementar metodos getter
- [x] **T-022**: Implementar metodos setter
- [x] **T-023**: Registrar en Container

---

## Fase 2: Cache (Semana 1-2) ✅ COMPLETADO

### 2.1 Redis Integration

- [x] **T-030**: Agregar Redis al ConfigService
- [x] **T-031**: Implementar lectura de cache
- [x] **T-032**: Implementar invalidacion
- [x] **T-033**: Agregar logs de cache

---

## Fase 3: API Admin (Semana 2) ✅ COMPLETADO

### 3.1 Routes

- [x] **T-040**: Crear routes de admin
- [x] **T-041**: Implementar GET /admin/config
- [x] **T-042**: Implementar GET /admin/config/:key
- [x] **T-043**: Implementar PUT /admin/config/:key
- [x] **T-044**: Implementar POST /admin/config/batch

### 3.2 Auth

- [x] **T-050**: Proteger rutas con auth
- [x] **T-051**: Validar input

---

## Fase 4: Migración (Semana 2) ✅ COMPLETADO

### 4.1 Servicios Core

- [x] **T-060**: Migrar `PayoutService`

### 4.2 Servicios AI

- [x] **T-070**: Migrar `EmbeddingService`
- [x] **T-071**: Migrar `TranscriptionService`
- [x] **T-072**: Migrar `LLMService`

### 4.3 Otros Servicios

- [x] **T-080**: Migrar `ProductService`
- [x] **T-081**: Migrar `AdminRepository`
- [x] **T-082**: Migrar `BlockonomicsProvider`

---

## Fase 5: Tests (Semana 2) ✅ COMPLETADO

### 5.1 Unit Tests

- [x] **T-090**: Tests de ConfigService (30 tests unitarios)
- [x] **T-091**: Tests de ConfigRepository (10 tests unitarios)

### 5.2 Integration Tests

- [x] **T-092**: Tests de API (heredados de routes existentes)

### 5.3 Integration Tests (requiere DB + Redis)

- [x] **T-094**: Tests de performance/integration
  - Ubicación: `src/__tests__/services/config.integration.test.ts`
  - Excluido de CI (requiere servicios arriba)

### 5.4 Security Tests

- [x] **T-095**: Tests de seguridad (allowlist validation integrada)

---

## Fase 6: Deploy (Semana 2) ⏳ PENDIENTE

### 6.1 Staging

- [ ] **T-100**: Run migrations en staging
- [ ] **T-101**: Deploy ConfigService
- [ ] **T-102**: Tests de staging

### 6.2 Production

- [ ] **T-110**: Run migrations en production
- [ ] **T-111**: Deploy ConfigService
- [ ] **T-112**: Monitor

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

## Estado Final

**Código implementado:** ✅
- Tabla `app_config` en PostgreSQL
- `ConfigService` con Redis caching
- API routes en `/admin/config`
- Allowlist de 57 keys

**Tests:**
- Unit (CI): 30+ tests pasando
- Integration (local): 6 tests (requiere DB + Redis)

**Pending:**
- Fase 6: Deploy a staging/production (tareas manuales)

---

**Último commit:** `test(config-service): add integration tests + exclude from CI`

**Siguiente SDD:** user-context o concierge-integration

---

## Task: Update Project Documentation

**Depends on**: All tasks complete and verified

### What to do

Update these project documents to reflect that Config Service is implemented:

#### 1. Update reusable-resources.md

Add to Active SDDs Reference section in `docs/project/reusable-resources.md`:
```markdown
- `docs/project/architecture-improvements/sdd/config-service/` — Tiered config with Redis caching
```

Also update Config section to document the Redis caching layer.

#### 2. Update backend/README.md (if exists)

If `backend/README.md` exists, add Config Service API reference section.

### Verification
- [ ] reusable-resources.md includes SDD reference
- [ ] backend/README.md updated (if exists)