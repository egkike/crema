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

Usamos el formato de commits convencionales:

```
<tipo>(<alcance>): <descripción>

[body]

[footer]
```

### Tipos

| Tipo | Descripción |
|------|-------------|
| `feat` | Nueva funcionalidad |
| `fix` | Bug fix |
| `docs` | Documentación |
| `style` | Formateo (sin cambio de lógica) |
| `refactor` | Refactorización |
| `test` | Tests |
| `chore` | Mantenimiento general |

### Ejemplos

```bash
# Feature
git commit -m "feat(auth): agregar login con Google"

# Bugfix
git commit -m "fix(payments): corregir error en webhook de MP"

# Docs
git commit -m "docs: actualizar README con nuevas instrucciones"
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

## Estructura de Commits en este Proyecto

### Formato por Paquete

Agregar prefijo del paquete afectado:

```
[<paquete>] <tipo>: descripción
```

Ejemplos:
```
[api-auth] feat: agregar login con 2FA
[payments] fix: corregir webhook de MP
[lms] refactor: mejorar query de progreso
[backend] docs: actualizar README
```

### Paquetes del Monorepo

| Paquete | Descripción |
|---------|-------------|
| `backend` | API REST |
| `frontend` | Interfaz (próximamente) |

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
