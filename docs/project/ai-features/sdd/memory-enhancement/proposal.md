# SDD Proposal: Memory Enhancement

**Proyecto**: Crema - Sistema de Memoria AI
**Tipo**: Arquitectura / Enhancement
**Estado**: ✅ COMPLETO
**Fecha**: Abril 2026 (implementado Mayo 2026)
**Owner**: Kike García

> **Recursos Reutilizables**: Ver `docs/project/reusable-resources.md` para módulos existentes.

---

## 1. Resumen Ejecutivo

El sistema actual de memoria de Crema (MemoryService con pgvector) tiene gaps de seguridad y escalabilidad que impiden su uso en producción. Esta propuesta detalla las mejoras para un sistema robusto y seguro.

**Patrón de memoria en Crema**: RAG de contenido de productos (NO conversaciones de chat). El `ai_embeddings` almacena vectores del contenido (lecciones, FAQs, reviews), no de mensajes de usuarios.

---

## 2. Estado Actual

### 2.1 Infraestructura Existente

```
PostgreSQL + pgvector (1536 dimensiones)
Redis (caching, rate limiting, BullMQ)
BullMQ (jobs asíncronos)
```

### 2.2 Schema Actual ai_embeddings

```sql
id, user_id, source_type, source_id, content, embedding, metadata, created_at
```

- `user_id` existe ✅
- UNIQUE constraint en (source_type, source_id) ✅
- Sin índice vectorial eficiente (HNSW) ❌
- NO hay RBAC validation en search ❌

### 2.3 Problemas Identificados

| Problema | Severidad | Descripción |
|----------|-----------|-------------|
| Sin RBAC validation | 🔴 CRITICAL | User puede buscar memorias de productos sin acceso |
| Sin índice vectorial (HNSW) | 🟡 MEDIA | Búsqueda ineficiente con grandes volúmenes |
| Sin política de cleanup | 🟢 BAJA | No hay limpieza automática de registros antiguos |
| Sin quota | 🟢 BAJA | Usuario puede saturar la DB |
| Sin rate limiting específico | 🟢 BAJA | Sin protección contra abuso |

**NO es problema** (a diferencia del SDD original):
- NO hay `session_id` — no aplica al patrón RAG de Crema
- NO hay `memory.store/memory.recall` capabilities — no existen en el código
- NO hay summarization de conversaciones — las conversaciones van en `agent_messages`, no en `ai_embeddings`

---

## 3. Objetivos

| # | Objetivo | Métrica de Éxito |
|---|----------|------------------|
| O1 | RBAC: validar acceso al producto | User solo ve memorias de productos que tiene |
| O2 | Hard delete | Cleanup job borra físicamente registros >30 días |
| O3 | Escalabilidad | Tiempo de búsqueda <100ms con 1M+ embeddings |
| O4 | Per-user quota | LRU eviction cuando >10K embeddings |
| O5 | Rate limiting | Verificar aiLimiter existente (30/min) o ajustar según necesidad |

---

## 4. Alcance (Option C - Completo)

### 4.1 Dentro del Alcance

| Task | Descripción | Prioridad |
|------|------------|----------|
| 1 | Índices de filtering (user_id, created_at) | 🔴 ALTA |
| 2 | RBAC: memory-search valida acceso al producto | 🔴 ALTA |
| 3 | HNSW index | 🟡 MEDIA |
| 4 | Cleanup job (hourly, DELETE >30 días) | 🟡 MEDIA |
| 5 | Per-user quota (10K) + LRU eviction | 🟢 BAJA |
| 6 | Rate limiting (verificar aiLimiter existente) | 🟢 BAJA |

### 4.2 Fuera del Alcance

- `session_id` — no aplica al patrón RAG
- `memory.store/memory.recall` capabilities — no existen en el código
- Summarization de conversaciones — las conversaciones van en `agent_messages`
- `memory_type` — no aplica al patrón RAG de Crema (ya existe `source_type`)
- `is_deleted` / soft delete — hard delete es suficiente; UNIQUE constraint (source_type, source_id) no permite soft delete práctico

---

## 5. Orden de Implementación

```
Semana 1:
  Task 1 (Schema) → Task 2 (RBAC)

Semana 2:
  Task 3 (HNSW) → Task 4 (Cleanup)

Semana 3:
  Task 5 (Quota) → Task 6 (Rate Limiting)

Semana 4:
  Task 7 (Tests) → QA
```

---

## 6. Documentos Relacionados

- PRD: `docs/project/ai-features/AI-FEATURES-PRD.md`
- Documento técnico: `Obsidian Vault/.../Como utilizar Pgvector.md`
- Spec: `spec.md`
- Design: `design.md`
- Tasks: `tasks.md`

---

## 7. Aprobación

| Rol | Nombre | Fecha |
|-----|--------|-------|
| Author | Kike García | Abril 2026 |
| Reviewer | | |
| Approver | | |