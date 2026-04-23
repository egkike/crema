# SDD Design: Integration

**Proyecto**: Crema - Mejoras de Arquitectura  
**Tipo**: Arquitectura  
**SDD Phase**: Design  
**Estado**: ✅ DOC COMPLETA  
**Depends on**: spec.md

---

## 1. Resumen del Diseño

Integrar Concierge con las capas de arquitectura.

---

## 2. Arquitectura

### 2.1 Flujo Propuesto

```
[Usuario] → [Concierge Route] → [Concierge Agent]
                │                    │
                ▼                    ▼
         [ConfigService]    [Orchestrator]
                │                    │
                │                    ▼
                │            [Skills: llm.chat, memory.recall]
                │                    │
                ▼                    ▼
         [User Context] ←──→ [Memory Service]
                                       │
                                       ▼
                                 [PostgreSQL]
```

### 2.2 Cambios en Concierge

```typescript
// Antes: hardcoded config
const TIMEOUT = 30000;

// Después: de ConfigService
const TIMEOUT = configService.getNumber('support.timeout_ms', 30000);
```

---

## 3. Data Model

No hay nuevas tablas.

---

## 4. API Design

No hay nuevos endpoints.

---

## 5. Integración

### 5.1 Skills a Registrar

| Skill | Handler |
|-------|---------|
| concierge.chat | Concierge agent existente |
| memory.context | User Context |

### 5.2 Servicios Existentes

- ConfigService
- Orchestrator
- Memory Service

---

## 6. Estado

**Estado**: DRAFT