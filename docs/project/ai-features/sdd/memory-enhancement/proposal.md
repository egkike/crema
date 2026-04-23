# SDD Proposal: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI  
**Tipo**: Arquitectura / Enhancement  
**Estado**: ✅ DOC COMPLETA (código pending)  
**Fecha**: Abril 2026  
**Owner**: Kike García

---

## 1. Resumen Ejecutivo

El sistema actual de memoria de Crema (MemoryService con pgvector) tiene gaps críticos de seguridad y escalabilidad que impiden su uso en producción con múltiples usuarios. Esta propuesta detalla las mejoras necesarias para lograr un sistema robusto, seguro y escalable.

## 2. Estado Actual del Sistema

### 2.1 Servicios Implementados (Abril 2026)

| Servicio | Descripción | Estado |
|----------|-------------|--------|
| **LLM Service** | Orquestación de múltiples modelos (OpenAI, Ollama, Gemini, Anthropic) | ✅ Produccción |
| **Memory Service** | pgvector para búsqueda semántica (RAG) | ✅ Produccción |
| **Credits Service** | Sistema de créditos para creadores | ✅ Produccción |
| **QA Service** | Auto-respuesta de preguntas | ✅ Produccción |
| **Agents Service** | Orquestación de agentes | ✅ Produccción |
| **Embedding Service** | Generación de embeddings | ✅ Produccción |

### 2.2 Infraestructura Existente

```
PostgreSQL + pgvector (1536 dimensiones)
Redis (caching, rate limiting, BullMQ)
BullMQ (jobs asíncronos)
Scheduler + Worker existente
```

### 2.3 Servicios que Usarán Memoria (Post-Mejora)

| Agente | Actualmente Usa Memoria? | Post-Mejora |
|-------|------------------------|------------|
| **Tutor IA** | ❌ No | ✅ Sí (`retrieveForTutor`) |
| **QA Agent** | ❌ No | ✅ Sí (`retrieve`) |
| **Insights AI** | ❌ No | ✅ Sí (`retrieve`) |
| **Content Producer** | ❌ No | ✅ Sí (`retrieve`) |
| **Orchestrator** | ❌ No | ✅ Sí (`memory.store/recall`) |

### 2.4 Análisis Realizado
- Revisión del documento "Como utilizar Pgvector"
- Análisis de gaps en el código existente
- Judgment Day del PRD (2 rondas)

### 2.5 Problemas Identificados

| Problema | Severidad | Descripción |
|----------|-----------|-------------|
| Sin aislamiento multi-tenant | CRITICAL | Cualquier usuario puede acceder a memorias de otros |
| Sin ownership validation | CRITICAL | memory.store/recall no valida propiedad |
| Summarization borra datos | CRITICAL | Pérdida irreversible de datos originales |
| Jobs sin concurrency limit | WARNING | Colapso con 100K+ usuarios |
| Sin per-user quota | WARNING | Usuario puede saturar la DB |
| IVFFlat lento | MEDIO | Búsqueda ineficiente con grandes volúmenes |

## 3. Objetivos

### 3.1 Objetivo Principal
Transformar el Memory Service de "prototipo funcional" a "sistema de producción robusto" con:
- Aislamiento multi-tenant seguro
- Políticas de gestión de memoria (olvido, summarization, quotas)
- Escalabilidad para 100K+ usuarios concurrentes

### 3.2 Objetivos Específicos

| # | Objetivo | Métrica de Éxito |
|---|----------|------------------|
| O1 | Aislamiento multi-tenant | User A no puede acceder a memorias de User B |
| O2 | Ownership validation | memory.store/recall valida session_id.owner |
| O3 | Soft delete | No se borra ningún dato original |
| O4 | Per-user quota | LRU eviction cuando >10K embeddings por user |
| O5 | Summarization segura | Batch processing, max 10 concurrentes |
| O6 | Escalabilidad | Tiempo de búsqueda <100ms con 1M+ embeddings |

## 4. Alcance

### 4.1 Dentro del Alcance

| Componente | Descripción |
|------------|-------------|
| **Schema ai_embeddings** | Actualizar con user_id, memory_type, is_deleted |
| **Orchestrator capabilities** | Implementar memory.store y memory.recall con RBAC |
| **Index migration** | IVFFlat → HNSW con parámetros optimizados |
| **Cleanup job** | Hourly cleanup con soft delete |
| **Summarization job** | Batch summarization con concurrency limit |
| **Rate limiting** | 100 embeddings/min por user |

### 4.2 Fuera del Alcance

| Componente | Razón |
|------------|-------|
| Encription at rest | Requiere cambios en infraestructura PG |
| Metadata schema formal | Se documenta pero no es blocker |
| Cuantización | Optimización futura, no critical |

### 4.3 Dependencias

- **Crema Memory Service existente** (no se reemplaza, se extiende)
- **Orchestrator SDD** (para capabilities)
- **BullMQ** (jobs existentes)
- **Scheduler/Worker** (scheduling existente)

## 5. Enfoque de Implementación

### 5.1 Estrategia General

**Fase 1 (Quick Wins)**:
1. Agregar user_id a schema
2. Implementar RBAC en capabilities
3. Agregar is_deleted column

**Fase 2 (Core)**:
4. Migrar a HNSW index
5. Implementar cleanup job hourly

**Fase 3 (Advanced)**:
6. Implementar batch summarization
7. Rate limiting
8. Per-user quota

### 5.2 Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|-------|--------------|---------|-------------|
| Migración de índice lenta | ALTA | MEDIO |hacer en off-peak, timeout largo |
| Jobs competiendo por recursos | MEDIA | ALTA | concurrency limit estricto |
| Breaking change en schema | BAJA | ALTO | Backward compatibility, tests exhaustivos |

## 6. Criterios de Éxito

El SDD se considera exitoso cuando:

1. **Security**: Ningún user puede acceder a memorias de otro (probado con tests)
2. **Data Integrity**: Nunca se borran datos originales (soft delete only)
3. **Performance**: Búsqueda <100ms con 1M+ embeddings
4. **Scalability**: Sistema estable con 100K+ usuarios concurrentes

## 7. Timeline Sugerido

| Semana | Entregable |
|--------|-------------|
| 1 | Fase 1 completa: Schema + RBAC + is_deleted |
| 2 | Fase 2 completa: HNSW + cleanup job |
| 3-4 | Fase 3 completa: Summarization + quota |
| 5 | Testing y polish |

## 8. Documentos Relacionados

- PRD: `docs/project/ai-features/AI-FEATURES-PRD.md` (Sección 2.4)
- Documento técnico: `Obsidian Vault/.../Como utilizar Pgvector.md`
- SDD dependiente: Orchestrator SDD (para capabilities)

---

## 9. Aprobación

| Rol | Nombre | Fecha | Firma |
|-----|--------|-------|-------|
| Author | Kike García | Abril 2026 | |
| Reviewer | | | |
| Approver | | | |

---

> **Estandar de Verificación**: Voir `docs/project/common/verification-standard.md`

** Próximo paso: Generar spec.md con requisitos funcionales y no funcionales **