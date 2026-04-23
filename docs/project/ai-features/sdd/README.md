# SDD - AI Features

## Estado de Documentación SDD

### Completed ( ✅ y 🟡):

| SDD | proposal | spec | design | tasks | Estado PRD |
|-----|:--------:|:----:|:------:|:-----:|------------|
| memory-enhancement | ✅ | ✅ | ✅ | ✅ | ❌ Pendiente |

### Pending ( ❌ ):

| SDD | proposal | spec | design | tasks | Estado PRD |
|-----|:--------:|:----:|:------:|:-----:|------------|
| [otros cambios AI] | ❌ | ❌ | ❌ | ❌ | ❌ Pendiente |

---

## Estado de PRDs

- **architecture-improvements PRD**: Fases 1-2 completadas, 3-5 pending
- **AI-FEATURES PRD**: Servicios existen, integración pendiente

---

## Dependencias entre PRDs

| architecture-improvements | AI-FEATURES |
|------------------------|------------|
| Orchestrator | usa capabilities |
| ConfigService | usa configs |
| User Context | integra con memoria |
| Error Handling | usa en todos |

---

## Cómo usar

Para crear un nuevo SDD:

```bash
# crear estructura de directorios
mkdir -p sdd/{change-name}
touch sdd/{change-name}/proposal.md
touch sdd/{change-name}/spec.md  
touch sdd/{change-name}/design.md
touch sdd/{change-name}/tasks.md
```

Ver también: `../../common/verification-standard.md`