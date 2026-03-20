# Guía de Contribuciones

## Workflow de Git

Este proyecto sigue un flujo de trabajo de Git basado en trunk-based development con feature branches.

```
master (production-ready)
    │
    └── feature/nueva-funcionalidad
             │
             ├── develop & test locally
             ├── push to origin
             ├── PR to master
             ├── CI passes
             └── merge
```

---

## Reglas de Branching

### Nombres de Ramas

| Tipo | Prefijo | Ejemplo |
|------|---------|---------|
| Feature | `feature/` | `feature/agregar-pagos` |
| Bugfix | `fix/` | `fix/error-login` |
| Hotfix | `hotfix/` | `hotfix/security-patch` |
| Refactor | `refactor/` | `refactor/auth-service` |
| Docs | `docs/` | `docs/readme-update` |

### Reglas

1. **Nunca** hacer push directo a `master`
2. **Siempre** crear una rama desde `master`
3. **Mantener** las ramas pequeñas y enfocadas
4. **Eliminar** ramas después del merge

---

## Commits

### Conventional Commits

Usamos el formato de commits convencionales para integración con Release-Please:

```
<tipo>(<alcance>): <descripción>

[body]

[footer]
```

### Tipos (Monorepo)

| Tipo | Descripción | Version Bump |
|------|-------------|--------------|
| `feat` | Nueva funcionalidad | **Minor** |
| `fix` | Bug fix | **Patch** |
| `perf` | Mejora de performance | **Patch** |
| `feat!` | Breaking change | **Major** |
| `docs` | Documentación | No release |
| `style` | Formateo | No release |
| `refactor` | Refactorización | No release |
| `test` | Tests | No release |
| `chore` | Mantenimiento | No release |

### Alcances por Paquete

| Paquete | Scope | Ejemplo |
|---------|-------|---------|
| Backend | `backend` | `feat(backend): agregar login con Google` |
| Frontend Main | `frontend-main` | `fix(frontend-main): corregir botón de logout` |
| Frontend Admin | `frontend-admin` | `feat(frontend-admin): agregar dashboard` |

### Ejemplos

```bash
# Backend - Nueva funcionalidad
git commit -m "feat(backend): agregar endpoint de métricas"

# Backend - Bugfix  
git commit -m "fix(backend): corregir validación de webhook de MP"

# Frontend Main - Feature
git commit -m "feat(frontend-main): agregar página de checkout"

# Frontend Admin - Fix
git commit -m "fix(frontend-admin): corregir tabla de payouts"

# Breaking change
git commit -m "feat(backend)!: cambiar formato de JWT"
```

### Reglas

- Usar tiempo presente: "agregar" no "agregado"
- Máximo 72 caracteres en el título
- Body es opcional, pero detallado si es complejo
- Referenciar issues si aplica: `Closes #123`

---

## Pull Requests

### Crear un PR

1. **Push** tu rama a origin:
   ```bash
   git push -u origin feature/mi-nueva-funcionalidad
   ```

2. **Abre** un Pull Request en GitHub

3. **Llena** el template de PR:

```markdown
## Descripción
Breve descripción del cambio

## Tipo de Cambio
- [ ] Feature
- [ ] Bugfix
- [ ] Refactor
- [ ] Docs

## Cómo Testear
Pasos para probar el cambio

## Checklist
- [ ] Tests pasan
- [ ] Lint pasa
- [ ] typecheck pasa
```

### Revisión de Código

1. **Asigna** reviewers
2. **Responde** a los comentarios
3. **Hace** cambios si es necesario
4. **No** hacer force push después de approve

### Merge

- **Squash and merge** preferido para features
- **Rebase** para actualizar con master
- **Delete** la rama después de merge

---

## Proceso de Desarrollo

### 1. Fetch y Checkout

```bash
git fetch origin
git checkout -b feature/mi-feature origin/master
```

### 2. Trabajo

```bash
# Hacer cambios
git add .
git commit -m "feat: mi nuevo feature"
```

### 3. Mantener Actualizado

```bash
# Opción A: Rebase (recomendado para ramas pequeñas)
git fetch origin
git rebase origin/master

# Opción B: Merge (si hay conflictos complejos)
git fetch origin
git merge origin/master
```

### 4. Push y PR

```bash
git push -u origin feature/mi-feature
# Crear PR en GitHub
```

### 5. Después del Merge

```bash
git checkout master
git pull origin master
git branch -d feature/mi-feature
```

---

## Calidad de Código (Pre-flight)

Antes de hacer push, siempre ejecutar:

```bash
# 1. Tests
pnpm test

# 2. Lint
pnpm lint

# 3. TypeScript
pnpm typecheck

# 4. Build
pnpm build
```

---

## Deploy (Producción)

El deploy se realiza automáticamente a través de Railway cuando se hace merge a `main`.

### Plataforma

- **Hosting**: Railway (PaaS)
- **Database**: PostgreSQL (managed)
- **Cache**: Redis (managed)
- **Deploy**: Automático desde GitHub

### Configuración

Ver [Estrategia de Deploy](./deploy-strategy.md) para más detalles.

### Environments

| Environment | Branch | URL |
|-------------|--------|-----|
| Producción | `main` | api.tu-dominio.com |
| Staging | `develop` (futuro) | staging.tu-dominio.com |

---

## Versionado y Releases

### Sistema de Versionado

El proyecto usa [SemVer](https://semver.org/):

```
MAJOR.MINOR.PATCH
1.0.0
 ↑  ↑  ↑
 │  │  └── Patch: bug fixes
 │  └────── Minor: nuevas funcionalidades
 └───────── Major: breaking changes
```

### Release Automático (Release-Please)

El proyecto usa [Release-Please](https://github.com/googleapis/release-please) para automatizar releases:

- Se ejecuta en cada push a `master`
- Genera `CHANGELOG.md` automáticamente
- Crea GitHub Releases
- Bump de versión según conventional commits

### Workflow de Release

```
Push a master
    │
    ▼
Release-Please detecta commits
    │
    ├── feat: → minor bump
    ├── fix: → patch bump
    └── feat!: → major bump
    │
    ▼
Genera CHANGELOG.md + GitHub Release
```

### Archivos de Configuración

| Archivo | Propósito |
|---------|-----------|
| `.release-please-config.json` | Config de paquetes y behavior |
| `.release-please-manifest.json` | Versiones actuales de cada paquete |

### Paquetes Versionados

| Paquete | Nombre npm | Versión Inicial |
|---------|------------|-----------------|
| `backend` | `crema-backend` | 1.0.0 |
| `frontend-main` | `crema-app-public` | 0.1.0 |
| `frontend-admin` | `crema-admin-panel` | 0.1.0 |

---

## Issues

### Crear un Issue

1. **Buscar** si ya existe
2. **Usar** el template correspondiente
3. **Ser** específico y dar ejemplos
4. **Adjuntar** logs si es un bug

### Templates

- **Bug Report**: Pasos para reproducir, expected vs actual
- **Feature Request**: Descripción, justificación, alternativas
- **Question**: Pregunta, contexto

---

## Código de Conducta

### Respeto

- Ser amable y profesional
- Aceptar crítica constructiva
- Enfocarse en lo técnico, no personal

### Inclusión

- Bienvenidas todas las contribuciones
- No discriminación por género, orientación, edad, etc.

### Comunicación

- Usar lenguaje claro
- Explicar el "por qué", no solo el "qué"

---

## Recursos

- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)

---

## Ver También

- [Setup Local](./setup.md)
- [Guía de Estilo](./style-guide.md)
