# Product Requirements Document (PRD)
## Crema - Ecosistema de Funcionalidades AI

**Versión**: 3.8
**Fecha**: Junio 2026
**Estado**:
- ✅ Backend Services (18 servicios)
- ✅ Orchestrator registration (18 capabilities)
- ✅ Memory Enhancement SDD: COMPLETO (Tasks M-1 a M-7)
- ✅ Interactive Agent SDD: COMPLETO (Tasks 1-11)
- ✅ Reports Agent: Implementado con triage IA
- ✅ AI Content Assistant: COMPLETO (ContentAssistant, ContentReader, QuizGenerator, Transcription)
- ✅ AI Support Chatbot (Concierge core): COMPLETO
- ✅ Credit Management Dashboard: COMPLETO
- ✅ AI Affiliate Chat: COMPLETO (Tasks 1-7)
- ✅ SEO Optimizer: COMPLETO (Tasks 0-7)
- 🆕 Features pendientes: §4.3-§4.7, §4.11, §4.13-§4.15, §4.17-§4.18, §4.20 (12 features) + ⚠️ Parciales: §4.19 - Roadmap priorizado
**Owner**: Kike García

> **📦 Migración a openspec (2026-06-03)**: 7 SDDs de features ✅ de este PRD vivían en `docs/project/ai-features/sdd/<name>/` (workflow anterior a openspec) y fueron migrados a `openspec/changes/archive/2026-06-03-<name>/`. Los originales fueron eliminados — openspec es la **única fuente canónica** de SDDs a partir de esta fecha. Los 4 sin verify formal (**ai-content-assistant, memory-enhancement, interactive-agent, reports-agent**) completaron el ciclo de planificación (proposal → spec → design → tasks); la verificación se realizó vía code review + test suite del PR de merge. Los 3 con verify formal (**ai-affiliate-chat, ai-insights-expansion, seo-optimizer**) pasaron por sdd-archive completo. No hay tareas pendientes asociadas a esta migración.

> **Dependencias**:
> - Orchestrator, Config, User Context: ver **architecture-improvements PRD**
> - Memory Enhancement (RAG + HNSW): ver **architecture-improvements PRD** sección 4.4

> **🎯 Jerarquía de Documentos AI**:
> - **Este doc (PRD.md)**: Catálogo maestro de features — qué existe, estados, user stories, acceso por rol
> - **TECHNICAL-SPEC.md**: Especificación técnica — cómo se implementa, archivos, tablas, APIs
> - **feasibility-analysis.md**: Análisis de viabilidad — priorización, scores, costo/beneficio
>
> Las features implementadas incluyen referencia a su especificación técnica en PRD.md

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Estado Actual del Ecosistema AI](#2-estado-actual-del-ecosistema-ai)
   - [2.4 Memory Enhancement](#24-memory-enhancement-mejoras-planificadas)
3. [Arquitectura del Ecosistema AI](#3-arquitectura-del-ecosistema-ai)
4. [Catálogo de Funcionalidades](#4-catálogo-de-funcionalidades)
   - [4.1 Tutor IA](#41-tutor-ia)
   - [4.2 AI Content Assistant](#42-ai-content-assistant)
   - [4.3 Conversational Reader](#43-conversational-reader)
   - [4.4 Micro-Learning Generator](#44-micro-learning-generator)
   - [4.5 Smart Chapters](#45-smart-chapters)
   - [4.6 Personalized Learning Path](#46-personalized-learning-path)
   - [4.7 AI Content Studio](#47-ai-content-studio)
   - [4.8 AI Insights](#48-ai-insights)
   - [4.9 AI Support Chatbot](#49-ai-support-chatbot)
   - [4.10 AI Afiliate Chat](#410-ai-afiliate-chat)
   - [4.11 Description Generator](#411-description-generator)
   - [4.12 SEO Optimizer](#412-seo-optimizer)
   - [4.13 Certificate PDF Generator](#413-certificate-pdf-generator)
   - [4.14 Sentiment Analytics](#414-sentiment-analytics)
   - [4.15 Advanced DRM](#415-advanced-drm)
   - [4.16 Credit Management Dashboard](#416-credit-management-dashboard)
   - [4.17 Book Highlights](#417-book-highlights)
   - [4.18 Audio Notes](#418-audio-notes)
   - [4.19 AI Summary](#419-ai-summary)
   - [4.20 Transcript Search](#420-transcript-search)
   - [4.21 Interactive Agent](#421-interactive-agent)
   - [4.22 Reports Agent](#422-reports-agent)
   - [4.23 Orchestrator](#423-orchestrator)
   - [4.24 Memory Enhancement](#424-memory-enhancement)
5. [Matriz de Acceso por Rol y Tipo de Producto](#5-matriz-de-acceso-por-rol-y-tipo-de-producto)
6. [Herramientas de Admin](#6-herramientas-de-admin)
7. [Análisis de Viabilidad Económica](#7-análisis-de-viabilidad-económica)
8. [Dependencias con otros PRDs](#8-dependencias-con-otros-prds)
9. [Roadmap de Implementación](#9-roadmap-de-implementación)
10. [Requisitos No Funcionales](#10-requisitos-no-funcionales)
11. [Anexos](#11-anexos)

---

## 1. Resumen Ejecutivo

### 1.0 Visión: De Plataforma de Productos a Plataforma de Experiencia

> **Del Análisis 6**: Crema evoluciona de un simple repositorio de archivos a un **Ecosistema de Valor Aumentado**. Cada usuario, en su rol, vive una experiencia que facilita la realización de sus objetivos.

| Rol | Visión Producto (Hoy) | Visión Experiencia |
|-----|---------------------|---------------------|
| **Creador** | Sube archivos | Director de Producto AI con herramientas de consultoría |
| **Comprador** | Descarga archivos | Estudiante con Mentoría 24/7 |
| **Afiliado** | Comparte links | Partner Tecnológico con tools de venta |
| **Admin** | Controla tickets | Arquitecto de Ecosistema |

Esta visión transforma el modelo de "entregable" al de "copiloto", resolviendo el mayor problema de los infoproductos: la baja tasa de finalización y el bajo ROI.

---

### 1.1 Visión del Ecosistema AI

Crema busca posicionarse como la **plataforma de infoproductos más inteligente de Latam**, donde la IA no es un "extra" sino el núcleo que diferencia la experiencia del creador, comprador y afiliado.

### 1.2 Objetivos Estratégicos

| Objetivo | Métrica |
|----------|---------|
| **Reducir costos de soporte** | 80% de preguntas respondidas por IA |
| **Aumentar conversión** | 15% mejora con herramientas AI para creadores |
| **Retención de compradores** | 20% reducción de churn con rutas personalizadas |
| **Ingresos por créditos** | $5,000 USD/mes (Meses 3-6) |

### 1.3 Fuentes del Documento

- Análisis de mercado para Crema (Obsidian Vault)
- Feasibility Analysis - AI Features 2026
- SDD implementado: AI Content Assistant

---

## 2. Estado Actual del Ecosistema AI

### 2.1 Servicios Backend Implementados (Abril 2026)

| Servicio | Descripción | Estado | Notas |
|----------|-------------|--------|-------|
| **LLM Service** | Orquestación de múltiples modelos (OpenAI, Ollama, Gemini, Anthropic) | ✅ Producción | |
| **Memory Service** | pgvector para búsqueda semántica (RAG) | ✅ Producción | Sin integrar en agentes |
| **Credits Service** | Sistema de créditos para creadores | ✅ Producción | |
| **QA Service** | Auto-respuesta de preguntas | ✅ Producción | |
| **Review Service** | Reviews y ratings | ✅ Producción | |
| **Agents Service** | Orquestación de agentes (QA Agent, Tutor, Insights) | ✅ Producción | Con orchestrator |
| **Embedding Service** | Generación de embeddings | ✅ Producción | |
| **ContentAssistantService** | Análisis de contenido y sugerencias | ✅ Completado | |
| **ContentReaderService** | Lectura y síntesis de contenido | ✅ Completado | |
| **QuizGeneratorService** | Generación de quizzes automáticos | ✅ Completado | |
| **TranscriptionService** | Transcripción de audio/video (Whisper) | ✅ Completado | |
| **Orchestrator Service** | Registro de 18 capabilities | ✅ Producción | |

> **Total: 18 servicios en Orchestrator** (13 registrados recently)

### 2.2 Estado de Integración

> **Problema principal**: Los servicios EXISTEN pero NO están integrados entre sí

| Integración | Estado | Notas |
|-------------|--------|-------|
| Memory → Agentes | ✅ Implementado | M-1: RBAC validation en memory-search |
| Orchestrator → Capabilities | ✅ Completado | 13 servicios registrados |
| IVFFlat → HNSW | ✅ Implementado | M-3: HNSW index en db/init/11-hnsw-index.sql |
| Cleanup jobs | ✅ Implementado | M-4: memory-cleanup job hourly en main.worker.ts |
| Per-user quota + LRU | ✅ Implementado | M-5: Quota 10K con eviction en checkQuotaAndEvict |
| Rate limiting | ✅ Implementado | aiLimiter aplicado a endpoints AI |

> **Memory Enhancement Tasks 1-7**: ✅ TODO COMPLETO

### 2.3 Infraestructura Existente

```
PostgreSQL + pgvector (1536 dimensiones)
Redis (caching, rate limiting, BullMQ)
BullMQ (jobs asíncronos)
Múltiples proveedores LLM configurables
```

### 2.4 Memory Enhancement (Mejoras Planificadas)

> **Estado**: ✅ COMPLETO (SDD Tasks 1-7 implementados y testeados, Mayo 2026)
> **Origen**: Doc "Como utilizar Pgvector" + análisis de gaps actuales + revisión del patrón RAG de Crema

> **Nota importante**: El patrón de memoria de Crema es **RAG de contenido de productos** (lecciones, FAQs, reviews), NO conversaciones de chat. Por eso NO aplica: `session_id`, `memory.store/recall` capabilities, ni summarization de conversaciones.

#### 2.4.1 Gaps Identificados (TODOS CORREGIDOS)

| Gap | Descripción | Estado Actual | Impacto |
|-----|-----------|-------------|-------------|
| **G-1** | Sin RBAC en memory-search | ✅ Corregido | Validación de acceso implementada |
| **G-2** | Sin índice vectorial eficiente (HNSW) | ✅ Corregido | HNSW index creado en 11-hnsw-index.sql |
| **G-3** | No hay política de cleanup | ✅ Corregido | memory-cleanup job hourly en main.worker.ts |
| **G-4** | No hay per-user quota | ✅ Corregido | 10K quota con LRU eviction en checkQuotaAndEvict |
| **G-5** | No hay rate limiting específico | ✅ Corregido | aiLimiter (30/min) en endpoints AI |

> **Nota**: `memory_type` e `is_deleted` (soft delete) NO aplican al patrón RAG de Crema. Se usa hard delete con cleanup job.

#### 2.4.2 Mejoras Planificadas (TODAS COMPLETADAS)

| # | Mejora | Descripción | Prioridad | Estado |
|---|-------|-------------|----------|--------|
| **T1** | **Schema Updates** | HNSW index + índices de filtering | 🔴 ALTA | ✅ |
| **T2** | **RBAC Validation** | memory-search valida acceso al producto | 🔴 ALTA | ✅ |
| **T3** | **HNSW Index** | Índice vectorial eficiente para búsqueda | 🟡 MEDIA | ✅ |
| **T4** | **Cleanup Job** | Hourly: DELETE registros >30 días | 🟡 MEDIA | ✅ |
| **T5** | **Per-User Quota** | LRU eviction cuando >10K embeddings | 🟢 BAJA | ✅ |
| **T6** | **Rate Limiting** | 30 requests/min por usuario | 🟢 BAJA | ✅ |

#### 2.4.3 Servicios que Usarán Memoria (Post-Mejora)

| Agente | Actualmente Usa Memoria? | Post-Mejora |
|-------|------------------------|------------|
| **Tutor IA** | ❌ No | ✅ Sí (busca contexto en ai_embeddings) |
| **QA Agent** | ❌ No | ✅ Sí (busca contexto) |
| **Insights AI** | ❌ No | ✅ Sí (busca contexto) |
| **Content Producer** | ❌ No | ✅ Sí (busca contexto) |

#### 2.4.4 Arquitectura Propuesta (Option C)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENTES AI                            │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │   Tutor    │ │   QA      │ │ Insights  │              │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘              │
│        │             │             │                       │
│        └─────────────┴─────────────┘                       │
│                     ↓                                 │
│         ┌─────────────────────────┐                   │
│         │    Memory Service      │ ←── (existing)      │
│         │  + Capabilities      │ ←── (new)           │
│         └──────────┬──────────┘                    │
│                    ↓                                 │
│         ┌─────────────────────────┐                   │
│         │  Memory Repository     │ ←── (existing)    │
│         │  + HNSW Index         │ ←── (new)         │
│         └──────────┬──────────┘                    │
│                    ↓                                 │
│         ┌─────────────────────────┐                   │
│         │   PostgreSQL + pgvector  │                   │
│         │   (ai_embeddings)     │                   │
│         └─────────────────────────┘                   │
│                                                      │
│         ┌─────────────────────────┐                    │
│         │   BullMQ + Worker       │ ←── (existing!)    │
│         │  memory:cleanup-job    │ ←── (new)           │
└─────────────────────────────────────────────────────────────────┘
```

> **Nota**: Se reutiliza el **Scheduler y Worker existentes** (`queues/scheduler.ts`, `queues/main.worker.ts`). No se crea nueva infraestructura.

#### 2.4.6 Jobs Planificados (BullMQ)

| Job | Frecuencia | Descripción |
|-----|-----------|-------------|
| `memory:cleanup` | hourly | DELETE registros >30 días (hard delete) |

#### 2.4.7 Especificaciones Técnicas

> **Del documento "Como utilizar Pgvector"**

**Índice HNSW:**

```sql
-- Parámetros sugeridos
WITH (m = 16, ef_construction = 64);
```

| Parámetro | Valor | Descripción |
|----------|-------|-------------|
| `m` | 16 (32 para >500K) | Grado de conexión (tamaño del índice) |
| `ef_construction` | 64 | Calidad al construir el índice |
| `ef_search` | 40-100 | Búsqueda runtime (mayor = más preciso pero lento) |

**Tabla ai_embeddings (actualización):**

| Campo | Tipo | Notas |
|-------|------|-------|
| `user_id` | UUID | **OBLIGATORIO** — Aislamiento multi-tenant (ya existe) |
| `metadata` | JSONB | Solo campos definidos, SIN PII |

> **Nota**: `source_type` ya existe y categoriza correctamente (lesson, faq, policy, qa, review, insight, saved_dashboard). No se necesita `memory_type` adicional.

**Access Control (RBAC) para Crema:**

| Capability | Requiere | Validación |
|------------|----------|------------|
| `memory.search` | user_id + sourceTypes | User debe tener acceso al producto |
| Admin query | user_id | Solo datos del propio user |

> **CRITICAL**: memory-search DEBE validar que el user tiene acceso al producto antes de buscar.

**Políticas de gestión:**

| Política | Threshold | Acción |
|----------|-----------|--------|
| **Ventana temporal** | >30 días | DELETE físico (hard delete) |
| **Per-user quota** | >10K embeddings | LRU eviction (borra más antiguos) |
| **Filtrado por relevancia** | K=5 (default) | Solo top-5, max 100 |
| **Rate limiting** | 100 embeddings/min | Por user_id |

**Jobs (BullMQ):**

| Job | Frecuencia | Concurrency | Descripción |
|-----|-----------|--------------|-------------|
| `memory:cleanup` | hourly | 1 | DELETE >30 días + VACUUM |

**Mantenimiento:**

- `VACUUM ANALYZE` semanal en tabla ai_embeddings
- Autovacuum configurado para aggressively reclaim space
- Alarma when user >8K embeddings (80% quota)

#### 2.4.5 SDD Completado e Implementado

> El SDD de Memory Enhancement está completo E IMPLEMENTADO en `openspec/changes/archive/2026-06-03-memory-enhancement/`:
> - `openspec/changes/archive/2026-06-03-memory-enhancement/proposal.md` ✅
> - `openspec/changes/archive/2026-06-03-memory-enhancement/spec.md` ✅
> - `openspec/changes/archive/2026-06-03-memory-enhancement/design.md` ✅
> - `openspec/changes/archive/2026-06-03-memory-enhancement/tasks.md` ✅ (Tasks 1-7 completados + testeados)

> **Pattern**: El SDD está adaptado al patrón RAG de Crema (NO session_id, NO memory.store/recall, NO summarization).

> **Implementación**: Mayo 2026 - Commits 7a4eb85, 1e2d3dd (PR #15 mergeado a master)

---

## 3. Arquitectura del Ecosistema AI

### 3.1 Capas del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Astro/React)                      │
│   Panel Creador | Panel Comprador | Panel Afiliado | Admin      │
├─────────────────────────────────────────────────────────────────┤
│                         API LAYER                               │
│   Controllers: ai-content | tutor | insights | support          │
├─────────────────────────────────────────────────────────────────┤
│                     ORQUESTADOR DE AGENTES                      │
│   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│   │  Tutor   │ │ Analyst  │ │ Marketing│ │ Support  │           │
│   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│        │            │            │            │                 │
│   ┌────┴────────────┴────────────┴────────────┴────┐            │
│   │              SKILLS REGISTRY                   │            │
│   │  get_course_progress | search_product_memory   │            │
│   │  generate_discount_link | get_sales_metrics    │            │
│   │  evaluate_refund_risk | generate_coupon_code   │            │
│   └───────────────────────┬────────────────────────┘            │
├───────────────────────────┼─────────────────────────────────────┤
│                    SERVICIOS CORE                               │
│   ┌────────────┐ ┌─────────────┐ ┌─────────────┐                │
│   │ LLM Service│ │   Memory    │ │  Credits    │                │
│   │ (OpenAI,   │ │  Service    │ │  Service    │                │
│   │ Ollama,    │ │ (pgvector)  │ │             │                │
│   │ Gemini)    │ │             │ │             │                │
│   └────────────┘ └─────────────┘ └─────────────┘                │
├─────────────────────────────────────────────────────────────────┤
│                       DATA LAYER                                │
│   PostgreSQL (datos) + Redis (caché) + BullMQ (jobs)            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Agentes Especializados

| Agente | Objetivo Principal | Usuario Target |
|--------|-------------------|----------------|
| **Tutor de Aprendizaje** | Guiar al alumno, resolver dudas, evaluar conocimientos | Comprador |
| **Analista de Negocios** | Métricas de ventas, tendencias, salud financiera | Creador |
| **Estratega de Marketing** | Copys, ángulos de venta, contenido para redes | Afiliado / Creador |
| **Concierge de Soporte** | Reembolsos (Safe-Guard), problemas de acceso, FAQs | Comprador |
| **Content Producer** | Generar contenido derivados (resumen, quiz, clips) | Creador |

### 3.3 Librería de Skills

| Categoría | Skill | Descripción Técnica |
|-----------|-------|-------------------|
| **Memoria** | `search_semantic_content` | Busca en pgvector fragmentos del producto |
| **Progreso** | `get_user_learning_stats` | Porcentaje de completitud y scores de quizzes |
| **Finanzas** | `get_sales_report` | Agregaciones SQL sobre orders y commissions |
| **Validación** | `evaluate_refund_risk` | Safe-Guard: consumo vs. tiempo de garantía |
| **Marketing** | `get_product_usp` | Extrae Unique Selling Points del contenido |
| **Utilidad** | `generate_coupon_code` | Crea cupón dinámico para cerrar ventas |

---

## 4. Catálogo de Funcionalidades

### 4.1 Tutor IA

#### Descripción
Asistente IA que responde preguntas de estudiantes basadas en el contenido del curso. Usa Crema Memory Service para contexto optimizado.

#### Tipo de Producto
- **Cursos** (Video/Audio)
- **Ebooks** (PDF/Docx)
- **Membresías** (Contenido recurrente)

#### Funcionalidades Principales
- Chat en tiempo real con el contenido del producto
- Historial de conversación por sesión
- Configuración de personalidad del Tutor (nombre, tono)
- Límite de mensajes configurable por plan

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| TUTOR-01 | Estudiante | hacer preguntas sobre el contenido | resolver dudas instantáneamente |
| TUTOR-02 | Estudiante | ver respuestas del Tutor | aprender sin esperar al creador |
| TUTOR-03 | Creador | entrenar el Tutor con mi contenido | ofrecer soporte 24/7 |
| TUTOR-04 | Creador | ver insights de preguntas frecuentes | entender qué confunde a estudiantes |
| TUTOR-05 | Creador | nombrar el Tutor | personalizar la experiencia |

#### Requisitos Técnicos
- Reutiliza `memoryService.retrieveForTutor()`
- Rate limiting por usuario/producto
- Logging de tokens para control de costos

#### Estado
✅ **Implementado** - Requiere optimización de prompts y posibles mejoras

> **Implementación técnica:** Ver PRD.md §3.2 Tutor AI Avanzado + §6 (Estado de Implementación)

---

### 4.2 AI Content Assistant

#### Descripción
AI que asiste al Creador Pro en estructurar contenido y generar evaluaciones. Detecta el tipo de producto automáticamente y adapta la asistencia.

#### Tipo de Producto
Todos los tipos de productos de Crema.

#### Funcionalidades Principales

| Tipo Producto | Asistencia Principal | Output |
|---------------|---------------------|--------|
| **Curso** | Análisis de contenido, estructuración de lecciones | Resumen, temas, esquema |
| **Ebook** | Análisis de capítulos, sugerencias de estructuración | Resumen, estructura propuesta |
| **Podcast** | Análisis de episodio, generación de show notes | Resumen, timestamps, notas |
| **Membresía** | Análisis de contenido recurrente | Plan de contenido mensual |
| **Software** | Análisis de documentación técnica | FAQs, guías de uso |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| AI-CA-01 | Creador | subir un video/large archivo | que la IA analice y sugiera estructura |
| AI-CA-02 | Creador | seleccionar tipo de producto | que la IA adapte el análisis |
| AI-CA-03 | Creador | recibir un resumen ejecutivo | entender el contenido rápidamente |
| AI-CA-04 | Creador | generar un quiz de evaluación | evaluar comprensión de mis alumnos |
| AI-CA-05 | Creador | transcribir audio a texto | tener el contenido en formato texto |

#### Requisitos Técnicos
- Integración con `TranscriptionService` (Whisper)
- `ContentAssistantService`, `ContentReaderService`, `QuizGeneratorService`
- Rate limiting específico por operación

#### Estado
✅ **Implementado** (Fases 1-9 completadas, incluyendo tests) - Phase 8 Testing done (PR #12)

> **Implementación técnica:** Ver PRD.md §2.5 (AI Content Assistant) + SDD `openspec/changes/archive/2026-06-03-ai-content-assistant/`
> - Servicios: `ContentAssistantService`, `ContentReaderService`, `QuizGeneratorService`, `TranscriptionService`
> - Tablas: `product_lessons`, `product_lesson_quizzes`, `ai_transcription_usage`
> - Endpoints: `/api/ai/content/assist`, `/api/ai/quiz/generate`, `/api/ai/transcribe`

---

### 4.3 Conversational Reader

#### Descripción
Permite al usuario hacer preguntas específicas sobre el contenido de un PDF/Ebook. Reutiliza infraestructura pgvector existente.

#### Tipo de Producto
- **Ebooks** (PDF, Docx)
- **Software** (Documentación técnica)

#### Flujo Técnico

```
1. Upload: Creador sube PDF → worker BullMQ
2. Extracción: Texto plano por páginas
3. Chunking: Bloques de ~1000 caracteres con 10% overlap
4. Embedding: text-embedding-3-small (1536 dimensiones)
5. Almacenamiento: Tabla product_memories con vectors

Consulta Usuario:
1. Pregunta → Vector
2. Búsqueda pgvector → Top 3-5 fragmentos
3. LLM + contexto → Respuesta
4. Créditos: descuento del usuario
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| CR-01 | Comprador | hacer preguntas específicas sobre mi ebook | entender mejor el contenido |
| CR-02 | Comprador | que me resuma los capítulos clave | optimizar mi tiempo |
| CR-03 | Creador | ver qué preguntas hacen los compradores | mejorar mi contenido |
| CR-04 | Comprador | tener resumen actionable del ebook | aplicar lo aprendido |

#### Costo Operativo
| Escenario | Costo |
|-----------|-------|
| Ingesta (1 ebook 200 páginas) | ~$0.10 USD (one-time) |
| Consulta (1 pregunta) | ~$0.001 USD |

#### Requisito de Plan
- **Plan Pro**: Incluido
- **Plan Initial**: No disponible

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.4 Micro-Learning Generator

#### Descripción
El creador sube un video largo y la IA genera automáticamente: resumen ejecutivo, mapa mental, 5 "nuggets" (clips cortos) para redes sociales y un quiz de 10 preguntas.

#### Tipo de Producto
- **Cursos** (Video)
- **Podcasts** (Audio)

#### Los 4 Pilares

| Pilar | Descripción | Output |
|-------|-------------|--------|
| **Smart Nuggets** | Fragmentos de 1-3 min con "pepita de oro" | Clips para Reels/TikTok |
| **Resumen Ejecutivo** | PDF con puntos clave + conclusión + esquema | PDF descargable |
| **Mapa Mental** | Código Mermaid renderizado en frontend | Imagen/Diagrama |
| **Quiz de Refuerzo** | 3-10 preguntas por segmento | Evaluación integrada |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| MLG-01 | Creador | subir un video de 1 hora | recibir 5 clips para redes en 5 min |
| MLG-02 | Creador | ver un resumen del video | entender la estructura sin ver todo |
| MLG-03 | Creador | generar un quiz automático | evaluar a mis alumnos |
| MLG-04 | Creador | obtener un mapa mental del contenido | usarlo como recurso visual |
| MLG-05 | Alumno | consumir micro-contenido | aprender en segmentos de 3 min |

#### Costo Operativo
| Operación | Costo Estimado |
|-----------|----------------|
| Transcripción (1 hora video) | $0.10 USD |
| Resumen + Mapa mental | $0.05 USD |
| Quiz (10 preguntas) | $0.02 USD |
| **Total por video** | **~$0.17 USD** |

#### Requisito de Plan
- **Plan Pro**: Incluido (X videos/mes)
- **Plan Initial**: No disponible

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.5 Smart Chapters

#### Descripción
La IA analiza audio/video y crea marcas de tiempo con títulos descriptivos basados en cambios de tema. Genera buscador de frases exacto.

#### Tipo de Producto
- **Podcasts**
- **Audiolibros**
- **Cursos** (Audio)

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Capitulación Automática** | Timestamps con títulos descriptivos por tema |
| **Buscador de Frases** | Usuario busca palabra → va al segundo exacto + muestra transcripción |
| **Social Clips (Nuggets de Audio)** | Fragmentos 30-60s con subtítulos animados para redes |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| SC-01 | Creador | subir un podcast de 2 horas | que se genere la capitulación automática |
| SC-02 | Oyente | buscar "inversión en ETFs" | ir al minuto exacto donde se habla |
| SC-03 | Oyente | ver los capítulos del podcast | navegar rápidamente al tema que me interesa |
| SC-04 | Creador | generar clips para Instagram | promocionar mi episodio |

#### Costo Operativo
| Operación | Costo |
|-----------|-------|
| Capitulación (1 hora audio) | $0.10 USD (Whisper) |
| Generación clips (por clip) | $0.01 USD |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.6 Personalized Learning Path

#### Descripción
Para membresías con contenido extenso, la IA entrevista al usuario y le arma una ruta de consumo personalizada según sus objetivos.

#### Tipo de Producto
- **Membresías**

#### Flujo

```
1. Onboarding: Usuario responde 3-5 preguntas sobre sus objetivos
2. Análisis: IA procesa el contenido de la membresía
3. Generación: Crea ruta personalizada (secuencia de módulos)
4. Seguimiento: Actualiza la ruta según progreso del usuario
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| PLP-01 | Miembro | responder un cuestionario inicial | obtener una ruta de aprendizaje personalizada |
| PLP-02 | Miembro | ver mi progreso en la ruta | saber qué hacer next |
| PLP-03 | Miembro | que la ruta se adapte a mi progreso | mantenerme motivado |
| PLP-04 | Creador | ver qué rutas generan mejor retención | optimizar mi contenido |

#### Costo Operativo
| Operación | Costo |
|-----------|-------|
| Generación ruta inicial | $0.03 USD |
| Actualización por progreso | $0.01 USD |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.7 AI Content Studio

#### Descripción
El creador sube un solo archivo (video o manuscrito) y la IA sugiere cómo empaquetarlo en diferentes productos.

#### Tipo de Producto
Aplica a todos los tipos.

#### Ejemplo de Output
```
"Tu video de 2 horas puede ser:
- 1 Curso de 8 módulos
- 1 E-book resumen de 20 páginas
- 4 Episodios de Podcast
- 10 Posts para redes sociales"
```

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| ACS-01 | Creador | subir un video de 2 horas | ver todas las formas de monetizarlo |
| ACS-02 | Creador | seleccionar qué formatos generar | crear varios productos a la vez |
| ACS-03 | Creador | editar la estructura sugerida | adaptar a mi estrategia |

#### Requisito de Plan
- **Plan Pro**: Incluido
- **Plan Initial**: No disponible

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.8 AI Insights

#### Descripción
Consultas en lenguaje natural sobre métricas de ventas y alumnos. El creador pregunta "¿Por qué bajaron mis ventas?" y la IA analiza los datos.

#### Tipo de Producto
Dashboard analytics para creadores.

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Métricas en lenguaje natural** | Preguntas sobre revenue, conversiones, tendencias |
| **Predicción de churn** | "El alumno X tiene 80% de probabilidad de abandonar" |
| **Generación de email de recuperación** | IA redacta email personalizado basado en progreso |
| **Comparativas** | Este mes vs mes anterior, producto A vs producto B |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| INS-01 | Creador | preguntar "¿por qué bajaron mis ventas?" | entender las causas |
| INS-02 | Creador | ver predicción de ingresos para el próximo mes | planificar |
| INS-03 | Creador | recibir alertas de alumnos en riesgo | recuperar usuarios antes de que abandonen |

#### Estado
✅ **COMPLETO** - InsightsService con dashboards CRUD + NL→SQL query + streaming + expansión de capabilities (predictChurn, generateRecoveryEmail, compareEntities). Ver SDD `ai-insights-expansion` (Tasks 0-5 completadas) y endpoints REST nuevos en §5.

> **Referencia de Implementación** (SDD `ai-insights-expansion`, PRs #32, #33, #35-#41, #43, #44):
> - **DB Migration**: `churn_predictions`, `recovery_emails`, `ab_comparatives` (init script 14)
> - **Service methods**: `predictChurn(userId)`, `generateRecoveryEmail(userId, context)`, `compareEntities(entityA, entityB)`, `sanitizeHtml(html)` en `agents.service.ts`
> - **Orchestrator capabilities**: `ai.insights.predict_churn`, `ai.insights.compare`, `ai.insights.recover_email` registradas en `ai/index.ts` (3 nuevas skills)
> - **REST endpoints**: `POST /api/ai/insights/predict/churn`, `POST /api/ai/insights/compare`, `POST /api/ai/insights/recover/email`
> - **Schemas Zod**: validación de payload en `schemas/ai.schema.ts`
> - **Rate limiters**: `aiInsightsPredict`, `aiInsightsCompare`, `aiInsightsRecover` (dedicados)
> - **Tests**: 39 unit tests + 32 integration tests + 4 orchestrator tests (1414 tests passing)

---

### 4.9 AI Support Chatbot (Concierge de Soporte)

#### Descripción
Chat de soporte técnico con escalación a email. No requiere contexto de producto específico. Es el **Concierge de Soporte** de Crema - un agente IA que resuelve consultas de soporte, problemas de acceso, reembolsos y FAQs.

**Diferencia clave**: El consumo de AI de este chatbot **es pagado por Crema**, no por el usuario. Es un costo operativo de la plataforma.

#### Usuario Target
- **Comprador** (soporte general de la plataforma)
- **Afiliado** (soporte sobre la plataforma)
- **Creador** (soporte sobre su cuenta y productos)

#### Arquitectura de Skills

El Concierge de Soporte utiliza una librería de skills específicos:

| Skill | Función | Descripción |
|-------|---------|-------------|
| `search_faqs` | Buscar | Busca en FAQs existentes de la plataforma |
| `get_order_status` | Consultar | Consulta estado de orden del usuario |
| `get_access_details` | Consultar | Consulta acceso a productos comprados |
| `evaluate_refund_risk` | Evaluar | Safe-Guard: consumo vs tiempo de garantía |
| `escalate_to_human` | Escalar | Deriva a soporte humano |
| `create_support_ticket` | Crear | Crea ticket automático si no puede resolver |
| `get_user_orders` | Consultar | Lista órdenes del usuario |
| `get_subscription_status` | Consultar | Estado de suscripción Pro |
| `get_credit_balance` | Consultar | Saldo de créditos AI |
| `list_refund_history` | Consultar | Historial de refunds |

#### Flujo del Concierge

```
Usuario envía consulta
         ↓
Clasificar intención (orden, acceso, reembolso, crédito, otro)
         ↓
Skill asociado → Buscar / Resolver
         ↓
¿Puede resolver?
  ├── SÍ → Responder + registrar interacción
  └── NO → Escalar a humano
              ↓
        Crear ticket automático
              ↓
        Notificar a Admin
```

#### Casos de Uso

| Query del Usuario | Cómo Responde el Concierge |
|------------------|---------------------------|
| "Cómo me inscribo a un curso?" | FAQ: pasos para comprar |
| "Cuál es mi código de afiliado?" | Resuelve desde perfil del usuario |
| "No puedo iniciar sesión" | Troubleshooting paso a paso |
| "Quiero editar mi producto" | Redirecciona a panel del creador |
| "Cómo funciona el programa de afiliados?" | Explicación del sistema |
| "Por qué no puedo acceder al curso?" | Consulta access_details → resuelve o escala |
| "Quiero pedir reembolso" | Evalúa refund_risk → informa o escala |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| SUP-01 | Usuario | hacer una pregunta de soporte | obtener respuesta inmediata |
| SUP-02 | Usuario | que me deriven a un humano si no pueden ayudar | no perder tiempo |
| SUP-03 | Admin | ver los tickets escalated | resolver casos pendientes |
| SUP-04 | Admin | ver métricas de soporte AI | medir efectividad del chatbot |
| SUP-05 | Admin | ver contenido reportado | moderar la plataforma |

#### Modelo de Costos

| Aspecto | Tratamiento |
|---------|-------------|
| **Consumo de AI** | **Pagado por Crema** (no por el usuario) |
| **Costo tipo** | 'platform' (no 'user') |
| **Categoría** | 'support' (para reportes) |
| **Facturación** | Se registra como costo operativo |

> **Nota**: Esto diferencia al Concierge de Soporte del Tutor IA y otras herramientas AI que **sí** cuestan créditos al usuario.

#### Estado del Concierge en Admin

El Admin tiene paneles específicos para gestionar el soporte:

##### Panel 1: Tickets Escalados
- Lista de tickets que el AI no pudo resolver
- Tiempo de resolución
- Satisfacción del usuario (encuesta post-interacción)

##### Panel 2: Reportes de Soporte AI

| Reporte | Descripción |
|---------|-------------|
| **Volumen de consultas** | Cantidad por día/semana/mes |
| **Tasa de auto-resolución** | % casos resueltos por AI sin escalar |
| **Topics más frecuentes** | Palabras/clusters de consultas |
| **Tiempo promedio de respuesta** | Cuánto tarda el AI en responder |
| **Satisfacción del usuario** | Rating de usuarios después del soporte |

##### Panel 3: Dashboard de Análisis de Contenido (Content Security)

| Feature | Descripción |
|---------|-------------|
| **Denuncias pendientes** | Dashboard de contenido reportado |
| **Contenido violado detectado** | AI detecta y marca contenido |
| **Tendencia de reportes** | Gráfico de reportes por tipo |
| **Acciones tomadas** | Warn, ban, delete, etc. |

##### Panel 4: Herramientas de Moderación AI (Admin)

| Herramienta | Descripción |
|------------|-------------|
| **Auto-clasificador** | Clasifica denuncias por categoría automáticamente |
| **Sugerencia de acción** | AI sugiere qué hacer (warn/ban/delete) |
| **Bulk actions** | Aplicar acción a múltiples casos |

#### Métricas de Éxito

| Métrica | Objetivo |
|---------|----------|
| Tasa de auto-resolución | > 70% |
| Tiempo promedio de respuesta | < 30 segundos |
| Satisfacción del usuario | > 4/5 |
| Tickets escalados por día | < 20% del total |

#### Diferencia con otras herramientas AI

| Herramienta | Usuario paga? | Pagado por |
|------------|:------------:|------------|
| **Tutor IA** | ✅ Sí | Usuario (créditos) |
| **Chat con PDF** | ✅ Sí | Usuario (créditos) |
| **Concierge de Soporte** | ❌ No | **Crema** |
| **Moderación de contenido** | ❌ No | **Crema** |
| **Reportes de Admin** | ❌ No | **Crema** |

#### Estado
✅ **IMPLEMENTADO (core)** - ConciergeService con system prompt configurable, sanitización de input, y defensive framing contra prompt injection. Skills avanzados (search_faqs, get_order_status, evaluate_refund_risk, escalate_to_human, create_support_ticket) pendientes de implementación.

> **Implementación técnica:** Ver PRD.md §6 (Estado de Implementación) - Moderation/ConciergeService
> - Servicio: `ConciergeService` en `services/ai/concierge.service.ts`
> - Endpoint: Registrado como capability `concierge.chat` en Orchestrator

---

### 4.10 AI Afiliate Chat

#### Descripción
Chat de dudas para Afiliados y Compradores sobre productos específicos. Entrenado con el contenido del producto que promocionan.

#### Usuario Target
- **Afiliado** (ventas del producto que promote)
- **Comprador** (dudas post-compra)

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Contexto del producto** | IA conoce el contenido del producto |
| **Ángulos de venta** | "¿Cuáles son las 3 objeciones más comunes?" |
| **Generador de copy** | "Génerame 3 hilos de Twitter para este ebook" |
| **Análisis de audiencia** | "¿La mayoría de tus referidos preguntan por...?" |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| AFC-01 | Afiliado | preguntar sobre el producto que vendo | entenderlo para vender mejor |
| AFC-02 | Afiliado | generar contenido para mis redes | promocionar sin invertir horas |
| AFC-03 | Afiliado | saber qué objeciones resolver | cerrar más ventas |

#### Requisito de Plan
- **Plan Pro**: Incluido
- **Plan Initial**: Requiere créditos

#### Estado
✅ **IMPLEMENTADO** (Tasks 1-7 completados, Mayo 2026)

> **Implementación técnica:** Ver SDD `openspec/changes/archive/2026-06-03-ai-affiliate-chat/`
> - Servicio: `affiliateChatService` en `services/ai/affiliate-chat.service.ts`
> - Endpoint: `POST /api/ai/affiliate/chat`
> - Rate limiter: `affiliateChatLimiter` (configurable via `affiliate_chat.rate_limit`, default 30/min)
> - Capability: `affiliate.chat` registrada en Orchestrator
> - Config keys: `affiliate_chat.temperature`, `affiliate_chat.max_tokens`, `affiliate_chat.model`, `affiliate_chat.system_prompt_product_info`, `affiliate_chat.system_prompt_promo_copy`, `affiliate_chat.rate_limit`
>
> **Implementation Notes:**
> - Credit deduction happens AFTER LLM success only (atomicity guaranteed)
> - `affiliate_metrics` intent returns stub without LLM call — no credits deducted
> - Prompt injection: sanitization warning logged but processing continues (SPEC §7.2 compliant)
> - Tests: 14 unit + 14 integration = 28 total, all passing

---

### 4.11 Description Generator

#### Descripción
Genera título, descripción y tags SEO automáticamente basados en el contenido del producto.

#### Usuario Target
- **Creador**

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Título sugerido** | Alternativas de título atractivas |
| **Descripción** | Descripción completa optimizada para conversión |
| **Tags SEO** | Keywords relevantes para el producto |
| **Meta description** | Para SEO de la landing |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| DG-01 | Creador | subir mi contenido | recibir sugerencia de título |
| DG-02 | Creador | editar la descripción generada | personalizarla a mi marca |
| DG-03 | Creador | obtener tags para SEO | mejorar visibilidad |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.12 SEO Optimizer

#### Descripción
Genera meta tags automáticos para las páginas de productos.

#### Usuario Target
- **Creador**

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Meta title** | Título SEO optimizado |
| **Meta description** | Descripción para SEO |
| **OG Tags** | Open Graph para redes sociales |
| **Schema markup** | Datos estructurados para Rich Snippets |
| **Keywords** | Keywords relevantes para el producto (5-10) |

#### Estado
✅ **IMPLEMENTADO** (Tasks 0-7 completados, Mayo 2026)

> **Implementación técnica:** Ver SDD `openspec/changes/archive/2026-06-03-seo-optimizer/`
> - Servicio: `seoOptimizerService` en `services/ai/seo-optimizer.service.ts`
> - Repositorio: `seoOptimizerRepository` en `repositories/seo-optimizer.repository.ts`
> - Endpoint: `POST /api/ai/product/seo`
> - Rate limiter: `seoOptimizerLimiter` (10 req/min)
> - Capability: `seo.optimizer` registrada en Orchestrator
> - Costo: 1 crédito AI por generación
> - RAG Context: Reutiliza `memoryService.searchSimilar` con sourceTypes ['lesson', 'faq', 'review']
> - Tests: 18 unit + 16 integration = 34 total, all passing

---

### 4.13 Certificate PDF Generator

#### Descripción
Genera PDF de certificado con código QR para verificación de autenticidad.

#### Usuario Target
- **Creador** (genera certificados)
- **Comprador** (recibe certificado)

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **PDF personalizado** | Logo, colores del creador, información del curso |
| **QR de verificación** | Código único que apunta a verification URL |
| **Base de datos de certificados** | Verificación online del certificado |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| CERT-01 | Creador | que se genere un certificado automático | al completar mi curso |
| CERT-02 | Alumno | descargar mi certificado | tener documentación de lo aprendido |
| CERT-03 | Empleador | verificar un certificado | confirmar su autenticidad |

#### Requisito de Plan
- **Todos los planes**: Incluido

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.14 Sentiment Analytics

#### Descripción
IA analiza comentarios y reviews para generar insights accionables para el creador.

#### Usuario Target
- **Creador**

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Análisis de reviews** | Detecta temas positivos/negativos |
| **Tendencias de sentimiento** | Evolución del sentiment en el tiempo |
| **Alertas de problemas** | "3 reviews mencionan 'audio malo' esta semana" |
| **Sugerencias de mejora** | Basado en lo que los usuarios critican |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| SA-01 | Creador | ver un resumen de sentiment de mis reviews | entender cómo me perciben |
| SA-02 | Creador | recibir alertas de problemas recurrentes | actuar rápidamente |
| SA-03 | Creador | ver comparativa de sentiment por producto | saber cuál funciona mejor |

#### Requisito de Plan
- **Plan Pro**: Incluido
- **Plan Initial**: No disponible

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.15 Advanced DRM

#### Descripción
Protección contra piratería con watermarks dinámicos y signed URLs. Nivel intermedio de DRM.

#### Usuario Target
- **Creador** (configura protección)
- **Comprador** (experiencia normal)

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Watermarks dinámicos** | Marca de agua con ID de usuario en video/PDF |
| **Signed URLs** | URLs con expiry automático |
| **Detección de screen recording** | Tecnología de detección de piratería |
| **Bloqueo por geolocalización** | Restringir países específicos |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| DRM-01 | Creador | que mi contenido tenga marca de agua | disuadir la piratería |
| DRM-02 | Creador | configurar países permitidos | cumplir regulaciones |
| DRM-03 | Creador | ver intentos de piratería detectados | tomar acciones |

#### Requisito de Plan
- **Plan Pro**: Incluido
- **Plan Initial**: No disponible

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.16 Credit Management Dashboard

#### Descripción
Panel de gestión de créditos que permite a los usuarios consultar su saldo disponible y ver el historial detallado de transacciones de débito y crédito. Esta feature reduce consultas y reclamos al dar transparencia total sobre el uso de créditos.

#### Usuario Target
- **Creador** (comprador de créditos)
- **Comprador** (comprador de créditos)
- **Afiliado** (comprador de créditos)

#### Funcionalidades

| Feature | Descripción |
|---------|-------------|
| **Saldo Disponible** | Muestra el balance actual de créditos con fecha de expiración |
| **Historial de Transacciones** | Lista de todas las transacciones (compra, uso, bonus, expiración) con filtros |
| **Detalle por Operación** | Cada transacción muestra en qué se usó (Tutor IA, Chat, Transcription, etc.) |
| **Proyección de Expiración** | Alerta cuando los créditos están por vencer (7 días antes) |
| **Filtros por Fecha** | Filtrar transacciones por rango de fechas |
| **Exportación** | Exportar historial a CSV/Excel |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| CRED-01 | Usuario | ver mi saldo de créditos | saber cuántos tengo disponibles |
| CRED-02 | Usuario | ver mis transacciones | saber cómo gasté mis créditos |
| CRED-03 | Usuario | filtrar transacciones por fecha | encontrar una operación específica |
| CRED-04 | Usuario | recibir alerta cuando mis créditos están por expirar | usar mis créditos antes de que venzan |
| CRED-05 | Creador | ver cuánto gasté en transcripciones vs análisis | entender mi consumo de AI |

#### Detalle de Transacciones

Cada transacción debe incluir:

| Campo | Descripción |
|-------|-------------|
| **Fecha** | Timestamp de la transacción |
| **Tipo** | `credit` (compra/bonus) / `debit` (uso) / `expired` (vencimiento) |
| **Cantidad** | Número de créditos (+ o -) |
| **Descripción** | Descripción legible (ej: "Compra: Paquete 100 créditos") |
| **Operación** | En qué se usó (ej: "Tutor IA - Curso de Python", "Transcripción - Lección 3") |
| **Producto** | ID del producto relacionado (si aplica) |
| **Expiry** | Fecha de vencimiento de esos créditos |

#### Requisitos Técnicos
- Reutiliza `CreditsService.getBalance()` existente
- Reutiliza `CreditsService.getTransactions()` existente
- Agregar campo `operation_details` a la respuesta de transacciones
- Sistema de notificaciones para créditos por expirar (email/in-app)

#### Estado
🆕 **MEJORA** - Requiere desarrollo (backend existe, mejorar frontend y agregar features)

---

### 4.17 Book Highlights

#### Descripción
Permite al comprador subrayar texto y agregar notas en los ebooks/PDFs comprados. Las notas se guardan y pueden exportarse.

#### Tipo de Producto
- **Ebooks** (PDF/Docx)
- **Software** (Documentación técnica)

#### Funcionalidades Principales
- Subrayar texto con colores
- Agregar notas en el margen
- Marcar páginas importantes
- Exportar notas (.md, .pdf)

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| BH-01 | Comprador | subrayar un pasaje importante | marcarlo para futura referencia |
| BH-02 | Comprador | agregar una nota en un pasaje | explicar mi pensamiento |
| BH-03 | Comprador | exportar mis notas | estudiarlas offline |
| BH-04 | Comprador | ver mis highlights anteriores | recordar lo importante |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.18 Audio Notes

#### Descripción
Permite al comprador agregar notas ancladas a timestamps específicos en audio/podcasts. Las notas se sincronizan con el reproductor.

#### Tipo de Producto
- **Podcast** (Audio)
- **Video/Curso** (Audio)

#### Funcionalidades Principales
- Agregar nota en timestamp específico
- Sincronización nota ↔︎ reproductor
- Exportar transcripción con notas
- Buscar notas por tiempo

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| AN-01 | Comprador | agregar una nota en el minuto 5:30 | recordar lo que pensé allí |
| AN-02 | Comprador | tocar la nota y que el audio salte a ese momento | escuchar desde esa parte |
| AN-03 | Comprador | ver todas mis notas del audio | tener visión general |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.19 AI Summary

#### Descripción
Genera un resumen ejecut IA del contenido (ebook, podcast, video) descargable en formato .md o .pdf.

#### Tipo de Producto
- **Ebook/PDF**
- **Podcast**
- **Video/Curso**

#### Funcionalidades Principales
- Resumen ejecutivo (1 página)
- Puntos clave
- Action items
- Exportar .md / .pdf

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| SUM-01 | Comprador | recibir un resumen del ebook | saber si vale la pena leerlo completo |
| SUM-02 | Comprador | tener los puntos clave offline | estudiarlos después |
| SUM-03 | Comprador | exportar el resumen | compartirlo o guardarlo |

#### Estado
⚠️ **PARCIAL** - Reutiliza ContentAssistantService con `analysisType: 'summary'` (endpoint `/api/ai/content/assist`). No es feature standalone dedicada.

---

### 4.20 Transcript Search

#### Descripción
Búsqueda semántica en transcripciones de audio/podcasts. "Buscar dónde menciona X tema en el podcast".

#### Tipo de Producto
- **Podcast**
- **Video/Curso**

#### Funcionalidades Principales
- Búsqueda por palabras clave
- Resultados con timestamp
- Reproducir desde resultado
- Exportar fragmentos

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| TS-01 | Comprador | buscar "marketing digital" en el audio | encontrar ese momento |
| TS-02 | Comprador | tocar el resultado y que reproduzca desde ahí | escuchar la parte relevante |
| TS-03 | Comprador | exportar los fragmentos encontrados | tener las citas |

#### Estado
🆕 **NUEVO** - Requiere desarrollo

---

### 4.21 Interactive Agent

#### Descripción
Talleres dinámicos que permiten al comprador cargar sus datos específicos (caso práctico) en cada módulo y recibir análisis personalizado de la IA basado en SU realidad. Transforma cursos pasivos en herramientas de implementación.

> **Ejemplo:** Curso "Cómo montar una cafetería"
> - Módulo 1: El alumno carga su ubicación, costo de alquiler
> - Módulo 2: La IA analiza y le da su punto de equilibrio personalizado
> - Al final: Tiene su **Business Plan listo**, no solo un certificado

#### Tipo de Producto
- **Cursos** (variable input → análisis personalizado)
- **Ebooks** (ejercicios interactivos)
- **Membresías** (plan personalizado según objetivos)
- **Software** (configuración guiada)

#### Funcionalidades Principales

| Funcionalidad | Descripción |
|---------------|-------------|
| **Field Configuration** | El creador define campos requeridos por módulo (number, string, boolean, select) |
| **User Data Collection** | El comprador ingresa sus datos específicos |
| **AI Analysis** | La IA genera análisis personalizado basado en los datos del usuario |
| **Progress Tracking** | Centro de control con módulos completados |
| **Creator Analytics** | Dashboard agregado (anonimizado) con tendencias de los alumnos |

#### Modelo de Datos

```sql
-- Tabla: datos del usuario por producto/módulo
CREATE TABLE user_course_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    product_id UUID NOT NULL REFERENCES products(id),
    module_key VARCHAR(100) NOT NULL,
    input_data JSONB NOT NULL DEFAULT '{}',
    output_analysis JSONB,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id, module_key)
);

-- Tabla: configuración de campos por módulo
CREATE TABLE product_module_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    module_key VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('number', 'string', 'boolean', 'select')),
    field_label VARCHAR(200) NOT NULL,
    field_placeholder VARCHAR(500),
    field_options JSONB,
    field_required BOOLEAN DEFAULT FALSE,
    field_validation JSONB,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
```

#### API Endpoints

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| POST | `/api/interactive/fields/:productId` | Crear campos de módulo | Creador |
| GET | `/api/interactive/fields/:productId` | Obtener campos | JWT (owner/buyer) |
| POST | `/api/interactive/data/:productId` | Guardar datos (1 crédito) | JWT (buyer) |
| PUT | `/api/interactive/data/:productId/:moduleKey` | Actualizar datos | JWT (buyer) |
| GET | `/api/interactive/data/:productId` | Obtener mis datos | JWT (buyer) |
| POST | `/api/interactive/analyze/:productId/:moduleKey` | Solicitar análisis (3 créditos) | JWT (buyer) |
| GET | `/api/interactive/analytics/:productId` | Analytics agregados | Creador |

#### Seguridad

| Aspecto | Implementación |
|---------|---------------|
| **Input Validation** | Schema Zod con regex `^[a-z0-9_]+$` para moduleKey |
| **Límites** | input_data: 50KB, output_analysis: 1MB, campos: 50/módulo |
| **Rate Limiting** | `interactiveAgentLimiter`: 10 req/min por usuario |
| **Authorization** | Owner del producto o buyer con orden activa |

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| INT-01 | Comprador | cargar mis datos en cada módulo | el sistema guarde mis progresos |
| INT-02 | Comprador | recibir análisis personalizado | la IA responda basado en MIS datos, no genérico |
| INT-03 | Comprador | ver mi progreso en el "Centro de Control" | dashboard con módulos completados |
| INT-04 | Creador | configurar qué datos se piden | definir campos requeridos por módulo |
| INT-05 | Creador | ver los datos de mis alumnos | dashboard agregado (anonimizado) |

#### Estado
✅ **IMPLEMENTADO** (SDD completo, Mayo 2026) - Phase 11

> **Implementación técnica:** Ver PRD.md §2.5 Agente de Implementación Interactiva + SDD `openspec/changes/archive/2026-06-03-interactive-agent/`
> - Servicio: `InteractiveAgentService` en `services/ai/interactive-agent.service.ts`
> - Repository: `interactive-agent.repository.ts` con Advisory Lock pattern
> - Tablas: `user_course_data`, `product_module_fields`
> - Endpoints: `/api/interactive/fields/:productId`, `/api/interactive/data/:productId`, `/api/interactive/analyze/:productId/:moduleKey`
> - Rate limiter: `interactiveAgentLimiter` (10 req/min)

---

### 4.22 Reports Agent

#### Descripción
Sistema de denuncias y moderación de contenido con triage automático por IA. Permite a cualquier usuario reportar contenido inapropiado y al admin gestionar las denuncias con herramientas de clasificación.

#### Arquitectura de Skills

| Skill | Función | Descripción |
|-------|---------|-------------|
| `reports.create` | Crear denuncia | Usuario crea report de contenido |
| `reports.list` | Admin lista | Admin ve todas las denuncias |
| `reports.triage` | Clasificación IA | Evalúa severidad y sugiere acción |

#### Modelo de Datos

```sql
CREATE TABLE report_reasons (
    id UUID PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL, -- 'product' | 'review' | 'comment'
    code VARCHAR(50) NOT NULL UNIQUE,
    label VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium',
    auto_triage BOOLEAN DEFAULT FALSE
);

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    content_type VARCHAR(20) NOT NULL,
    content_id UUID NOT NULL,
    reason_code VARCHAR(50) NOT NULL REFERENCES report_reasons(code),
    description TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    admin_id UUID REFERENCES users(id),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    metadata JSONB,
    is_active BOOLEAN DEFAULT TRUE
);
```

#### API Endpoints

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/ai/reports/reasons` | Lista de motivos | Público |
| POST | `/api/ai/reports` | Crear denuncia | JWT |
| GET | `/api/ai/reports` | Listar reportes | Admin |
| GET | `/api/ai/reports/:reportId` | Ver reporte | Admin |
| PUT | `/api/ai/reports/:reportId/resolve` | Resolver | Admin |
| POST | `/api/ai/reports/:reportId/actions` | Agregar acción | Admin |
| GET | `/api/ai/content/policies` | Listar políticas | Público |

#### Modelo de Costos

- El consumo de AI para triage es **pagado por Crema** (costo operativo)
- No descuenta créditos del usuario

#### User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| REP-01 | Usuario | reportar contenido inapropiado | el admin pueda revisarlo |
| REP-02 | Admin | ver los tickets escalados | resolver casos pendientes |
| REP-03 | Admin | ver métricas de reports | medir efectividad del sistema |
| REP-04 | Admin | tomar acción sobre un report | resolver o descartar |

#### Estado
✅ **IMPLEMENTADO** (Phase 9) - `reportService.triageReport()` en `denunciation.service.ts` incluye clasificación IA de severidad y sugerencia de acción

> **Implementación técnica:** Ver PRD.md §2.3 Sistema de Denuncias + §6 (Estado de Implementación)
> - Servicio: `DenunciationService` en `services/ai/denunciation.service.ts`
> - Endpoint: `/api/ai/reports` + `/api/admin/reports/:reportId/triage`
> - Tablas: `reports`, `report_reasons`, `report_actions`, `policies`
> - Capability: `reports.create` registrada en Orchestrator

---

### 4.23 Orchestrator

#### Descripción
Router centralizado que registra y ejecuta capabilities de los servicios AI. Provee discovery de capabilities, query execution y streaming responses. Es el punto de entrada unificado para todas las interacciones AI.

#### Arquitectura

```
Cliente → Orchestrator → Skills Registry → Services
                    ↓
            Capabilities (18 registered)
```

#### Capabilities Registradas

| Category | Capability | Descripción |
|----------|------------|-------------|
| **QA** | `qa.ask`, `qa.stream` | Q&A Agent chat |
| **Tutor** | `tutor.ask`, `tutor.stream`, `tutor.config`, `tutor.insights` | Tutor AI |
| **Insights** | `insights.ask`, `insights.stream`, `insights.list`, `insights.delete` | AI Insights |
| **Credits** | `credits.balance`, `credits.packages`, `credits.purchase`, `credits.transactions` | Credit management |
| **Reports** | `reports.create` | Report creation |
| **Embeddings** | `embeddings.generate`, `embeddings.search`, `embeddings.delete` | Vector operations |
| **Interactive** | `interactive.getFields`, `interactive.saveData`, `interactive.analyze`, `interactive.getAnalytics` | Interactive Agent |
| **Memory** | `memory.search` | RAG search |
| **Concierge** | `concierge.chat` | Support chatbot |

#### API Endpoints

| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| GET | `/api/orchestrator/capabilities` | Lista de capabilities | JWT |
| GET | `/api/orchestrator/skills` | Skills disponibles | JWT |
| POST | `/api/orchestrator/query` | Ejecución sin streaming | JWT |
| GET | `/api/orchestrator/stream` | Ejecución con streaming | JWT |

#### Configuración

| Key | Default | Descripción |
|-----|--------|-------------|
| `orchestrator.default_timeout` | 30000ms | Timeout para requests |
| `orchestrator.max_retries` | 2 | Reintentos en error |
| `orchestrator.cache_ttl` | 60000ms | TTL para caching |
| `orchestrator.stream_timeout` | 60000ms | Timeout para streaming |

#### Estado
✅ **IMPLEMENTADO** (Phase 2) - 18 capabilities registradas

> **Implementación técnica:** Ver PRD.md §0.2 (Servicios AI Implementados) + OrchestratorService
> - Servicio: `OrchestratorService` en `services/orchestrator.service.ts`
> - Routes: `routes/orchestrator.routes.ts`
> - Endpoints: `/api/orchestrator/capabilities`, `/api/orchestrator/skills`, `/api/orchestrator/query`, `/api/orchestrator/stream`
> - Skills Registry: `services/skills-registry.service.ts` con Redis cache
> - Config keys: `orchestrator.*` (default_timeout, max_retries, cache_ttl, stream_timeout)

---

### 4.24 Memory Enhancement

#### Descripción
Mejoras al sistema RAG existente: índice HNSW para búsqueda vectorial eficiente, validación RBAC en búsquedas, cleanup jobs para gestión de memoria, y quotas por usuario.

#### Mejoras Implementadas

| Task | Descripción | Archivo |
|------|-------------|---------|
| **M-1** | RBAC validation en memory-search | `memory.service.ts` |
| **M-2** | HNSW index creado | `11-hnsw-index.sql` |
| **M-3** | IVFFlat → HNSW migration | `11-hnsw-index.sql` |
| **M-4** | Cleanup job hourly | `main.worker.ts` |
| **M-5** | Per-user quota + LRU eviction | `checkQuotaAndEvict` |
| **M-6** | Rate limiting en memory endpoints | `memoryLimiter` |
| **M-7** | Error handling + fallback | `memory.service.ts` |

#### Índice HNSW

```sql
CREATE INDEX idx_ai_embeddings_hnsw
ON ai_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

#### Rate Limiting

| Limiter | Límite | Uso |
|---------|--------|-----|
| `memoryLimiter` (read) | 100 req/min | Búsquedas |
| `memoryLimiter` (write) | 20 req/min | Creación embeddings |

#### Quota System

- **Per-user quota**: 10,000 embeddings máximo por usuario
- **LRU eviction**: Cuando se excede, se eliminan los más antiguos
- **Cleanup job**: Se ejecuta cada hora para limpiarhuérfanos

#### Estado
✅ **IMPLEMENTADO** (SDD completo) - Tasks M-1 a M-7

> **Implementación técnica:** Ver PRD.md §2.4 Memory Enhancement + SDD `openspec/changes/archive/2026-06-03-memory-enhancement/`
> - Servicio: `MemoryService` en `services/ai/memory.service.ts` (mejoras M-1 a M-7)
> - Migration: `db/init/11-hnsw-index.sql`
> - Worker: `main.worker.ts` (cleanup job hourly)
> - Quota: `checkQuotaAndEvict()` en memory service
> - Rate limiter: `memoryLimiter` (100 req/min read, 20 req/min write)

---

## 5. Matriz de Acceso por Rol y Tipo de Producto

> **Leyenda de estados**:  
> - ✅ = Implementado en producción  
> - 🆕 = Nuevo, en desarrollo (Fase correspondiente del roadmap)  
> - 🆕 Configura/Usa = Disponible para configurar/usar cuando se implemente  
> - "-" = No disponible

| Funcionalidad | Estado | Creador | Comprador | Afiliado | Visitante |
|---------------|:------:|:-------:|:---------:|:--------:|:---------:|
| **Tutor IA** | ✅ | Configura | ✅ Usa | - | - |
| **AI Content Assistant** | ✅ | ✅ Usa | - | - | - |
| **Conversational Reader** | 🆕 | 🆕 Configura | 🆕 Usa | - | - |
| **Micro-Learning Generator** | 🆕 | 🆕 Usa | - | - | - |
| **Smart Chapters** | 🆕 | 🆕 Usa | 🆕 Usa | - | - |
| **Personalized Learning Path** | 🆕 | 🆕 Configura | 🆕 Usa | - | - |
| **AI Content Studio** | 🆕 | 🆕 Usa | - | - | - |
| **AI Insights** | ✅ | ✅ Usa | - | - | - |
| **AI Support Chatbot** | ✅ | ✅ Usa | ✅ Usa | ✅ Usa | ✅ Usa |
| **AI Afiliate Chat** | ✅ | - | ✅ Usa | ✅ Usa | - |
| **Description Generator** | 🆕 | 🆕 Usa | - | - | - |
| **SEO Optimizer** | ✅ | ✅ Usa | - | - | - |
| **Certificate PDF Generator** | 🆕 | 🆕 Genera | 🆕 Descarga | - | 🆕 Verifica |
| **Sentiment Analytics** | 🆕 | 🆕 Usa | - | - | - |
| **Advanced DRM** | 🆕 | 🆕 Configura | - | - | - |
| **Credit Management Dashboard** | ✅ | ✅ Usa | ✅ Usa | ✅ Usa | - |
| **Book Highlights** | 🆕 | - | 🆕 Usa | - | - |
| **Audio Notes** | 🆕 | - | 🆕 Usa | - | - |
| **AI Summary** | ⚠️ Partial | 🆕 Usa | 🆕 Usa | - | - |
| **Transcript Search** | 🆕 | - | 🆕 Usa | - | - |
| **Interactive Agent** | ✅ | Configura | ✅ Usa | - | - |
| **Reports Agent** | ✅ | ✅ Admin | ✅ Reporta | ✅ Reporta | - |
| **Orchestrator** | ✅ | ✅ Usa | ✅ Usa | ✅ Usa | - |
| **Memory Enhancement** | ✅ | - | - | - | - |

### Sistema de Créditos por Rol

| Rol | Puede Comprar Créditos | Gasta Créditos En |
|----|:----------------------:|-------------------|
| **Creador** | ✅ Sí | Generación de contenido, análisis |
| **Comprador** | ✅ Sí | Tutor, Conversational Reader |
| **Afiliado** | ✅ Sí | AI Afiliate Chat, Generador de copy |
| **Visitante** | ❌ No | - |

### Modelo de Créditos Detallado

#### CREADOR (Plan Pro)

| Operación | Costo | Notas |
|-----------|-------|-------|
| Transcription (incluida) | 60 min/mes | Incluida en Plan Pro |
| Transcription extra | 3 créditos/min | O ARS $12/min |
| Análisis de contenido | 1 crédito/operación | - |
| Generación de quiz | 2 créditos/operación | - |
| Micro-Learning Generator | 5 créditos/video | Incluye resumen + nuggets + quiz |
| Conversational Reader | 1 crédito/pregunta | Para PDFs del creador |
| AI Insights | 5 créditos/consulta | - |
| AI Afiliate Chat | Configurable | Herramienta para afiliados |

**Flujo actual**: Una vez agotados los créditos incluidos, debe comprar paquetes.

---

#### COMPRADOR (Nueva Implementación)

**Modelo Adoptado**: Opción A (Pack de Bienvenida) + Opción C (Freemium por operación)

**Pack de Bienvenida (del Creador)**:
- El creador puede configurar cuántos créditos incluir con su producto
- Ej: "Al comprar este curso, recibís 50 créditos gratis para usar el Tutor IA"
- El creador compra estos créditos en paquete y se "regalan" al comprador

**Operaciones por Tipo**:

| Operación | Costo | ¿Quién paga? |
|-----------|:-----:|---------------|
| **Ver resumen del contenido** | **GRATIS** | El creador lo generó |
| **Ver mapa mental** | **GRATIS** | El creador lo generó |
| **Ver Smart Chapters** | **GRATIS** | El creador lo generó |
| **Usar Tutor IA (preguntas)** | **PAGA** | Comprador con créditos |
| **Chat con PDF/Ebook** | **PAGA** | Comprador con créditos |
| **Descargar certificado** | **GRATIS** | Una vez completado el curso |

**Adquisición de Créditos del Comprador**:
1. **Pack de Bienvenida** (del creador): Gratis al comprar
2. **Recarga propia**: Puede comprar créditos cuando se agoten
3. **Upsell opcional**: "Activá el Tutor IA por $2 USD" (créditos incluidos)

---

#### AFILIADO

**Modelo Adoptado**: Presupuesto Finito por Producto (100% pagado por el Creador)

**Definición por Producto (del Creador)**:

| Configuración | Descripción |
|---------------|-------------|
| **Presupuesto total** | Total de créditos disponibles para afiliados de este producto |
| **Créditos por afiliado** | Cuántos créditos gratis recibe cada afiliado que active la feature |

**Ejemplo**:
```
Presupuesto: 500 créditos
Créditos por afiliado: 50
→ Primeros 10 afiliados reciben trial gratis
→ Afiliado #11 en adelante → "Presupuesto agotado, comprá créditos si querés usar"
```

**Flujo del Afiliado**:

```
Afiliado se registra en producto
        ↓
Hay presupuesto disponible? (activated_count * credits_per_affiliate < total_budget)
        ↓
SÍ: 50 créditos gratis (contados del presupuesto del creador)
NO: Debe comprar créditos si quiere usar herramientas
```

**Operaciones y Costos**:

| Operación | Costo | Notas |
|-----------|-------|-------|
| AI Afiliate Chat | 2 créditos/consulta | Consultas sobre el producto |
| Generador de copy | 3 créditos/generación | Threads, reels, posts |
| Análisis de audiencia | 5 créditos/consulta | Insights de conversión |

**Dashboard del Creador**:

- "Presupuesto: 500 | Usados: 250 (5 afiliados) | Quedan: 5 afiliados con trial"
- Alerta cuando queden <2 disponibles

---

**Controles de Abuso**:

| Escenario | Control | Implementación |
|-----------|---------|---------------|
| **Multi-cuentas** | 1 trial por usuario | `afiliate_trials` con `user_id` único + email verificado |
| **Auto-afiliado** | No permitir que creador sea afiliado de su propio producto | Verificar `creator_id != affiliate_id` |
| **Ventas fake** | ReleaseService como gate | Solo dar créditos cuando `order.balance_released = TRUE` (ReleaseService procesó la orden) |
| **Afiliado inactivo** | Expiración de créditos del trial | Los 50 créditos expiran en 30 días si no se usan |
| **Reventa de créditos** | No transferibles | Los créditos solo pueden usarse en la cuenta del afiliado que los recibió |
| **Contenido spam** | Rate limiting | Max X generaciones por día por usuario |

**Límites Recomendados**:

| Parámetro | Límite |
|-----------|:------:|
| Trial por usuario | 1 vez (con email verificado) |
| Productos con trial/mes | 3 máximo |
| Créditos por afiliado | Min 25, Max 100 (configurable por creador) |
| Presupuesto mínimo por producto | 100 créditos |
| Expiración de créditos del trial | 30 días |

---

### Arquitectura de Precios y Paquetes (Base de Datos)

Los precios y paquetes de créditos se administran dinámicamente desde la base de datos, permitiendo cambios sin necesidad de deploy.

#### Tablas de Configuración

```sql
-- Catálogo de operaciones con costos base
CREATE TABLE ai_operation_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_key VARCHAR(50) UNIQUE NOT NULL,  -- 'tutor_chat', 'pdf_chat', 'analysis', 'quiz', 'transcription'
    operation_name VARCHAR(100) NOT NULL,
    description TEXT,
    base_cost_credits INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paquetes de créditos disponibles para compra
CREATE TABLE ai_credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    package_name VARCHAR(50) NOT NULL,
    credits INTEGER NOT NULL,
    price_ars DECIMAL(18,2) NOT NULL,
    price_usdt DECIMAL(18,6),
    bonus_credits INTEGER DEFAULT 0,  -- créditos extra de bonus
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Precios especiales por rol (opcional)
CREATE TABLE ai_credit_role_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_key VARCHAR(50) REFERENCES ai_operation_types(operation_key),
    role VARCHAR(20) NOT NULL,  -- 'creator', 'buyer', 'affiliate'
    credits_cost INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Operaciones Predefinidas (Valores por defecto)

| operation_key | operation_name | base_cost_credits |
|---------------|----------------|:-----------------:|
| tutor_chat | Tutor IA (pregunta) | 1 |
| pdf_chat | Chat con PDF/Ebook | 2 |
| content_analysis | Análisis de contenido | 3 |
| quiz_generation | Generación de quiz | 5 |
| transcription_min | Transcripción (por minuto) | 10 |
| micro_learning | Micro-Learning Generator | 15 |
| copy_generator | Generador de copy (afiliado) | 3 |
| sentiment_analysis | Sentiment Analytics | 5 |

#### Paquetes Sugeridos (Precios sugeridos)

| package_name | credits | price_ars | price_usdt | bonus_credits |
|--------------|:-------:|----------:|----------:|-------------:|
| Básico | 50 | $50,000 | $50 | 0 |
| Intermedio | 150 | $135,000 | $135 | 10 |
| Pro | 500 | $400,000 | $400 | 50 |
| Enterprise | 1000 | $750,000 | $750 | 100 |

> **Nota**: Los valores son referensi únicamente. Los precios reales se configuran en la tabla `ai_credit_packages` y pueden modificarse dinámicamente.

---

### Adecuaciones Contables e Impositivas

La tercera línea de ingresos (Venta de Créditos AI) sigue el **mismo modelo contable** que las líneas existentes (Comisiones y Suscripciones), reutilizando el cálculo de impuestos desde la base de datos.

#### Modelo de Ingresos de Crema

| Línea | Tipo de Ingreso | Tratamiento Actual |
|-------|-----------------|-------------------|
| **Línea 1** | Comisiones (10% + fee por venta de productos) | ✅ Implementado |
| **Línea 2** | Suscripciones mensuales (Plan Pro) | ✅ Implementado |
| **Línea 3** | Venta de Créditos AI | 🆕 Por implementar |

#### Cálculo de Impuestos (mismo modelo que suscripciones)

El sistema actual ya calcula impuestos dinámicamente desde `currency_validation_rules`:

```typescript
// 1. Obtener reglas fiscales de la DB
const rules = await configRepository.getCurrencyValidationRules(currency);
const taxConfig = rules?.tax_config;

// 2. Cálculo "Tax Inside" (IVA incluido en el precio)
if (taxConfig.enabled && taxConfig.calculation === 'inside') {
    factor = taxConfig.tax_factor; // ej: 1.21 para 21%
    base_imponible = grossAmount / factor;
    iva = grossAmount - base_imponible;
}

// 3. Utilidad Neta = Base Imponible - Fees - Impuestos
netProfit = base_imponible - gatewayFee - gatewayTax;
```

#### Estructura de Costos e Ingresos para Créditos AI

```
Venta de Paquete de Créditos (ej: $100,000 ARS)
├── Bruto: $100,000
├── IVA (21%): $17,356 (recaudado → pasa a ARBA/AFIP)
└── Base Imponible: $82,644
        ├── Fee Pasarela (~5.4%): $5,400
        └── Margen Bruto: $77,244
                ├── Costo API (OpenAI, etc.): $30,000 (gasto operacional)
                └── Margen Neto: $47,244 (ganancia real)
```

#### Tablas Necesarias

```sql
-- Transacciones de compra de créditos (facturación)
CREATE TABLE ai_credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    package_id UUID REFERENCES ai_credit_packages,
    amount_paid DECIMAL(18,2) NOT NULL,  -- precio con IVA
    base_imponible DECIMAL(18,2),        -- sin IVA
    iva DECIMAL(18,2),                    -- 21%
    currency VARCHAR(10) NOT NULL,
    payment_method VARCHAR(50),           -- 'mercadopago', 'usdt'
    payment_status VARCHAR(20),           -- 'pending', 'paid', 'failed'
    transaction_id VARCHAR(100),         -- ID de la pasarela
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Costos de API por mes (tracking de gastos)
CREATE TABLE ai_monthly_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month DATE NOT NULL,                  -- primer día del mes
    provider VARCHAR(50),                -- 'openai', 'google', 'anthropic'
    tokens_input_cost DECIMAL(18,6),
    tokens_output_cost DECIMAL(18,6),
    transcription_cost DECIMAL(18,6),
    total_cost DECIMAL(18,6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Registro en Platform Earnings

Las compras de créditos se registran en `platform_earnings` con tipo `credit_purchase`:

| Campo | Descripción |
|-------|-------------|
| `type` | 'credit_purchase' |
| `gross_amount` | Precio con IVA |
| `net_amount` | Margen después de IVA y fees |
| `currency` | Moneda de la transacción |

#### Diferencia con otras líneas de ingresos

| Aspecto | Comisiones | Suscripciones | Créditos AI |
|---------|-----------|---------------|-------------|
| IVA | ✅ 21% | ✅ 21% | ✅ 21% |
| Fee pasarela | ✅ ~5.4% | ✅ ~5.4% | ✅ ~5.4% |
| Costo operacional | ❌ No | ❌ No | ✅ Sí (APIs de AI) |
| Tracking de costos | N/A | N/A | ✅ `ai_monthly_costs` |

#### Beneficios del modelo

| Beneficio | Descripción |
|-----------|-------------|
| **Consistencia** | Mismo manejo contable para las 3 líneas |
| **Configurable** | Impuestos se cambian desde DB (tax_config) |
| **Reutilizable** | Mismo código de cálculo de IVA que suscripciones |
| **Reportes unificados** | Todos los ingresos en platform_earnings |
| **Margen claro** | Costo de APIs tracking → margen neto real |

---

### Modelo de Inclusión por Plan

| Funcionalidad | Plan Initial | Plan Pro |
|---------------|:------------:|:--------:|
| Tutor IA (uso básico) | ✅ | ✅ |
| AI Content Assistant | ❌ | ✅ |
| Conversational Reader | ❌ | ✅ |
| Micro-Learning Generator | ❌ | ✅ |
| Smart Chapters | ❌ | ✅ |
| Personalized Learning Path | ❌ | ✅ |
| AI Content Studio | ❌ | ✅ |
| **AI Insights** | ⚠️ | ✅ |
| AI Support Chatbot | ✅ | ✅ |
| AI Afiliate Chat | ❌ (créditos) | ✅ |
| Description Generator | ❌ | ✅ |
| SEO Optimizer | ❌ | ✅ |
| Certificate PDF Generator | ✅ | ✅ |
| Sentiment Analytics | ❌ | ✅ |
| Advanced DRM | ❌ | ✅ |
| Book Highlights | ❌ | 🆕 |
| AI Summary | ❌ | 🆕 |

---

## 6. Herramientas de Admin

> Estas herramientas son para la administración de la plataforma y están disponibles para usuarios con rol Admin.

### 6.1 Dashboard de Admin

| Herramienta | Descripción |
|-------------|-------------|
| **Sentiment Analytics** | Análisis de reviews de todos los productos |
| **Predictive Analytics** | Patrones de éxito/fracaso usando pgvector |
| **Content Moderation** | Moderación de contenido subenido |
| **Security Dashboard** | Monitoreo de seguridad de la plataforma |
| **Revenue Analytics** | Ganancias, métricas financieras |
| **User Insights** | Comportamiento de usuarios |
| **Product Health** | Estado de productos (ventas, refunds) |
| **AI Usage Stats** | Uso de créditos AI por producto/usuario |

### 6.2 Métricas Disponibles

| Métrica | Descripción |
|-------------|-------------|
| **Churn Prediction** | Predecir usuarios en riesgo de cancelar |
| **Refund Risk** | Productos con alto riesgo de reembolso |
| **Success Patterns** | Qué tipos de productos venden más |
| **Conversion Funnel** | Embudo de conversión por tipo |
| **AI Adoption** | % de usuarios usando herramientas AI |

---

## 6b. Matriz de Herramientas por Tipo de Producto

### CREADOR

| Herramienta | Video/Curso | | Ebook | | | Podcast | | Software | | Membresía | | Link | |
|-------------|:----------:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Plan** | Free | Pro | Free | Pro | Free | Pro | Pro | Free | Pro | Pro |
| **Tutor IA** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Transcripción** | 💰 | ✅ | ❌ | ✅ | 💰 | ✅ | ✅ | ✅ | 💰 | 💰 |
| **Content Asst** | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| **SEO Optimizer** | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |

### COMPRADOR

| Herramienta | Video/Curso | Ebook | Podcast | Software | Membresía | Link |
|-------------|:---------:|:-----:|:-------:|:--------:|:--------:|:---:|
| **Tutor IA** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Chat PDF** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Smart Chapters** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Transcripción** | 💰 | ❌ | 💰 | ❌ | 💰 | 💰 |
| **Micro-Learning** | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| **Book Highlights** | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Audio Notes** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **AI Summary** | 💰 | 💰 | 💰 | ❌ | 💰 | ❌ |
| **Transcript Search** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Certificate** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |

### AFILIADO

| Herramienta | Acceso |
|-------------|-------|
| **Gen. de Copy** | 💰 |
| **Chat Producto** | 💰 |
| **Landing Page Builder** | 💰 |

---

### 7.1 Costo de Implementación por Funcionalidad

| Funcionalidad | Complejidad | Tiempo Est. | Costo API | Dependencias |
|---------------|:------------:|:------------:|:---------:|--------------|
| Tutor IA | Media | 2 semanas | $0.001/msg | Memory Service |
| AI Content Assistant | Media | 3 semanas | $0.17/video | Transcription |
| Conversational Reader | Media | 2 semanas | $0.001/msg | pgvector existente |
| Micro-Learning Generator | Alta | 4 semanas | $0.17/video | Transcription + Video processing |
| Smart Chapters | Media | 2 semanas | $0.10/audio | Transcription |
| Personalized Learning Path | Alta | 3 semanas | $0.03/user | User profiles |
| AI Content Studio | Alta | 4 semanas | $0.20/process | Content analysis |
| AI Insights | Media | 3 semanas | $0.005/query | Analytics DB |
| AI Support Chatbot | Baja | 1 semana | $0.001/msg | FAQ base |
| AI Afiliate Chat | Baja | 2 semanas | $0.001/msg | Product context |
| Description Generator | Baja | 1 semana | $0.01/generate | Content analysis |
| SEO Optimizer | Baja | 1 semana | $0.01/generate | Content analysis |
| Certificate PDF Generator | Media | 2 semanas | $0.01/generate | PDF library |
| Sentiment Analytics | Media | 2 semanas | $0.02/review | Reviews DB |
| Advanced DRM | Alta | 4 semanas | $0.00 | Video processing |

### 7.2 Modelo de Ingresos Proyectado

| Fuente de Ingreso | Descripción | Proyección Mensual |
|-------------------|-------------|-------------------|
| **Créditos AI (Creador)** | Venta de paquetes de créditos | $2,500 USD (Mes 3) → $5,000 USD (Mes 6) |
| **Créditos AI (Comprador)** | Recargas de compradores | $500 USD (Mes 3) → $2,000 USD (Mes 6) |
| **Créditos AI (Afiliado)** | Recargas de afiliados | $200 USD (Mes 3) → $1,000 USD (Mes 6) |
| **Plan Pro** | Diferencia vs Plan Initial | Incluido |
| **Upsell de features** | Micro-learning extra, etc. | $300 USD (Mes 3) → $1,500 USD (Mes 6) |

### 7.3 ROI Esperado

| Métrica | Actual | Objetivo (12 meses) |
|---------|--------|---------------------|
| Costo de soporte por ticket | $15 USD | -50% ($7.50) |
| Tasa de conversión landing | 2.5% | +15% (2.875%) |
| Churn de membresías | 8% | -20% (6.4%) |
| Ingresos por créditos AI | $0 | $8,500 USD/mes |

---

## 8. Dependencias entre Features y otros PRDs

> Esta sección clarifica las dependencias entre features AI y con otros PRDs del proyecto.

### 8.1 Dependencias entre Features AI-FEATURES

| Feature | Depende de | Estado Dependencia | Notas |
|---------|------------|-------------------|-------|
| **§4.17 Book Highlights** | §4.3 Conversational Reader | ❌ Debe implementarse después | Requiere que MemoryService tenga chunks de PDFs |
| **§4.6 Personalized Learning Path** | §4.24 Memory Enhancement | ✅ Resuelta | Memory Enhancement (HNSW + RBAC + Quota) ya está completo |
| **§4.4 Micro-Learning Generator** | TranscriptionService + QuizGenerator | ✅ Disponible | Servicios ya implementados |
| **§4.5 Smart Chapters** | TranscriptionService | ✅ Disponible | Servicio existente |
| **§4.18 Audio Notes** | TranscriptionService | ✅ Disponible | Servicio existente |
| **§4.20 Transcript Search** | TranscriptionService | ✅ Disponible | Servicio existente |
| **§4.19 AI Summary** | ContentAssistantService | ✅ Disponible | Ya existe `analysisType: 'summary'` |
| **§4.14 Sentiment Analytics** | ReviewsService | ✅ Disponible | Servicio existente |

### 8.2 Dependencias con ARCHITECTURE-PRD (v2.0)

| Feature AI-FEATURES | Dependencia Arquitectura | Estado |
|---------------------|--------------------------|--------|
| **Tutor IA** | Memory Service (pgvector) | ✅ Existente |
| **Conversational Reader** | Memory Service + pgvector | ✅ Existente |
| **Smart Chapters** | Transcription Service | ✅ Existente |
| **Personalized Learning Path** | §4.24 Memory Enhancement | ✅ Completado (Mayo 2026) |
| **User Notes & Highlights** | §4.24 Memory Enhancement | ✅ Completado |
| **AI Summary** | ContentAssistantService | ✅ Disponible |
| **Predictive Analytics** | AI Insights + pgvector | ✅ Implementado (§4.8 expandido) |
| **Content Moderation** | AI Content Assistant | ✅ Disponible |

### 8.3 Dependencias con CONTENT-SECURITY-PRD (v2.0)

| Feature AI-FEATURES | Validación Requerida | Sección Content-Security |
|---------------------|---------------------|------------------------|
| **Book Highlights** | Notas de usuario | 10.1 |
| **Audio Notes** | Notas con timestamp | 10.3 |
| **AI Summary** | Generación de contenido | 10.2 |
| **Transcripción** | Contenido del creador | Validaciones existentes |
| **Content Moderation** | Moderación AI | 10.x |

### 8.4 Orden de Implementación Recomendado

> Dado que la mayoria de dependencias ya están resueltas, el orden se basa en score de viabilidad y复用 de código.

**Fase A (Meses 1-2):复用 existente**
1. §4.10 AI Afiliate Chat —复用 ConciergeService ✅ COMPLETO
2. §4.12 SEO Optimizer —复用 ContentAssistant ✅ COMPLETO
3. §4.8 AI Insights expand —复用 InsightsService

**Fase B (Meses 3-4): Contenido y monetización**
4. §4.11 Description Generator —复用 ContentAssistant
5. §4.13 Certificate PDF — score 8/10, infraestructura parcial existe
6. §4.20 Transcript Search —复用 TranscriptionService

**Fase C (Meses 5-6): Engagement**
7. §4.14 Sentiment Analytics — score 9/10
8. §4.3 Conversational Reader — base para §4.17
9. §4.19 AI Summary —复用 existente

**Fase D (Meses 7-8): Protección y expansión**
10. §4.15 Advanced DRM
11. §4.5 Smart Chapters —复用 Transcription
12. §4.4 Micro-Learning Generator —复用 Transcription + QuizGenerator

**Fase E (Meses 9-10): Personalización**
13. §4.6 Personalized Learning Path — dependencias resueltas ✅
14. §4.17 Book Highlights — requiere §4.3 primero ❌

### 8.5 Resumen de Estado de Dependencias

| Métrica | Cantidad |
|---------|----------|
| Dependencias resueltas (infraestructura existente) | 12 |
| Dependencias pendientes (entre features) | 1 (§4.3 → §4.17) |
| Dependencias bloqueantes | 0 |

---

## 9. Roadmap de Implementación

> **Estado**: Mayo 2026 - Phase 1 completada, continuando con roadmap priorizado
> **Duración total**: ~40 semanas restantes (10 meses)
> **Basado en**: Análisis de viabilidad (feasibility-analysis.md v2.0) + prioridades de negocio
> **Nota**: Las semanas indican tiempo estimado desde Mayo 2026, no semanas calendario reales

### Estado Actual (Mayo 2026) ✅ COMPLETADO

| Fase | Funcionalidades | Estado | Notes |
|------|-----------------|--------|-------|
| **Completada** | LLM, Embedding, Memory, Credits base | ✅ | 18 servicios AI |
| **Completada** | AI Content Assistant (ContentAssistant, ContentReader, QuizGenerator, Transcription) | ✅ | Phases 3-6 |
| **Completada** | AI Support Chatbot (Concierge - core) | ✅ | Phase 7 |
| **Completada** | Reports Agent + DenunciationService | ✅ | Phase 9 |
| **Completada** | Memory Enhancement (HNSW, RBAC, Quota, LRU, Cleanup) | ✅ | SDD M-1 a M-7 |
| **Completada** | Orchestrator (18 capabilities) | ✅ | Phase 2 |
| **Completada** | Interactive Agent (SDD Tasks 1-11) | ✅ | Phase 11 |

---

### Roadmap Priorizado (Mayo 2026 en adelante)

#### Fase A: Extender Existente (Meses 1-2) [Mayo - Julio 2026]

> **Prioridad ALTA** -复用 infraestructura existente

| Semana | Feature | Sección | Score | Entregable | Dependencias |
|--------|---------|---------|-------|-------------|--------------|
| 1-2 | **AI Afiliate Chat** | §4.10 | 7/10 | Chat para afiliados (variant de Concierge) | ConciergeService |
| 3-4 | **SEO Optimizer** | §4.12 | 6/10 | Meta tags automáticos | ContentAssistant |
| 5-6 | **AI Insights (expandido)** | §4.8 | ✅ Completado | Analytics mejorados | InsightsService existente |

> **Razón**:复用 código existente con bajo esfuerzo

---

#### Fase B: Contenido y Monetización (Meses 3-4) [Agosto - Septiembre 2026]

| Semana | Feature | Sección | Score | Entregable | Dependencias |
|--------|---------|---------|-------|-------------|--------------|
| 7-8 | **Description Generator** | §4.11 | 8/10 | Título, descripción, tags SEO | ContentAssistant |
| 9-10 | **Certificate PDF Generator** | §4.13 | 8/10 | PDF + QR para certificados | — |
| 11-12 | **Transcript Search** | §4.20 | — | Búsqueda en transcripciones | TranscriptionService |

> **Razón**: Alto impacto para creadores + reutiliza transcription existente

---

#### Fase C: Analytics y Engagement (Meses 5-6) [Octubre - Noviembre 2026]

| Semana | Feature | Sección | Score | Entregable | Dependencias |
|--------|---------|---------|-------|-------------|--------------|
| 13-14 | **Sentiment Analytics** | §4.14 | 9/10 | AI analiza reviews | ReviewsService |
| 15-16 | **Conversational Reader** | §4.3 | — | Chat con PDF/Ebook | MemoryService |
| 17-18 | **AI Summary** | §4.19 | — | Resumen de contenido | Transcription |

> **Razón**: Score alto (Sentiment) + extensiones lógicas de transcription/memory

---

#### Fase D: Advanced Protection (Meses 7-8) [Diciembre 2026 - Enero 2027]

| Semana | Feature | Sección | Score | Entregable | Dependencias |
|--------|---------|---------|-------|-------------|--------------|
| 19-20 | **Advanced DRM** | §4.15 | 8/10 | Watermarks + protección | — |
| 21-22 | **Smart Chapters** | §4.5 | — | Timestamps + buscador | Transcription |
| 23-24 | **Micro-Learning Generator** | §4.4 | — | Nuggets + resumen + quiz | Transcription + QuizGenerator |

> **Razón**: Protección de contenido + extensiones de transcription

---

#### Fase E: Personalización y Expansión (Meses 9-10) [Febrero - Marzo 2027]

| Semana | Feature | Sección | Descripción | Dependencias |
|--------|---------|---------|-------------|--------------|
| 25-26 | **Personalized Learning Path** | §4.6 | Rutas personalizadas por usuario | — |
| 27-28 | **Book Highlights** | §4.17 | Highlights en PDFs | Conversational Reader |
| 29-30 | **Audio Notes** | §4.18 | Notas con timestamp | Transcription |

---

#### Fase F: Consolidación y Admin (Meses 11-12) [Abril - Mayo 2027]

| Semana | Feature | Sección | Descripción | Dependencias |
|--------|---------|---------|-------------|--------------|
| 31-32 | **AI Content Studio** | §4.7 | Suite completo de creación | Memory Service |
| 33-36 | **Admin Tools** | — | Content Moderation, Security Dashboard | AI Content Assistant |
| 37-40 | **Optimización** | — | Refinamiento prompts, testing, costos |Todas |

---

### Features Descartadas o Dependientes

| Feature | Sección | Razón | Alternativa |
|---------|---------|-------|-------------|
| **Workshop Builder AI** | — | Muy amplio, poco definido | Phase incremental |
| **Affiliate Landing Builder** | — | Depende de AI Afiliate Chat | Implementar §4.10 primero |

---

### Métricas de Éxito por Fase

| Fase | Métrica | Objetivo |
|------|---------|----------|
| A |复用 código | >60% de features复用 servicios existentes |
| B | Tiempo de implementación | <2 semanas por feature |
| C | Engagement | +15% conversiones con analytics |
| D | Seguridad | 0 reportes de piratería en 3 meses |
| E | Personalización | +20% completitud de cursos |
| F | Satisfacción | NPS > 50 |

---

### Verificación Estándar

> Todas las tareas de implementación siguen el Estándar de Verificación definido en `docs/project/common/verification-standard.md`

---

---

## 10. Requisitos No Funcionales

### 9.1 Performance y Experiencia de Usuario (UX)

#### 9.1.1 Tiempos de Respuesta

| Métrica | Objetivo | Notas |
|---------|----------|-------|
| **Chat/Tutor respuesta inicial** | < 2 segundos | Primer token streaming |
| **Chat/Tutor respuesta completa** | < 30 segundos | Para respuestas largas |
| **Generación de contenido** | < 60 segundos | Resumen, quiz, etc. |
| **Transcripción** | < tiempo_audio × 0.5 | Async con job |
| **Búsqueda semántica (pgvector)** | < 500ms | Para RAG |

#### 9.1.2 Streaming (SSE - Server-Sent Events)

| Requisito | Descripción |
|-----------|-------------|
| **Streaming obligatorio** | Todas las respuestas de chat/generación deben usar streaming |
| **Fallback sync** | Si SSE falla, responder con timeout (no dejar colgado) |
| **Progress indicators** | Mostrar "escribiendo..." durante generación |
| **Cancelación** | Usuario puede cancelar generación en progreso |

#### 9.1.3 Timeouts y Handling

| Escenario | Timeout | Manejo |
|-----------|---------|--------|
| LLM responde | 60s | Timeout → error genérico |
| Búsqueda pgvector | 5s | Timeout → búsqueda simple fallback |
| Transcripción job | 10 min | Async con status polling |
| UI wait | 30s | Mostrar spinner + opción de email cuando esté listo |

#### 9.1.4 Caching

| Tipo de request | TTL | Notas |
|-----------------|-----|-------|
| Embeddings (contenido estable) | 30 días | Cache por content_hash |
| Respuestas FAQs | 24 horas | Cache por pregunta normalizada |
| Stats/Analytics | 1 hora | Cache por dashboard |

---

### 9.2 Seguridad y Ciberseguridad

#### 8.2.1 Protección de APIs

| Control | Implementación |
|---------|---------------|
| **Autenticación** | JWT válido para todas las endpoints AI |
| **Rate limiting por usuario** | Ventana deslizante (sliding window) |
| **Rate limiting por IP** | Prevenir ataques DDoS |
| **Role-based access** | Verificar rol (creador/comprador/afiliado) antes de procesar |
| **Ownership check** | Verificar que usuario tiene acceso al recurso |

#### 8.2.2 Protección contra Prompt Injection

| Control | Descripción |
|---------|-------------|
| **Input sanitization** | Remover caracteres de injection del input usuario |
| **System prompt isolation** | Nunca concatenar input directo en system prompt |
| **Output filtering** | Filtrar outputs que contengan tokens sensibles |
| **Prompt templates** | Usar templates predefinidos, no strings dinámicos |

#### 8.2.3 Datos y Privacidad

| Control | Descripción |
|---------|-------------|
| **No training** | Datos de usuarios NO se usan para entrenar modelos |
| **Audit logs** | Todas las interacciones con IA registradas (sin PII) |
| **Data retention** | Historial de chats: 90 días, luego anonimizar |
| **PII en logs** | NO loggear: passwords, tokens, credit cards, emails |
| **Encryption at rest** | PostgreSQL con encryption habilitado |
| **Encryption in transit** | TLS 1.3 obligatorio |

#### 8.2.4 Rate Limiting Detallado

| Endpoint | Límite | Ventana |
|----------|:------:|---------|
| `/ai/chat/*` | 60 | minuto |
| `/ai/generate/*` | 20 | minuto |
| `/ai/transcribe` | 5 | hora |
| `/ai/embed` | 100 | minuto |

#### 8.2.5 Content Safety

| Control | Descripción |
|---------|-------------|
| **Input moderation** | Moderar input de usuario (OpenAI Moderation o similar) |
| **Output moderation** | Moderar output del LLM antes de enviar |
| **Banned topics** | Configurar topics prohibidos en prompts |
| **Denial handling** | Si se detecta contenido banned → mensaje genérico |

---

### 9.3 Escalabilidad

| Aspecto | Requisito |
|---------|-----------|
| **Horizontal scaling** | Soporte múltiples instancias (stateless) |
| **Queue processing** | BullMQ para jobs pesados (transcription, embedding) |
| **Caching** | Redis para respuestas frecuentes y tokens |
| **Database** | Índices optimizados para pgvector (IVFFlat/HNSW) |
| **Connection pooling** | Reuse PostgreSQL connections |
| **Circuit breaker** | Si LLM provider falla → fallback a otro provider |

---

### 9.4 Monitoreo y Observabilidad

| Métrica | Descripción | Alerta |
|---------|-------------|--------|
| **Token usage** | Consumo por usuario/feature/día | > 80% del budget |
| **Error rate LLM** | Fallos de API externos | > 5% en 5 min |
| **Latency p95** | Percentil 95 de respuesta | > 30s |
| **Latency p99** | Percentil 99 de respuesta | > 60s |
| **Credit consumption** | Tracking de gastos por usuario | > $50/día |
| **Queue backlog** | Jobs pendientes en BullMQ | > 1000 |
| **pgvector query time** | Tiempo de búsquedasemántica | > 1s |

---

### 9.5 Disponibilidad y Recoverability

| Aspecto | Requisito |
|---------|-----------|
| **Uptime objetivo** | 99.9% mensual |
| **Fallback providers** | Si OpenAI falla → Gemini → Ollama |
| **Retry logic** | Exponential backoff para APIs de LLM |
| **Dead letter queue** | Jobs fallidos 3 veces → DLQ para revisión |
| **Backup de embeddings** | Export/import de índices pgvector |
| **Graceful degradation** | Si AI falla → mostrar contenido sin AI |

---

## 11. Anexos

### A. Glosario de Términos

| Término | Definición |
|---------|------------|
| **RAG** | Retrieval Augmented Generation - Técnica de IA que busca contexto relevante antes de generar respuesta |
| **pgvector** | Extensión de PostgreSQL para vectores - usada en búsqueda semántica |
| **Embedding** | Representación numérica de texto - permite búsqueda por similitud |
| **Chunks** | Fragmentos de texto en que se divide un documento para embedding |
| **Skill** | Función que el LLM puede ejecutar para interactuar con sistemas externos |
| **Agent** | Orquestador de tareas que usa múltiples skills |
| **Micro-learning** | Contenido educativas en segmentos cortos (1-3 min) |
| **Nuggets** | Fragmentos de alto impacto para redes sociales |

### B. Referencias

- Análisis de mercado para Crema.md (Obsidian Vault)
- Feasibility Analysis - AI Features 2026
- SDD AI Content Assistant - Documentación completa

### C. Verificación de Infraestructura Existente

#### C.1 Tablas de Base de Datos ya Implementadas

Las siguientes tablas ya existen en `backend/db/init/05-ai-tables.sql` y `01-create-tables.sql`:

| Tabla | Ubicación | Funcionalidad Relacionada |
|-------|-----------|---------------------------|
| `ai_credits` | 05-ai-tables.sql | Credits Service |
| `ai_credit_transactions` | 05-ai-tables.sql | Credits Service |
| `ai_credit_packages` | 05-ai-tables.sql | Credits Service |
| `ai_embeddings` | 05-ai-tables.sql | Memory Service / RAG |
| `product_questions` | 05-ai-tables.sql | Q&A System |
| `product_faqs` | 05-ai-tables.sql | Q&A System |
| `product_reviews` | 05-ai-tables.sql | Reviews |
| `product_review_settings` | 05-ai-tables.sql | Reviews |
| `reports` | 05-ai-tables.sql | Denuncias |
| `report_reasons` | 05-ai-tables.sql | Denuncias |
| `content_policies` | 05-ai-tables.sql | Denuncias |
| `product_tutor_config` | 05-ai-tables.sql | Tutor IA |
| `product_qa_agent_config` | 05-ai-tables.sql | QA Agent |
| `agent_conversations` | 05-ai-tables.sql | Agentes IA |
| `agent_messages` | 05-ai-tables.sql | Agentes IA |
| `creator_daily_metrics` | 05-ai-tables.sql | Analytics |
| `tutor_insights` | 05-ai-tables.sql | Tutor Insights |
| `user_certificates` | 01-create-tables.sql | Certificates |

#### C.2 Tablas que FALTAN crear

| Tabla | Funcionalidad | Notas |
|-------|---------------|-------|
| `product_memories` | Conversational Reader | Almacena chunks de PDFs/Ebooks |
| `user_learning_paths` | Personalized Learning Path | Rutas personalizadas por usuario |
| `micro_learning_assets` | Micro-Learning Generator | Nuggets, resúmenes, mapas mentales |
| `product_seo_configs` | SEO Optimizer | Meta tags por producto |
| `sentiment_analyses` | Sentiment Analytics | Historial de análisis de reviews |
| `drm_configs` | Advanced DRM | Configuración de protección por producto |

##### Schemas SQL

```sql
-- product_memories:Chunks de PDFs/Ebooks para Conversational Reader
CREATE TABLE product_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding VECTOR(1536),
    page_number INTEGER,
    section_title VARCHAR(255),
    content_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_product_memories_product ON product_memories(product_id);
CREATE INDEX idx_product_memories_embedding ON product_memories USING ivfflat (embedding vector_cosine_ops);

-- user_learning_paths:Rutas personalizadas por usuario
CREATE TABLE user_learning_paths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    path_data JSONB NOT NULL DEFAULT '{}',  -- {milestones:[],current_step,completed[]}
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- micro_learning_assets:Nuggets, resúmenes, mapas mentales
CREATE TABLE micro_learning_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    asset_type VARCHAR(20) NOT NULL,  -- 'nugget','summary','mindmap','quiz'
    content JSONB NOT NULL,
    video_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    duration_seconds INTEGER,
    is_published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_micro_assets_product ON micro_learning_assets(product_id, asset_type);

-- product_seo_configs:Meta tags por producto
CREATE TABLE product_seo_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    meta_title VARCHAR(70),
    meta_description VARCHAR(160),
    og_title VARCHAR(70),
    og_description VARCHAR(160),
    og_image_url VARCHAR(500),
    schema_markup JSONB,
    keywords TEXT[],
    canonical_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- sentiment_analyses:Historial de análisis de reviews
CREATE TABLE sentiment_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    analysis_date DATE NOT NULL,
    total_reviews INTEGER,
    positive_count INTEGER,
    neutral_count INTEGER,
    negative_count INTEGER,
    average_score DECIMAL(3,2),
    top_positive_themes TEXT[],
    top_negative_themes TEXT[],
    trends JSONB,  -- {date:[],score:[]}
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sentiment_product_date ON sentiment_analyses(product_id, analysis_date);

-- drm_configs:Configuración de protección por producto
CREATE TABLE drm_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    watermark_enabled BOOLEAN DEFAULT TRUE,
    watermark_text VARCHAR(100),
    view_limit INTEGER,  -- 0 = ilimitado
    download_disabled BOOLEAN DEFAULT FALSE,
    expiration_hours INTEGER,  -- 0 = nunca
    regions_allowed TEXT[],  -- NULL = todas
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### C.3 Servicios ya Implementados

| Servicio | Ubicación | Funcionalidad |
|----------|-----------|---------------|
| `LLMService` | `backend/src/services/ai/llm.service.ts` | Orquestación de múltiples modelos |
| `MemoryService` | `backend/src/services/ai/memory.service.ts` | pgvector + embeddings |
| `CreditsService` | `backend/src/services/ai/credits.service.ts` | Sistema de créditos |
| `QAService` | `backend/src/services/ai/qa.service.ts` | Auto-respuesta |
| `AgentsService` | `backend/src/services/ai/agents.service.ts` | Orquestación de agentes |
| `EmbeddingService` | `backend/src/services/ai/embedding.service.ts` | Generación de embeddings |
| `ContentAssistantService` | `backend/src/services/ai/content/content-assistant.service.ts` | AI Content Assistant |
| `ContentReaderService` | `backend/src/services/ai/content/content-reader.service.ts` | Lectura de contenido |
| `QuizGeneratorService` | `backend/src/services/ai/content/quiz-generator.service.ts` | Generación de quizzes |
| `TranscriptionService` | `backend/src/services/ai/content/transcription.service.ts` | Transcripción Whisper |

---

## 16. Testing

### 16.1 Unit Tests

| Servicio | Tests | Archivo |
|----------|-------|---------|
| AiCreditsService | TC-01 a TC-06 | `ai/credits.service.test.ts` |
| LLMService | TC-01 a TC-03 | `ai/llm.service.test.ts` |
| MemoryService | TC-01 a TC-04 | `ai/memory.service.test.ts` |
| EmbeddingService | TC-01 a TC-03 | `ai/embedding.service.test.ts` |
| QAService | TC-01 a TC-02 | `ai/qa.service.test.ts` |
| TranscriptionService | TC-01 a TC-02 | `content/transcription.service.test.ts` |
| ContentAssistantService | TC-01 a TC-04 | `content/content-assistant.service.test.ts` |
| QuizGeneratorService | TC-01 a TC-02 | `content/quiz-generator.service.test.ts` |

### 16.2 Integration Tests

| Test Case | Descripción |
|---------|-------------|
| IT-01 | Full flow: credits → LLM → response |
| IT-02 | Memory: store → search → recall |
| IT-03 | QA: question → answer with context |
| IT-04 | Transcription: audio → transcript |
| IT-05 | Quiz: content → questions |

### 16.3 Test Fixtures

```typescript
// src/__tests__/fixtures/ai-features.ts
export const mockCredits = [
  { userId: 'user-1', balance: 100, totalPurchased: 100 },
  { userId: 'user-2', balance: 0, totalPurchased: 0 },
];

export const mockMessages = [
  { role: 'user', content: 'Hello' },
  { role: 'assistant', content: 'Hi there!' },
];

export const mockEmbeddings = [
  { text: 'test embedding', vector: [0.1, 0.2, 0.3] },
];
```

### 16.4 Coverage Target

| Tipo | Target |
|------|--------|
| Unit Tests | >= 80% |
| Integration | Core AI flows |
| E2E (Playwright) | User stories |

---

**Documento preparado para revisión y posterior inicio de SDD por funcionalidad.**

*Versión: 2.0 - Abril 2026*