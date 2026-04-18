# Estándar de Verificación para PRDs

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Propósito**: Estandarizar las verificaciones obligatorias para todo código nuevo o modificado en el proyecto.

---

## Regla General

> **TODO código nuevo o modificado debe ser verificado y pasar sin errores ni warnings (TypeScript, Lint y Tests). Los aspectos de performance y seguridad también son obligatorios.**

---

## Verificaciones Obligatorias

| # | Verificación | Comando | Criterio | Cuándo |
|---|--------------|---------|----------|--------|
| 1 | TypeScript | `pnpm tsc` | Sin errores | Antes de commit |
| 2 | Lint | `pnpm lint --filter` | Sin errores/warnings | Antes de commit |
| 3 | Tests | `pnpm vitest run` | 100% pasando | Antes de commit |
| 4 | Coverage | `pnpm vitest run --coverage` | >= 80% | En PRs nuevos |
| 5 | Build | `pnpm build` | Sin errores | Antes de deploy |
| 6 | Code Review | `gga run` | Aprobado | Antes de merge |

---

## Verificaciones de Seguridad

| # | Verificación | Descripción |
|---|------------|-------------|
| S1 | SQL Injection | Uso de parameterized queries |
| S2 | Input Validation | Sanitización de inputs de usuario |
| S3 | Auth Checks | Verificar roles antes de acciones |
| S4 | No Secrets | No hardcodear credenciales |
| S5 | Logging | No loggear valores sensibles |
| S6 | Rate Limiting | En endpoints públicos |

---

## Verificaciones de Performance

| # | Verificación | target |
|---|--------------|--------|
| P1 | Latencia de lectura | < 50ms |
| P2 | Latencia de escritura | < 100ms |
| P3 | Cache hit ratio | > 80% |
| P4 | Memory usage | Sin memory leaks |

---

## Commands de Verificación

```bash
# Verificación completa (local)
pnpm tsc && pnpm lint --filter && pnpm vitest run

# Con coverage
pnpm vitest run --coverage

# Code review
gga run

# Build
pnpm build
```

---

## Checklist Pre-Commit

Antes de cada commit, verificar:

- [ ] `pnpm tsc` -> sin errores
- [ ] `pnpm lint --filter` -> sin errores/warnings
- [ ] `pnpm vitest run` -> 100% pasando
- [ ] `gga run` -> aprobado

---

## Checklist Pre-Merge (PR)

Antes de crear un PR, verificar:

- [ ] `pnpm build` -> sin errores
- [ ] Coverage >= 80%
- [ ] Tests pasando en CI
- [ ] Code review aprobado
- [ ] security checks verificados
- [ ] Performance benchmarks verificados

---

## Ubicación en SDD Tasks

Este estándar debe citarse en la sección **Definition of Done** de cada documento SDD:

```markdown
## Definition of Done

Una task se considera completada cuando:
- Código en `main`
- `pnpm tsc` sin errores
- `pnpm lint --filter` sin errores/warnings  
- `pnpm vitest run` 100% pasando
- Code review aprobado (`gga run`)
- Performance verificada
- Security verificado
```

---

## Aplicación a PRDs

Se debe hacer referencia a este documento en los PRDs:

- AI-FEATURES-PRD.md
- CONTENT-SECURITY-PRD.md
- ARCHITECTURE-IMPROVEMENTS-PRD.md

Añadir en la sección de Metodología o en el Roadmap:

> **Todas las tareas de implementación siguen el Estándar de Verificación definido en `docs/project/common/verification-standard.md`**