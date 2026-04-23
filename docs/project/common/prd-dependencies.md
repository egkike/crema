# Dependencias Cruzadas entre PRDs

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Propósito**: Mapear las dependencias entre los 3 PRDs del proyecto.

---

## Mapa de Dependencias

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURE-PRD (v2.0)                              │
│                         Base: ConfigService, Orchestrator, Memory            │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
┌────────────────────────────────┐     ┌────────────────────────────────┐
│   AI-FEATURES-PRD (v3.0)       │     │  CONTENT-SECURITY-PRD (v2.0)  │
│   Features: Tutor, Chat, Tools   │     │  Validaciones: Upload, Content │
└────────────────────────────────┘     └────────────────────────────────┘
```

---

## Tabla de Dependencias

### AI-FEATURES-PRD → ARCHITECTURE-PRD

| Feature AI | Dependencia Architecture | Tipo | Importancia |
|------------|--------------------------|------|--------------|
| **Tutor IA** | Memory Service / pgvector | Requerido | ALTA |
| **Conversational Reader** | Memory Service + pgvector | Requerido | ALTA |
| **Smart Chapters** | Transcription Service | Requerido | ALTA |
| **Personalized Learning Path** | User Context Memory | Requerido | ALTA |
| **Book Highlights** | User Context Memory | Requerido | ALTA |
| **Audio Notes** | Transcription Service + User Context | Requerido | ALTA |
| **AI Summary** | Transcription Service + User Context | Requerido | ALTA |
| **Transcript Search** | Transcription Service + pgvector | Requerido | ALTA |
| **AI Insights** | Analytics DB | Requerido | MEDIA |
| **Sentiment Analytics** | Reviews DB | Requerido | MEDIA |
| **Predictive Analytics** | pgvector + AI Insights | Requerido | MEDIA |
| **Content Moderation** | AI Content Assistant | Requerido | MEDIA |

### AI-FEATURES-PRD → CONTENT-SECURITY-PRD

| Feature AI | Validación Requerida | Sección CS-PRD |
|------------|---------------------|------------------|
| **Book Highlights** | Notas de usuario | 10.1 |
| **Audio Notes** | Notas con timestamp | 10.3 |
| **AI Summary** | Generación de resumen | 10.2 |
| **Transcripción** | Contenido subido por creador | 2.x (validaciones existentes) |
| **Content Moderation** | Moderación de contenido | 10.x |
| **Upload de productos** | Validaciones de upload | 2.1 |

---

## Timeline de Dependencias

### ARCHITECTURE-PRD (Fases)

| Fase | Semanas | Entregable |
|------|:-------:|------------|
| Fase 1 | 1-2 | ConfigService |
| Fase 2 | 3-5 | Orchestrator + Skills |
| Fase 3 | 6-7 | Error Handler |
| Fase 4 | 8-10 | Integración Concierge |
| Fase 5 | 20-24 | User Context Memory |

### AI-FEATURES-PRD (Fases)

| Fase | Semanas | Entregable |
|------|:-------:|------------|
| Fase 1 | 1-8 | Credits + Dashboard |
| Fase 2 | 9-16 | Creador Tools |
| Fase 3 | 17-24 | Learning AI |
| Fase 4 | 25-32 | Advanced AI |
| Fase 5 | 33-40 | Experiencia Comprador |
| Fase 6 | 41-48 | Admin Tools |

### CONTENT-SECURITY-PRD (Fases)

| Fase | Semanas | Entregable |
|------|:-------:|------------|
| Fase 1 | 1-4 | Blindaje Técnico |
| Fase 2 | 5-8 | Moderación AI |
| Fase 3 | 9-12 | Gestión Copyright |

---

## Orden de Implementación Recomendado

1. **Primero**: ARCHITECTURE Fase 1-4 (Semanas 1-10)
   - ConfigService (base)
   - Orchestrator y Skills
   - Error Handler

2. **Segundo**: CONTENT-SECURITY Fase 1 (Semanas 1-4)
   - Validaciones básicas de upload

3. **Tercero**: AI-FEATURES Fases 1-2 (Semanas 1-16)
   - Credits, herramientas para creador
   - Estas no requieren User Context

4. **Cuarto**: ARCHITECTURE Fase 5 (Semanas 20-24)
   - User Context Memory

5. **Quinto**: AI-FEATURES Fase 3-5 (Semanas 17-40)
   - Learning AI, Experiencia Comprador

6. **Sexto**: AI-FEATURES Fase 6 + CONTENT-SECURITY Fase 2-3
   - Admin Tools, Moderación AI

---

## Conflictos de Timeline Identificados

| Conflicto | Descripción | Solución |
|-----------|------------|----------|
| ARCH AI-Fase5 vs AI-FEATURES-Fase3 | User Context vs Learning AI overlap (Sem 20-24) | **IMPLEMENTAR EN ORDEN**: Architecture Primero → Feature |
| CONTENT-SECURITY vs AI-FEATURES | Las validaciones deben estar antes de las features | **VALIDACIONES FIRST**: Content Security Fase 1 antes de AI-FEATURES |

---

## Referencias a PRDs

| PRD | Archivo | Versión |
|-----|---------|--------|
| AI-FEATURES | `docs/project/ai-features/AI-FEATURES-PRD.md` | v3.1 |
| ARCHITECTURE | `docs/project/architecture-improvements/PRD.md` | v3.1 |
| CONTENT-SECURITY | `docs/project/content-security/PRD.md` | v2.1 |

---

## Regla de Oro

> **Siempre implementar las dependencias de Arquitectura antes de las features de AI-FEATURES, y las validaciones de CONTENT-SECURITY antes del contenido interactivo.**