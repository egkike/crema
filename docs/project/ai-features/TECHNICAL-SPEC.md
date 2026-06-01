# Product Requirements Document (PRD)
## Crema - Sistema de Interacción y Analytics

**Versión**: 1.8
**Fecha**: Mayo 2026
**Estado**: 🟢 MAYORMENTE IMPLEMENTADO — Interactive Agent SDD completo (Tasks 1-11), 20 servicios AI, Orchestrator con 18 capabilities, Reports Agent con triage IA
**Owner**: Kike García
**Fases**: 3 (Memory + Q&A + Reviews + Denuncias | Analytics + IA avanzada | Orchestration + Interactive + Content)

---

## Tabla de Contenidos

1. [Visión General](#1-visión-general)
2. [Fase 1: Memory + Q&A + Reviews + Denuncias](#2-fase-1-memory--qa--reviews--denuncias)
   - [2.0 Crema Memory Service](#20-crema-memory-service) ⭐ PRIORIDAD 1
   - [2.1 Sistema de Q&A](#21-sistema-de-qa)
   - [2.2 Sistema de Reviews/Ratings](#22-sistema-de-reviewsratings)
   - [2.3 Sistema de Denuncias](#23-sistema-de-denuncias)
   - [2.4 Agentes IA](#24-agentes-ia)
3. [Fase 2: Analytics + IA Avanzada](#3-fase-2-analytics--ia-avanzada)
   - [3.1 Dashboard Analytics](#31-dashboard-analytics)
   - [3.2 Tutor AI Avanzado](#32-tutor-ai-avanzado)
4. [Arquitectura de Datos](#4-arquitectura-de-datos)
5. [API Endpoints](#5-api-endpoints)
6. [Roadmap de Implementación](#6-roadmap-de-implementación)
7. [Dependencias y Costos](#7-dependencias-y-costos)
8. [Stack Disponible](#0-stack-disponible)

---

## 0. Stack Disponible

> ⚠️ **Regla obligatoria**: Antes de proponer soluciones, verificar qué está ya implementado. Explorar lo existente antes de agregar dependencias nuevas.

### 0.1 Infraestructura Disponible

| Componente | Implementación | Archivo | Uso |
|-----------|-------------|---------|-----|
| **Redis** | `ioredis` con configuración centralizada | `backend/src/config/redis.ts` → `redisConnection` | Caching, rate limiting |
| **BullMQ** | Cola + Worker para jobs asíncronos | `backend/src/queues/scheduler.ts` + `main.worker.ts` | Async processing, scheduling |
| **PostgreSQL + pgvector** | Base de datos vectorial | `text-embedding-3-small` / `nomic-embed-text` | Memoria AI persistente |

### 0.2 Servicios AI Implementados (reutilizables)

| Servicio | Archivo | Descripción |
|---------|---------|-------------|
| **OrchestratorService** | `src/services/ai/orchestrator.service.ts` | Orquestación centralizada de agentes AI con SSE |
| **LLMService** | `src/services/ai/llm.service.ts` | Multi-provider: OpenAI, Ollama, Anthropic, Gemini, Simulator |
| **MemoryService** | `src/services/ai/memory.service.ts` | pgvector + PostgreSQL para memoria persistente |
| **SkillsRegistry** | `src/services/skills-registry.service.ts` | Registro de skills con Redis cache |

### 0.3 Ejemplo de Reutilización

```typescript
// Para análisis complejo (async con BullMQ):
import { mainQueue } from '../queues/scheduler';
await mainQueue.add('analyze-content', { userId, productId, contentHash }, { attempts: 3 });

// Para caching de resultados:
import { redisConnection } from '../config/redis';
// Ver skills-registry.service.ts para patrón de Redis caching con TTL

// Para embeddings (ya implementado):
// Ver transcription.service.ts (sección "AI Embeddings")
```

### 0.4 Consideraciones para Módulos AI

- **Memoria persistente** → Ya existe MemoryService con pgvector (no agregar Redis-based vector store)
- **Procesamiento async** → Usar BullMQ queue `mainQueue` existente
- **Rate limiting por usuario** → Usar patrón de NotificationService (Redis INCR + TTL)
- **Caching de respuestas** → Usar patrón de SkillsRegistry (Redis con TTL)

## 1. Visión General

### 1.1 Objetivo del Documento

Este PRD define los requisitos para implementar los módulos de:
1. **Memoria AI Centralizada** (Crema Memory MCP)
2. **Comunicación Comprador-Creador** (Q&A + FAQ)
3. **Social Proof** (Reviews + Ratings)
4. **Moderación** (Denuncias + Políticas + Agentes IA)
5. **Analytics** (Dashboard para creadores)
6. **Inteligencia Artificial** (Tutor automático)

### 1.2 Referencia Competitiva

Basado en análisis de Hotmart, la plataforma líder en digital products en Latinoamérica.

### 1.3 Modelo de IA - Multi-Provider Support

| Aspecto | Decisión |
|---------|----------|
| **Quién paga** | Crema (incluido en Plan Pro) |
| **Modelo** | GPT-4o-mini (mejor relación precio/calidad) |
| **Proveedores disponibles** | OpenAI, Ollama, Anthropic, Gemini, Simulator |
| **Límite Pro** | 100 conversaciones/mes |
| **Modelo de pago extra** | Créditos prepagos (no expiran en 6-12 meses) |
| **Memoria persistente** | PostgreSQL + pgvector (Crema Memory MCP) |

#### 1.3.1 Proveedores LLM Soportados

| Provider | Modelo | Streaming | Uso recomendado |
|----------|--------|-----------|-----------------|
| **OpenAI** | GPT-4o-mini, GPT-4o | ✅ | Producción |
| **Ollama** | llama3, mistral | ✅ | Desarrollo local |
| **Anthropic** | Claude 3.5 Sonnet | ✅ | Alternativa a OpenAI |
| **Gemini** | Gemini 1.5 Pro | ✅ | Multimodal |
| **Simulator** | N/A | ✅ | Testing sin API |

#### 1.3.2 Proveedores de Embeddings

| Provider | Modelo | Dimensiones |
|----------|--------|-------------|
| **OpenAI** | text-embedding-3-small | 1536 |
| **Ollama** | nomic-embed-text | 768 |
| **Simulator** | N/A (vectores aleatorios) | Testing |

### 1.4 Sistema de Créditos Prepagos

El sistema de créditos permite a los creadores Pro extender sus límites de IA sin suscripción fija.

#### 1.4.1 Packages Disponibles

| Package | Créditos | Precio ARS | Precio USD | Por crédito |
|---------|----------|-----------|-----------|-------------|
| **Básico** | 500 | $4,000 | $2 | $0.004 |
| **Standard** ⭐ | 2,000 | $14,000 | $7 | $0.0035 |
| **Pro** | 5,000 | $30,000 | $15 | $0.003 |

#### 1.4.2 Características

| Feature | Detalle |
|---------|---------|
| **Validez** | 12 meses desde la compra |
| **Acumulación** | Sí, los créditos no usados se acumulan |
| **No resetean** | A diferencia de suscripciones, no se pierden al mes |
| **Uso** | Tutor AI, Q&A Agent, Insights AI |
| **Transferencia** | No transferibles entre usuarios |

#### 1.4.3 Modelo de Datos

```sql
-- Saldo de créditos AI por usuario
CREATE TABLE ai_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance INT DEFAULT 0 CHECK (balance >= 0),
    total_purchased INT DEFAULT 0,
    total_used INT DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Historial de transacciones de créditos
CREATE TABLE ai_credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (
        type IN ('purchase', 'usage', 'expired', 'refund', 'bonus')
    ),
    amount INT NOT NULL,
    balance_after INT NOT NULL,
    description TEXT,
    related_order_id UUID, -- Si fue por compra
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Packages de créditos disponibles
CREATE TABLE ai_credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    credits INT NOT NULL,
    price_ars DECIMAL(18,2) NOT NULL,
    price_usd DECIMAL(18,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seeds de packages
INSERT INTO ai_credit_packages (code, name, credits, price_ars, price_usd) VALUES
('CREDITS_BASIC', 'Básico', 500, 4000.00, 2.00),
('CREDITS_STANDARD', 'Standard', 2000, 14000.00, 7.00),
('CREDITS_PRO', 'Pro', 5000, 30000.00, 15.00);

-- Índices
CREATE INDEX idx_credits_user ON ai_credits(user_id);
CREATE INDEX idx_credit_tx_user ON ai_credit_transactions(user_id);
CREATE INDEX idx_credit_tx_created ON ai_credit_transactions(created_at DESC);
```

#### 1.4.4 Flujo de Uso

```
┌─────────────┐      ┌─────────────┐     ┌─────────────┐
│  Usuario    │      │   Sistema   │     │  MercadoPago│
└──────┬──────┘      └──────┬──────┘     └──────┬──────┘
       │                    │                   │
       │  Consultar saldo   │                   │
       │───────────────────>│                   │
       │                    │                   │
       │  Respuesta         │                   │
       │<────────────────── │                   │
       │                    │                   │
       │  Usar 1 crédito    │                   │
       │───────────────────>│                   │
       │                    │  Verificar balance│
       │                    │──────────────────>│
       │                    │                   │
       │                    │  Balance OK       │
       │                    │<──────────────────│
       │                    │                   │
       │                    │  Decrementar      │
       │                    │──────────────────>│
       │                    │                   │
       │  Confirmación      │                   │
       │<────────────────── │                   │
```

#### 1.4.5 API de Créditos

```typescript
// services/ai/ai-credits.service.ts
interface CreditInfo {
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  expiresAt: Date | null;
}

class AiCreditsService {
  
  // Consultar saldo
  async getBalance(userId: string): Promise<CreditInfo>;
  
  // Usar crédito (atómico)
  async useCredits(userId: string, amount: number = 1): Promise<boolean> {
    if (amount <= 0) {
      throw new AppError('INVALID_AMOUNT', 400);
    }
    const credits = await this.getBalance(userId);
    
    if (!credits || credits.balance < amount) {
      throw new AppError('Créditos insuficientes', 402);
    }
    
    const result = await pool.query(`
      UPDATE ai_credits 
      SET balance = balance - $1, 
          total_used = total_used + $1,
          updated_at = NOW()
      WHERE user_id = $2 AND balance >= $1
      RETURNING balance
    `, [amount, userId]);
    
    if (result.rowCount === 0) {
      throw new AppError('Créditos insuficientes (race condition)', 402);
    }
    
    await this.logTransaction(userId, 'usage', -amount, result.rows[0].balance);
    
    return true;
  }
  
    // Agregar créditos (post-pago)
    async addCredits(userId: string, packageId: string): Promise<void> {
      const pkg = await this.getPackage(packageId);
      const expiresAt = addMonths(new Date(), 12);

      // Obtener balance actual ANTES del upsert para calcular balance_after correcto
      const current = await this.getBalance(userId);
      const balanceBefore = current.balance || 0;

      await pool.query(`
        INSERT INTO ai_credits (user_id, balance, total_purchased, expires_at)
        VALUES ($1, $2, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          balance = ai_credits.balance + $2,
          total_purchased = ai_credits.total_purchased + $2,
          expires_at = COALESCE(GREATEST(ai_credits.expires_at, $3), $3)
      `, [userId, pkg.credits, expiresAt]);

      const balanceAfter = balanceBefore + pkg.credits;
      await this.logTransaction(userId, 'purchase', pkg.credits, balanceAfter);
    }
  
  // Expirar créditos vencidos (job diario)
  async expireOldCredits(): Promise<void> {
    await pool.query(`
      INSERT INTO ai_credit_transactions (user_id, type, amount, balance_after, description)
      SELECT user_id, 'expired', balance, 0, 'Créditos expirados'
      FROM ai_credits
      WHERE expires_at < NOW() AND balance > 0
    `);
    
    await pool.query(`
      UPDATE ai_credits SET balance = 0 WHERE expires_at < NOW()
    `);
  }
}
```

### 1.5 Premisas del Sistema

| Premisa | Valor |
|---------|-------|
| **Todos los usuarios pueden preguntar** | Sí (registrados) |
| **Solo compradores pueden hacer reviews** | Sí (verified purchase) |
| **Q&A visible para todos** | Sí (pre-compra) |
| **Reviews visibles en producto** | Sí (configurable por creator) |
| **Denuncias anónimas** | No (debe identificarse) |
| **Retención de fondos por fraude** | Sí (hasta 90 días) |

---

## 2. Fase 1: Memory + Q&A + Reviews + Denuncias

> ⚠️ **NOTA**: El Crema Memory Service es la BASE de toda la inteligencia artificial. Debe implementarse PRIMERO antes de cualquier feature que use IA.

---

### 2.0 Crema Memory Service ⭐ PRIORIDAD 1

#### 2.0.1 Visión

Servicio centralizado de memoria persistente que alimenta **TODAS** las funcionalidades AI de la plataforma. Evita repetir tokens enviando solo contexto relevante.

#### 2.0.2 Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                    CREMA MEMORY SERVICE                         │
│                 (Servicio Central de Memoria)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│   │  Tutor AI   │  │  Q&A Agent  │  │Reports Agent│             │
│   │  (Students) │  │  (Auto-ans) │  │  (Triage)   │             │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│          │                │                │                    │
│          └────────────────┼────────────────┘                    │
│                           │                                     │
│                           ▼                                     │
│                  ┌──────────────────┐                           │
│                  │  CREMA MEMORY    │                           │
│                  │     MCP          │                           │
│                  └────────┬─────────┘                           │
│                           │                                     │
│          ┌────────────────┼────────────────┐                    │
│          ▼                ▼                ▼                    │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│   │  Lessons    │ │    FAQ      │ │   Policy    │               │
│   │  (Embed)    │ │  (Embed)    │ │  (Embed)    │               │
│   └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                 │
│   ┌─────────────────────────────────────────────────────┐       │
│   │  Insights AI (Dashboards) - Guardado de queries     │       │
│   │  source_type: 'insight' | 'saved_dashboard'         │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 2.0.3 Casos de Uso

| Módulo | Cómo usa la memoria | Contexto recuperado |
|--------|-------------------|---------------------|
| **Tutor AI** | Responder preguntas de estudiantes | Lecciones del curso |
| **Q&A Agent** | Auto-responder preguntas FAQs | FAQs del producto + Lecciones |
| **Reports Agent** | Clasificar denuncias | Políticas de contenido |
| **Analytics Insights** | Generar insights automáticos | Historial de conversaciones |

#### 2.0.4 Modelo de Datos

```sql
-- Tabla unificada de embeddings para TODA la plataforma
CREATE TABLE ai_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificación del source
    source_type VARCHAR(20) NOT NULL, -- 'lesson', 'faq', 'policy', 'qa', 'review'
    source_id VARCHAR(100) NOT NULL,  -- ID del objeto original
    product_id UUID REFERENCES products(id), -- Puede ser null para políticas globales
    creator_id UUID REFERENCES users(id), -- Quién creó el contenido
    
    -- Contenido
    content_text TEXT NOT NULL,       -- Texto original para display
    content_hash VARCHAR(64) NOT NULL, -- Para invalidación
    title VARCHAR(255),               -- Título para referencia
    
    -- Embedding (pgvector - 1536 dimensiones para text-embedding-3-small)
    embedding vector(1536),
    
    -- Metadatos específicos por tipo
    metadata JSONB DEFAULT '{}',       -- {
                                        --   lesson: { moduleTitle, orderIndex, duration },
                                        --   faq: { orderIndex },
                                        --   policy: { version, category },
                                        --   qa: { isAnswered, votes },
                                        --   review: { rating, isPublic }
                                        -- }
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(source_type, source_id)
);

-- Índices optimizados para búsqueda
CREATE INDEX idx_embeddings_source ON ai_embeddings(source_type);
CREATE INDEX idx_embeddings_product ON ai_embeddings(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_embeddings_creator ON ai_embeddings(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX idx_embeddings_search ON ai_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_embeddings_updated ON ai_embeddings(updated_at DESC);

-- Habilitar pgvector (ejecutar como superuser)
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 2.0.5 API del Servicio

```typescript
// services/ai/crema-memory.service.ts

interface EmbeddingSource {
  type: 'lesson' | 'faq' | 'policy' | 'qa' | 'review' | 'insight' | 'saved_dashboard';
  id: string;
  productId?: string;
  creatorId?: string;
  content: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

interface MemoryQuery {
  query: string;
  sources?: EmbeddingSource['type'][]; // Filtrar por tipo
  productId?: string;
  creatorId?: string;
  limit?: number;
  threshold?: number; // Similitud mínima (0.0 - 1.0)
}

interface MemoryResult {
  source: {
    type: EmbeddingSource['type'];
    id: string;
    productId?: string;
    title?: string;
  };
  content: string;
  similarity: number; // 0.0 - 1.0
  metadata: Record<string, unknown>;
}

class CremaMemoryService {
  
  // ==========================================
  // INGESTIÓN: Guardar embeddings
  // ==========================================
  
  /**
   * Genera embedding y guarda en base de datos
   * Solo re-embebe si el contenido cambió (usando content_hash)
   */
  async embed(source: EmbeddingSource): Promise<{ embedded: boolean; tokens: number }>;
  
  /**
   * Batch insert para eficiente cuando se crean/actualizan muchos items
   */
  async embedBatch(sources: EmbeddingSource[]): Promise<{ count: number; errors: Error[] }>;
  
  /**
   * Verifica si necesita re-embebido comparando hashes
   */
  async needsReembed(
    type: EmbeddingSource['type'],
    id: string,
    content: string
  ): Promise<boolean>;
  
  /**
   * Elimina embedding (cuando se borra contenido)
   */
  async deleteEmbedding(type: EmbeddingSource['type'], id: string): Promise<void>;
  
  // ==========================================
  // RECUPERACIÓN: Buscar contexto
  // ==========================================
  
  /**
   * Búsqueda semántica con filtros opcionales
   * Retorna resultados ordenados por similitud
   */
  async retrieve(query: MemoryQuery): Promise<MemoryResult[]>;
  
  /**
   * Versión optimizada para Tutor AI
   * Filtra por producto y limita a top-k resultados
   */
  async retrieveForTutor(
    productId: string,
    question: string,
    topK?: number
  ): Promise<MemoryResult[]>;
  
  // ==========================================
  // ADMINISTRACIÓN
  // ==========================================
  
  /**
   * Reconstruye todos los embeddings de un producto
   * Usado cuando hay cambios masivos en contenido
   */
  async rebuildProductIndex(productId: string): Promise<{ embedded: number }>;
  
  /**
   * Reconstruye embeddings de políticas globales
   */
  async rebuildGlobalPolicies(): Promise<{ embedded: number }>;
  
  /**
   * Stats de embeddings por producto
   */
  async getProductMemoryStats(productId: string): Promise<{
    totalEmbeddings: number;
    byType: Record<EmbeddingSource['type'], number>;
    lastUpdated: Date;
  }>;
}
```

#### 2.0.6 Hooks de Sincronización

```typescript
// hooks/sync-embeddings.ts

// Cuando se crea/actualiza una lección
async function onLessonChange(lesson: Lesson, action: 'create' | 'update' | 'delete') {
  if (action === 'delete') {
    await memoryService.deleteEmbedding('lesson', lesson.id);
  } else {
    const content = formatLessonContent(lesson);
    if (await memoryService.needsReembed('lesson', lesson.id, content)) {
      await memoryService.embed({
        type: 'lesson',
        id: lesson.id,
        productId: lesson.productId,
        creatorId: lesson.product?.creatorId,
        content,
        title: lesson.title,
        metadata: {
          moduleTitle: lesson.module?.title,
          orderIndex: lesson.orderIndex,
          durationSeconds: lesson.durationSeconds,
        }
      });
    }
  }
}

// Cuando se crea/actualiza una FAQ
async function onFaqChange(faq: ProductFaq, action: 'create' | 'update' | 'delete') {
  if (action === 'delete') {
    await memoryService.deleteEmbedding('faq', faq.id);
  } else {
    const content = `Pregunta: ${faq.question}\nRespuesta: ${faq.answer}`;
    await memoryService.embed({
      type: 'faq',
      id: faq.id,
      productId: faq.productId,
      creatorId: faq.product?.creatorId,
      content,
      title: faq.question,
      metadata: { orderIndex: faq.orderIndex }
    });
  }
}

// Cuando se crea una Q&A (para auto-respuesta futura)
async function onQuestionCreated(question: ProductQuestion) {
  await memoryService.embed({
    type: 'qa',
    id: question.id,
    productId: question.productId,
    creatorId: question.product?.creatorId,
    content: `Pregunta: ${question.question}`,
    title: question.question.substring(0, 50),
    metadata: { isAnswered: question.isAnswered }
  });
}

// Políticas globales (solo admin)
async function onPolicyChange(policy: ContentPolicy, action: 'create' | 'update' | 'delete') {
  if (action === 'delete') {
    await memoryService.deleteEmbedding('policy', policy.id);
    return;
  }
  if (action === 'update') {
    await memoryService.deleteEmbedding('policy', policy.id);
  }
  await memoryService.embed({
    type: 'policy',
    id: policy.id,
    content: `${policy.title_es}\n${policy.content_es}`,
    title: policy.title_es,
    metadata: { version: policy.version, category: policy.category }
  });
}
```

#### 2.0.7 Cálculo de Costos y Ahorro

| Escenario | Sin Memoria | Con Memoria |
|-----------|-------------|-------------|
| **Tokens por pregunta** | ~3,100 | ~500-800 |
| **Costo por pregunta** | $0.000465 | $0.000075-0.00012 |
| **100 preguntas/mes** | $0.0465 | $0.0075-0.012 |
| **Ahorro** | - | **~75-84%** |

**Costo total AI para 30 usuarios Pro:**

| Métrica | Valor |
|---------|-------|
| Mensajes/mes | 3,000 (30 users × 100) |
| Costo sin memoria | ~$1.40/mes |
| Costo con memoria | ~$0.22/mes |
| **Ahorro anual** | **~$14 USD/año** |

#### 2.0.8 Dependencias Técnicas

```bash
# Agregar pgvector a PostgreSQL
# PostgreSQL 15+ ya soporta vector type

# npm packages necesarios
npm install @types/pg pgvector
```

---

### 2.1 Sistema de Q&A

#### 2.1.1 Descripción

Permite que compradores y visitantes hagan preguntas sobre un producto, y que el creador responda públicamente.

#### 2.1.2 User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| Q&A-01 | Visitante | ver las preguntas y respuestas de un producto | resolver dudas antes de comprar |
| Q&A-02 | Usuario registrado | hacer una pregunta sobre un producto | resolver dudas antes de comprar |
| Q&A-03 | Creador | responder preguntas de usuarios | generar confianza y ventas |
| Q&A-04 | Creador | eliminar preguntas inapropiadas | moderar mi producto |
| Q&A-05 | Usuario | marcar respuesta como útil | ayudar a otros usuarios |

#### 2.1.3 Modelos de Datos

```sql
-- Tabla de preguntas
CREATE TABLE product_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    parent_id UUID REFERENCES product_questions(id), -- Para respuestas
    is_answered BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE, -- Visible en página del producto
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de votos de utilidad
CREATE TABLE question_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(question_id, user_id) -- Un voto por usuario por pregunta
);

-- Tabla de FAQ predefinidas por creador
CREATE TABLE product_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    order_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.1.4 Flujos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Visitor   │     │   Buyer     │     │   Creator   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Ver Q&A          │  Hacer pregunta   │  Responder
       │──────────────────>│─────────────────> │
       │                   │                   │
       │                   │  Notificación     │
       │                   │<───────────────── │
       │                   │                   │
       │  Ver respuesta    │                   │
       │<──────────────────│                   │
       │                   │                   │
```

#### 2.1.5 Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **Quién puede preguntar** | Cualquier usuario registrado |
| **Quién puede responder** | Solo el creador del producto |
| **Visibilidad** | Por defecto pública (visible en producto) |
| **Edición** | Solo dentro de 24 horas de creación |
| **Eliminación** | Creador puede eliminar; admin puede ocultar |
| **Votos útiles** | Un voto por usuario por pregunta |

#### 2.1.6 Notificaciones

| Evento | Destinatario | Canal |
|--------|--------------|-------|
| Nueva pregunta | Creador | Email + In-app |
| Nueva respuesta | Preguntador | Email + In-app |
| Marcar útil | Creador | In-app only |

---

### 2.2 Sistema de Reviews/Ratings

#### 2.2.1 Descripción

Permite que compradores califiquen y reseñen productos que adquirieron.

#### 2.2.2 User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| REV-01 | Comprador | calificar un producto con estrellas | expresar mi satisfacción |
| REV-02 | Comprador | escribir una reseña | compartir mi experiencia |
| REV-03 | Comprador | editar/eliminar mi reseña | corregir errores |
| REV-04 | Creador | mostrar/ocultar reviews en mi producto | controlar presentación |
| REV-05 | Visitante | ver reviews de un producto | decidir si comprar |
| REV-06 | Admin | eliminar reviews inapropiadas | moderar contenido |

#### 2.2.3 Modelos de Datos

```sql
-- Tabla de reviews
CREATE TABLE product_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(100),
    content TEXT,
    is_verified_purchase BOOLEAN DEFAULT TRUE, -- Verifica que compró
    is_public BOOLEAN DEFAULT TRUE, -- Visible en producto
    is_featured BOOLEAN DEFAULT FALSE, -- Destacada por creator
    helpful_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(product_id, user_id) -- Un review por usuario por producto
);

-- Tabla de votos útiles en reviews
CREATE TABLE review_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(review_id, user_id)
);

-- Tabla de configuración de reviews por producto
CREATE TABLE product_review_settings (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    reviews_enabled BOOLEAN DEFAULT TRUE,
    show_in_product_page BOOLEAN DEFAULT TRUE,
    require_verified_purchase BOOLEAN DEFAULT TRUE,
    min_purchase_days INT DEFAULT 0, -- Días desde compra para hacer review
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2.2.4 Flujos

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Buyer     │     │   Creator   │     │   Visitor   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Hacer review     │                   │
       │─────────────────> │                   │
       │  (7 días post)    │                   │
       │                   │                   │
       │                   │  Config mostrar   │
       │                   │─────────────────> │
       │                   │                   │
       │                   │                   │  Ver reviews
       │                   │                   │<─────────────────
```

#### 2.2.5 Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **Quién puede hacer review** | Solo compradores con order status='paid' |
| **Timing** | Disponible 7 días después de compra |
| **Una review por producto** | Sí (un usuario, un producto) |
| **Edición** | Solo el autor, dentro de 30 días |
| **Eliminación** | Autor o admin |
| **Rating** | 1-5 estrellas (obligatorio) |
| **Contenido** | Título (opcional, 100 chars) + Texto (opcional) |
| **Configuración** | Creator puede deshabilitar reviews |

#### 2.2.6 Cálculo de Rating Promedio

```sql
-- Vista materializada para performance
CREATE MATERIALIZED VIEW product_rating_summary AS
SELECT 
    product_id,
    COUNT(*) as review_count,
    AVG(rating)::DECIMAL(3,2) as avg_rating,
    COUNT(*) FILTER (WHERE rating >= 4) as positive_count,
    COUNT(*) FILTER (WHERE rating <= 2) as negative_count
FROM product_reviews
WHERE is_public = TRUE
GROUP BY product_id;

CREATE UNIQUE INDEX ON product_rating_summary(product_id);
```

#### 2.2.7 Notificaciones

| Evento | Destinatario | Canal |
|--------|--------------|-------|
| Nueva review | Creador | Email + In-app |
| Review eliminada | Autor | Email |
| Review reportada | Admin | In-app only |

---

### 2.3 Sistema de Denuncias

#### 2.3.1 Descripción

Canal formal para reportar contenido inapropiado, fraude o violaciones de términos.

#### 2.3.2 User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| DEN-01 | Usuario | denunciar un producto | reportar contenido inapropiado |
| DEN-02 | Usuario | denunciar un creador | reportar comportamiento fraudulento |
| DEN-03 | Admin | revisar denuncias | tomar acciones apropiadas |
| DEN-04 | Admin | retener fondos | proteger plataforma de fraude |
| DEN-05 | Creador | ver denuncias sobre mi producto | entender quejas |

#### 2.3.3 Modelo de Datos

```sql
-- Tabla de motivos de denuncia
CREATE TABLE report_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'review', 'question', 'answer', 'faq', 'user')),
    code VARCHAR(50) NOT NULL,
    label_es VARCHAR(100) NOT NULL,
    label_en VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(content_type, code)
);

-- Tabla de denuncias
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('product', 'review', 'question', 'answer', 'faq', 'user')),
    content_id UUID NOT NULL,
    reason_code VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'rejected')),
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de historial de acciones sobre denuncias
CREATE TABLE report_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de políticas de contenido
CREATE TABLE content_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title_es VARCHAR(200) NOT NULL,
    title_en VARCHAR(200) NOT NULL,
    content_es TEXT NOT NULL,
    content_en TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    version INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    effective_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seeds de motivos predefinidos
INSERT INTO report_reasons (content_type, code, label_es, label_en, severity) VALUES
('product', 'copyright', 'Contenido con derechos de autor', 'Copyrighted content', 'high'),
('product', 'fraud', 'Estafa o fraude', 'Fraud or scam', 'critical'),
('product', 'misleading', 'Información engañosa', 'Misleading information', 'high'),
('product', 'harassment', 'Acoso o contenido dañino', 'Harassment or harmful content', 'critical'),
('product', 'spam', 'Spam o publicidad masiva', 'Spam or mass advertising', 'low'),
('product', 'inappropriate', 'Contenido inapropiado', 'Inappropriate content', 'high'),
('product', 'technical_issue', 'Problema técnico con el producto', 'Technical issue with product', 'low'),
('product', 'refund_abuse', 'Abuso de política de reembolso', 'Refund policy abuse', 'high'),
('product', 'not_as_described', 'No corresponde con la descripción', 'Not as described', 'high'),
('product', 'malware', 'Software malicioso', 'Malware or malicious software', 'critical'),
('review', 'fake_review', 'Reseña falsa', 'Fake review', 'high'),
('review', 'offensive_review', 'Reseña ofensiva', 'Offensive review', 'medium'),
('review', 'competitor_review', 'Reseña de competidor', 'Competitor review', 'medium');
```

#### 2.3.4 Políticas de Contenido

**Responsible Use Policy** (para Crema):

1. **Productos Prohibidos**:
   - Contenido que infrinja derechos de autor
   - Estafas o esquemas piramidales
   - Contenido para actividades ilegales
   - Hate speech o acoso
   - Pornografía explícita

2. **Acciones por Violación**:
   - **Level 1 (Spam, Technical)**: Warning + corrección
   - **Level 2 (Copyright, Misleading)**: Contenido removido + Warning
   - **Level 3 (Fraud, Harassment)**: Suspensión + Retención de fondos

#### 2.3.5 Retención de Fondos

```typescript
// Lógica de retención de fondos
const RETENTION_POLICIES = {
  suspected_fraud: {
    reason: 'suspected_fraud',
    maxDays: 90,
    notifyUser: true,
    canWithdrawDuringRetention: false,
  },
  chargeback_risk: {
    reason: 'chargeback_risk',
    maxDays: 60,
    notifyUser: true,
    canWithdrawDuringRetention: false,
  },
  investigation: {
    reason: 'investigation',
    maxDays: 30,
    notifyUser: true,
    canWithdrawDuringRetention: false,
  },
};
```

#### 2.3.6 Flujo de Denuncia

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │   Admin     │     │   System    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Crear denuncia   │                   │
       │─────────────────> │                   │
       │                   │                   │
       │                   │  Notificar admin  │
       │                   │<──────────────────│
       │                   │                   │
       │                   │  Revisar caso     │
       │                   │──────────────────>│
       │                   │                   │
       │  Email resumen    │  Si fraude:       │
       │<──────────────────│  Retener fondos   │
       │                   │──────────────────>│
```

#### 2.3.7 Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **Quién puede denunciar** | Cualquier usuario registrado |
| **Identificación** | No anónimo (debe estar logueado) |
| **Evidencia** | Opcional pero recomendado |
| **Límite** | 5 denuncias por usuario por día |
| **Retención fondos** | Hasta 90 días si hay investigación activa |
| **Notificación** | Creator informado si su producto es denunciado |

#### 2.3.8 Notificaciones

| Evento | Destinatario | Canal |
|--------|--------------|-------|
| Denuncia creada | Admin | In-app + Email |
| Denuncia asignada | Admin asignado | In-app |
| Resolución | Denunciante | Email |
| Acción en producto | Creador | Email |
| Retención de fondos | Creador | Email |

---

### 2.4 Agentes IA

#### 2.4.1 Agente Q&A (Creador entrena)

| Aspecto | Detalle |
|---------|---------|
| **Qué hace** | Responde automáticamente preguntas de estudiantes |
| **Quién lo entrena** | Creador (sube docs, configura, aprueba) |
| **Nivel de autonomía** | Configurable: Auto-respuesta vs Sugerencia |
| **Usa** | Crema Memory Service (lecciones + FAQs) |
| **Flujo** | Pregunta → AI responde → Creador revisa/editar → Publica |

**Configuraciones posibles:**
```
┌─────────────────────────────────────────────────────┐
│  Configuración Tutor Q&A                            │
├─────────────────────────────────────────────────────┤
│  Modo:  ○ Auto-respuesta completa                   │
│          ○ Sugerencia (creador aprueba)             │
│          ○ Solo FAQ (búsqueda)                      │
│                                                     │
│  Entrenamiento:                                     │
│  ☑ Usar contenido del curso                        │
│  ☑ Usar FAQ que cree                               │
│  ☐ Subir documentos adicionales (.pdf, .txt)        │
│                                                     │
│  Comportamiento:                                    │
│  ○ Solo responder si está seguro                    │
│  ○ Responder siempre con disclaimer                 │
│  ○ Solo sugerir respuestas al creador               │
└─────────────────────────────────────────────────────┘
```

#### 2.4.2 Agente Denuncias (Admin entrena)

| Aspecto | Detalle |
|---------|---------|
| **Qué hace** | Triage automático + Respuesta inicial |
| **Quién lo entrena** | Admin de Crema (políticas, respuestas estándar) |
| **Usa** | Crema Memory Service (políticas) |
| **Flujo** | Denuncia → AI clasifica (severity) → Respuesta automática → Admin revisa |

**Triage automático:**
```
Denuncia recibida
       │
       ▼
┌──────────────────┐
│  Clasificador IA │
│  - Motivo?       │
│  - Severity?     │
│  - ¿Es spam?     │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────┐
│  Severity 1 (Spam/Fácil)             │
│  → Respuesta automática              │
│  → Resuelto sin intervención         │
├──────────────────────────────────────┤
│  Severity 2 (Requiere revisión)      │
│  → Notificar admin                   │
│  → AI sugiere resolución             │
├──────────────────────────────────────┤
│  Severity 3 (Fraude/Complejo)        │
│  → Alertar admin urgent              │
│  → AI prepara análisis               │
│  → Retención de fondos si aplica     │
└──────────────────────────────────────┘
```

#### 2.4.3 Modelo de Implementación

```typescript
// services/ai/qa-agent.service.ts
class QAAgentService {
  async generateAutoResponse(
    question: string,
    productId: string,
    mode: 'auto' | 'suggest' | 'faq-only'
  ): Promise<{
    response?: string;
    confidence: number;
    sources: MemoryResult[];
  }> {
    // 1. Buscar contexto en memoria
    const context = await memoryService.searchSimilar(null, question, 3, ['lesson', 'faq']);
    
    if (context.length === 0 && mode === 'faq-only') {
      return { confidence: 0, sources: [] };
    }
    
    // 2. Generar respuesta con contexto
    const messages = [
      { role: 'system', content: QA_AGENT_PROMPT },
      { role: 'system', content: `Contexto relevante:\n${formatContext(context)}` },
      { role: 'user', content: question },
    ];
    
    const response = await llmService.chat({
      messages,
      model: config.ai.openaiModel,
      temperature: 0.7,
      maxTokens: 300,
    });
    
    const answer = response.content;
    const confidence = await this.estimateConfidence(answer, context);
    
    if (mode === 'auto' && confidence >= 0.7) {
      return { response: answer, confidence, sources: context };
    } else if (mode === 'suggest') {
      return { response: answer, confidence, sources: context };
    }
    
    return { confidence, sources: context };
  }
}

// services/ai/reports-agent.service.ts  
class ReportsAgentService {
  async triageReport(
    description: string,
    evidenceUrls: string[]
  ): Promise<{
    suggestedReason?: string;
    severity: 1 | 2 | 3;
    isSpam: boolean;
    suggestedAction?: string;
  }> {
    // 1. Buscar políticas relevantes (skip if description is empty)
    const policies = description.trim().length > 0
      ? await memoryService.searchSimilar(null, description, 3, ['policy'])
      : [];
    
    // 2. Clasificar con IA
    const classification = await llmService.chat({
      model: config.ai.openaiModel,
      messages: [
        { role: 'system', content: REPORTS_TRIAGE_PROMPT },
        { role: 'system', content: `Políticas relevantes:\n${formatPolicies(policies)}` },
        { role: 'user', content: `Denuncia: ${description}` },
      ],
    });
    
    try {
      return JSON.parse(classification.content);
    } catch {
      return { severity: 2, isSpam: false, suggestedAction: 'no_action' };
    }
  }
}
```

### 2.5 Agente de Implementación Interactiva (Talleres Dinámicos) ⭐

#### 2.5.1 Visión

Permite que el comprador cargue sus datos específicos (caso práctico) en cada módulo y reciba análisis personalizado de la IA basado en SU realidad. Transforma cursos pasivos en **herramientas de implementación**.

> **Ejemplo:** Curso "Cómo montar una cafetería"
> - Módulo 1: El alumno carga su ubicación, costo de alquiler
> - Módulo 2: La IA analiza y le da su punto de equilibrio personalizado
> - Al final: Tiene su **Business Plan listo**, no solo un certificado

#### 2.5.2 Tipos de Producto Soportados

| Producto | Datos que carga | Análisis que recibe |
|----------|---------------|----------------|
| **course** | Variables de su negocio | Punto de equilibrio, recomendaciones |
| **ebook** | Respuestas a ejercicios | Feedback personalizado |
| **membership** | Objetivos y perfil | Plan personalizado |
| **software** | Configuración actual | Guía de setup paso a paso |

#### 2.5.3 User Stories

| ID | Historia | Criterio de Aceptación |
|----|---------|---------------------|
| US-INT-01 | Como comprador, quiero cargar mis datos en cada módulo | El sistema guarda los datos y confirma con mensaje de éxito |
| US-INT-02 | Como comprador, quiero recibir análisis personalizado | La IA responde basado en MIS datos, no genérico |
| US-INT-03 | Como comprador, quiero ver mi progreso en el "Centro de Control" | Dashboard muestra metas completadas con analytics |
| US-INT-04 | Como creador, quiero configurar qué datos se piden | El creator define los campos requeridos por módulo |
| US-INT-05 | Como creador, quiero ver los datos de mis alumnos | Dashboard agregado (anonimizado) con tendencias |

#### 2.5.4 Modelo de Datos

```sql
-- Tabla principal: datos del usuario por producto/módulo
CREATE TABLE user_course_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL,  -- ej: "modulo_1_finanzas"
  input_data JSONB NOT NULL DEFAULT '{}',  -- { "alquiler": 50000, "leche": 120 }
  output_analysis JSONB,  -- { "punto_equilibrio": 45, "margen": 0.25 }
  completed_at TIMESTAMPTZ,  -- Timestamp cuando el usuario completó el módulo (todos los campos + análisis generado)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uk_user_product_module UNIQUE (user_id, product_id, module_key)
);

-- Trigger para actualizar updated_at automáticamente (PostgreSQL)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_course_data_updated_at
    BEFORE UPDATE ON user_course_data
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Índice para analytics del creador (no para lookup - el UNIQUE constraint ya lo hace)
CREATE INDEX idx_user_course_data_creator 
  ON user_course_data (product_id, created_at);

-- Tabla: configuración de campos por módulo (para el creador)
CREATE TABLE product_module_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL,  -- "number", "string", "boolean", "select"
  field_label VARCHAR(255) NOT NULL,
  field_placeholder VARCHAR(255),
  field_options JSONB,  -- Para tipo "select": [{ "value": "x", "label": "X" }]
  field_required BOOLEAN DEFAULT true,
  field_validation JSONB,  -- { "min": 0, "max": 100 }
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT uk_product_module_field UNIQUE (product_id, module_key, field_name)
);

-- Trigger para actualizar updated_at automáticamente
CREATE TRIGGER product_module_fields_updated_at
    BEFORE UPDATE ON product_module_fields
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

#### 2.5.5 Skills (Herramientas del Agente)

```typescript
// Skill: analyze_user_case_study
const analyzeUserCaseStudy = {
  name: 'analyze_user_case_study',
  description: 'Analiza los datos específicos del usuario y devuelve insights personalizados',
  input: {
    type: 'object',
    properties: {
      product_id: { type: 'string', description: 'ID del producto' },
      module_key: { type: 'string', description: 'Clave del módulo' },
      user_data: { type: 'object', description: 'Datos cargados por el usuario' }
    },
    required: ['product_id', 'module_key', 'user_data']
  },
  output: {
    type: 'object',
    properties: {
      analysis: { type: 'string', description: 'Análisis personalizado' },
      recommendations: { type: 'array', description: 'Lista de recomendaciones' },
      next_steps: { type: 'array', description: 'Próximos pasos sugeridos' },
      metrics: { type: 'object', description: 'Métricas calculadas' }
    }
  }
};

// Skill: get_user_case_study
const getUserCaseStudy = {
  name: 'get_user_case_study',
  description: 'Recupera los datos que el usuario cargó en módulos anteriores',
  input: {
    type: 'object',
    properties: {
      user_id: { type: 'string', description: 'ID del usuario' },
      product_id: { type: 'string', description: 'ID del producto' },
      module_key: { type: 'string', description: 'Clave del módulo (opcional, empty = todos)' }
    },
    required: ['user_id', 'product_id']
  },
  output: {
    type: 'object',
    properties: {
      modules: { 
        type: 'array', 
        items: {
          module_key: { type: 'string' },
          input_data: { type: 'object' },
          output_analysis: { type: 'object' },
          updated_at: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
};
```

#### 2.5.6 API Endpoints

| Método | Endpoint | Descripción | Auth | Request Body |
|--------|----------|------------|-------|--------------|
| POST | `/ai/interactive/analyze` | Analiza datos del usuario | Usuario | `{ "productId": "uuid", "moduleKey": "string", "inputData": {} }` |
| GET | `/ai/interactive/data/:productId` | Obtiene mis datos guardados | Usuario | - |
| PUT | `/ai/interactive/data/:productId/:moduleKey` | Guarda inputs del usuario | Usuario | `{ "inputData": { "campo1": "valor" } }` |
| GET | `/ai/interactive/fields/:productId` | Campos configurados por el creator | Creador | - |
| POST | `/ai/interactive/fields/:productId` | Configura campos por módulo | Creador (owner) | `{ "moduleKey": "string", "fields": [{ "fieldName": "string", "fieldType": "string", "fieldLabel": "string" }] }` |
| GET | `/ai/interactive/analytics/:productId` | Datos agregados de alumnos | Creador (owner) | - |

#### Códigos de Respuesta

| Código | Descripción |
|--------|-------------|
| 200 | Éxito |
| 400 | Bad Request (validación fallida) |
| 401 | No autenticado |
| 403 | No autorizado (no owner/del producto) |
| 404 | Producto o módulo no encontrado |
| 429 | Rate limit excedido |
| 500 | Error interno del servidor |

#### 2.5.7 Seguridad

| Aspecto | Implementación |
|---------|---------------|
| **Input Validation** | Schema Zod: `moduleKey` con regex `^[a-z0-9_]+$`, `inputData` limitado a 50KB |
| **Authorization** | Verificar ownership del producto O acceso de compra |
| **Rate Limiting** | Nuevo `interactiveAgentLimiter`: 10 requests/minuto por usuario |
| **SQL Injection** | SIEMPRE queries parametrizadas |
| **Sensitive Data** | NO loggear `input_data` en errores |

```typescript
const interactiveAgentLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minuto
  max: 10,              // 10 análisis por minuto por usuario
  message: 'Demasiadas solicitudes. Intenta en un momento.',
  keyGenerator: (req) => `${req.user?.id || req.ip}:interactive`
});
```

#### 2.5.8 Performance

| Aspecto | Estratégia |
|---------|-----------|
| **Cache de Análisis** | Redis con key `analysis:{userId}:{productId}:{moduleKey}:{hash(data)}`, TTL 1 hora. **IMPORTANTE**: Siempre incluir `userId` para evitar data leaks entre usuarios. |
| **Límites por Operación** | Campos por módulo: 50, Tamaño input_data: 50KB, Análisis guardados: 1000/user |
| **Índices** | ya definidos en modelo de datos (no duplicar) |
| **Async Processing** | Para análisis complejos, usar BullMQ queue |
| **Algoritmo de Hash** | SHA256 de `JSON.stringify(userData)` para cache key |

#### 2.5.9 Modelo de Créditos

| Operación | Costo | Notas |
|-----------|-------|-------|
| Guardar datos (input) | 1 crédito | Por save |
| Análisis completo | 3-5 créditos | Depende complejidad |
| Consulta historial | 0 créditos | Reading es gratis |

---

## 3. Fase 2: Analytics + IA Avanzada

### 3.1 Dashboard Analytics

#### 3.1.1 Descripción

Dashboard unificado "My Insights" para creadores con métricas de negocio avanzadas.

#### 3.1.2 Métricas por Categoría

**A. Revenue Metrics**

| Métrica | Descripción | Fórmula |
|---------|-------------|---------|
| **Total Revenue** | Ingresos totales | SUM(commissions.net_amount) |
| **Revenue by Product** | Ingresos por producto | GROUP BY product_id |
| **Revenue by Period** | Ingresos por día/semana/mes | DATE_TRUNC |
| **Top Products** | Top 5 productos por revenue | ORDER BY revenue DESC LIMIT 5 |
| **Average Order Value** | Valor promedio de venta | AVG(order.amount) |
| **Sales Forecast** | Proyección próxima semana/mes | Basado en tendencia |

**B. Subscription Metrics**

| Métrica | Descripción | Fórmula |
|---------|-------------|---------|
| **MRR** | Monthly Recurring Revenue | SUM(active_subscriptions.price) |
| **ARR** | Annual Recurring Revenue | MRR * 12 |
| **Churn Rate** | Tasa de cancelación mensual | canceled / total_at_period_start |
| **LTV** | Lifetime Value | MRR / Churn_Rate |
| **Retention Rate** | % usuarios que mantienen suscripción | 1 - Churn_Rate |

**C. Engagement Metrics**

| Métrica | Descripción |
|---------|-------------|
| **Avg. Rating** | Calificación promedio del producto |
| **Review Count** | Total de reviews recibidas |
| **Q&A Activity** | Preguntas y respuestas del período |
| **Time to First Response** | Tiempo promedio de respuesta del creator |

#### 3.1.3 Modelo de Datos

```sql
-- Tabla de métricas diarias agregadas
CREATE TABLE creator_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    -- Revenue
    total_sales INT DEFAULT 0,
    total_revenue DECIMAL(18,8) DEFAULT 0,
    total_refunds INT DEFAULT 0,
    refund_amount DECIMAL(18,8) DEFAULT 0,
    -- Engagement
    new_reviews INT DEFAULT 0,
    avg_rating DECIMAL(3,2),
    new_questions INT DEFAULT 0,
    questions_answered INT DEFAULT 0,
    -- Subscriptions
    new_subscriptions INT DEFAULT 0,
    canceled_subscriptions INT DEFAULT 0,
    -- Calculados
    churn_rate DECIMAL(5,4),
    retention_rate DECIMAL(5,4),
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(creator_id, date)
);

CREATE VIEW creator_insights_summary AS
SELECT 
    creator_id,
    SUM(total_revenue) as lifetime_revenue,
    SUM(total_revenue) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as revenue_30d,
    SUM(new_reviews) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as reviews_30d,
    SUM(new_reviews * avg_rating) FILTER (WHERE avg_rating IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '90 days') 
      / NULLIF(SUM(new_reviews) FILTER (WHERE avg_rating IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '90 days'), 0) as avg_rating_90d,
    SUM(new_questions) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as questions_30d,
    SUM(new_subscriptions) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as new_subs_30d,
    SUM(canceled_subscriptions) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as canceled_30d
FROM creator_daily_metrics
GROUP BY creator_id;
```

---

### 3.2 Tutor AI Avanzado

#### 3.2.1 Descripción

Asistente IA que responde preguntas de estudiantes basadas en el contenido del curso. Usa Crema Memory Service para contexto optimizado.

#### 3.2.2 User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| AI-01 | Estudiante | hacer preguntas sobre el contenido | resolver dudas instantáneamente |
| AI-02 | Estudiante | ver respuestas del Tutor | aprender sin esperar al creator |
| AI-03 | Creador | entrenar el Tutor con mi contenido | ofrecer soporte 24/7 |
| AI-04 | Creador | ver insights de preguntas | entender qué confunde a estudiantes |
| AI-05 | Creador | nombrar el Tutor | personalizar la experiencia |

#### 3.2.3 Modelo de Datos

```sql
-- Configuración del Tutor por producto
CREATE TABLE product_tutor_config (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    tutor_name VARCHAR(50) DEFAULT 'Tutor',
    welcome_message TEXT,
    system_prompt TEXT,
    model_name VARCHAR(50) DEFAULT 'gpt-4o-mini',
    is_trained BOOLEAN DEFAULT FALSE,
    last_training_at TIMESTAMPTZ,
    training_status VARCHAR(20) DEFAULT 'not_started',
    training_error TEXT,
    messages_used INT DEFAULT 0,
    messages_limit INT DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversaciones con el Tutor
CREATE TABLE tutor_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mensajes individuales
CREATE TABLE tutor_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tokens_used INT,
    response_time_ms INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insights generados por IA
CREATE TABLE tutor_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    confidence_score DECIMAL(3,2),
    related_lessons JSONB DEFAULT '[]',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.2.4 Integración con Crema Memory

```typescript
// services/ai/tutor.service.ts
class TutorService {
  async chat(
    productId: string,
    userId: string,
    message: string
  ): Promise<{ response: string; tokens: number }> {
    // 1. Verificar límites
    const config = await this.getConfig(productId);
    if (config.messages_used >= config.messages_limit) {
      throw new AppError('Límite de mensajes alcanzado', 429);
    }
    
    // 2. Buscar contexto en memoria (usando Crema Memory Service)
    const context = await memoryService.searchSimilar(productId, message, 3, ['lesson', 'faq']);
    
    // 3. Obtener historial de conversación
    const history = await this.getConversationHistory(productId, userId);
    
    // 4. Generar respuesta
    const messages = [
      { role: 'system', content: this.buildPrompt(config) },
      { role: 'system', content: `Contexto del curso:\n${this.formatContext(context)}` },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message },
    ];
    
    const startTime = Date.now();
    const response = await llmService.chat({
      model: config.ai.openaiModel,
      messages,
      temperature: 0.7,
      maxTokens: 500,
    });
    
    const answer = response.content ?? '';
    const tokens = response.usage?.total_tokens ?? 0;
    const responseTime = Date.now() - startTime;
    
    // 5. Guardar en historial
    await this.saveMessage(productId, userId, message, answer, tokens, responseTime);
    
    // 6. Actualizar contador
    await this.incrementUsage(productId);
    
    return { response: answer, tokens };
  }
}
```

#### 3.2.5 Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **Disponibilidad** | Solo para productos con contenido estructurado |
| **Límite de mensajes** | 100/mes (incluido en Pro) |
| **Upsell** | Créditos prepagos (500 por $2 USD) |
| **Training** | Se actualiza cuando creator modifica contenido |
| **Fallback** | Si IA no sabe, sugiere contactar al creator |

---

### 3.3 Insights AI Agent (Dashboards Dinámicos con IA) 🤖

#### 3.3.1 Visión

Dashboards dinámicos impulsados por IA que permiten a los creadores hacer preguntas en lenguaje natural y obtener insights accionables con visualizaciones automáticas.

**Diferenciador vs Hotmart**: Hotmart ofrece dashboards estáticos. Crema ofrece dashboards inteligentes con conversación.

#### 3.3.2 User Stories

| ID | Como | quiero | para |
|----|------|--------|------|
| INS-01 | Creador | hacer preguntas en lenguaje natural | obtener insights sin saber SQL |
| INS-02 | Creador | ver gráficos automáticos | visualizar datos rápidamente |
| INS-03 | Creador | guardar dashboards útiles | acceder rápido después |
| INS-04 | Creador | recibir sugerencias de IA | saber qué preguntar |
| INS-05 | Creador | comparar períodos | ver evolución de mi negocio |

#### 3.3.3 Interfaz de Usuario

```
┌─────────────────────────────────────────────────────────────────┐
│  My Insights - Dashboard AI                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  💬 Ask Insights                                          │ │
│  │                                                            │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │ "¿Cuál fue mi mejor mes de ventas?"                │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  │                                                            │ │
│  │  💬 "Tu mejor mes fue Marzo 2026 con $450,000 ARS      │ │
│  │     en ventas. Eso representa un crecimiento del 45%      │ │
│  │     vs el mes anterior. El producto más vendido fue      │ │
│  │     'Curso de React' con 45 ventas."                    │ │
│  │                                                            │ │
│  │  📊 [Gráfico de barras: Ventas por mes]                │ │
│  │                                                            │ │
│  │  💡 Preguntas sugeridas:                                │ │
│  │     - "¿Qué productos están decayendo?"                 │ │
│  │     - "¿Cuál es mi tasa de conversión?"                  │ │
│  │     - "¿De dónde vienen mis compradores?"                │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │   💰 Revenue   │  │   ⭐ Reviews   │  │   📚 Q&A      │ │
│  │   $45,000     │  │   4.5 ★ (23)  │  │   89% resp.   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  📌 Mis Dashboards Guardados                              │ │
│  │                                                            │ │
│  │  ⭐ "Ventas por Producto"       [Ver] [Eliminar]          │ │
│  │  ⭐ "Conversión Mensual"        [Ver] [Eliminar]          │ │
│  │  ⭐ "Top Affiliates"            [Ver] [Eliminar]          │ │
│  │                                                            │ │
│  │  [+ Crear nuevo dashboard]                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.3.4 Flujo de Pregunta

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  Creador    │     │  Insights AI    │     │  Database   │
└──────┬──────┘     └────────┬────────┘     └──────┬──────┘
       │                       │                       │
       │  "¿Cuál fue mi       │                       │
       │   mejor mes?"         │                       │
       │──────────────────────>│                       │
       │                       │                       │
       │                       │  1. Clasificar intención
       │                       │───────────────────────│
       │                       │                       │
       │                       │  2. Generar SQL
       │                       │───────────────────────│
       │                       │                       │
       │                       │  3. Ejecutar query
       │                       │───────────────────────│
       │                       │                       │
       │                       │  4. Resultados
       │                       │<──────────────────────│
       │                       │                       │
       │                       │  5. Generar insight
       │                       │  + Determinar chart
       │                       │                       │
       │                       │  6. Guardar en memoria
       │                       │  (para contexto futuro)
       │                       │───────────────────────│
       │                       │                       │
       │  📊 Respuesta +      │                       │
       │  Gráfico +            │                       │
       │  Sugerencias          │                       │
       │<───────────────────────│                       │
```

#### 3.3.5 Modelo de Datos

```sql
-- Dashboards guardados por el creador
CREATE TABLE creator_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    question TEXT NOT NULL,           -- Pregunta original que generó el dashboard
    sql_query TEXT NOT NULL,          -- SQL generado
    chart_type VARCHAR(20) DEFAULT 'bar', -- 'bar', 'line', 'pie', 'table', 'number'
    config JSONB DEFAULT '{}',         -- { xAxis, yAxis, filters, etc. }
    is_favorite BOOLEAN DEFAULT FALSE,
    view_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historial de preguntas (para memoria y sugerencias)
CREATE TABLE insights_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT,
    sql_generated TEXT,
    chart_type VARCHAR(20),
    data_preview JSONB,               -- Primeros 10 resultados
    is_successful BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    credits_used INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_dashboards_creator ON creator_dashboards(creator_id);
CREATE INDEX idx_dashboards_favorite ON creator_dashboards(creator_id, is_favorite) WHERE is_favorite = TRUE;
CREATE INDEX idx_insights_creator ON insights_history(creator_id);
CREATE INDEX idx_insights_created ON insights_history(created_at DESC);
```

#### 3.3.6 Integración con Crema Memory MCP

El Insights AI Agent usa el Crema Memory Service para:

1. **Contexto del negocio**: Historial de preguntas y dashboards del creador
2. **Sugerencias personalizadas**: Basadas en qué dashboards son más útiles
3. **Optimización de tokens**: No repetir contexto, usar solo lo relevante

```typescript
// services/ai/insights-agent.service.ts
interface InsightsQuery {
  question: string;
  creatorId: string;
  productId?: string;
  period?: '7d' | '30d' | '90d' | '1y' | 'all';
}

interface InsightsResponse {
  answer: string;
  sql?: string;
  data?: Record<string, unknown>;
  chartType: 'bar' | 'line' | 'pie' | 'table' | 'number';
  suggestions?: string[];
  savedDashboardId?: string;
}

class InsightsAgentService {
  
  async askQuestion(query: InsightsQuery): Promise<InsightsResponse> {
    // 1. Usar créditos AI
    await aiCreditService.useCredits(query.creatorId, 1, 'Insight query');
    
    // 2. Buscar contexto en memoria (preguntas anteriores del creador)
    const memoryContext = await memoryService.searchSimilar(
      query.creatorId,
      query.question,
      3,
      ['insight']
    );
    
    // 3. Clasificar la intención
    const intent = await this.classifyIntent(query.question, memoryContext);
    
    // 4. Generar SQL basado en la intención
    const sql = await this.generateSQL(intent, query, memoryContext);
    
    // 5. Ejecutar query
    const data = await this.executeQuery(sql);
    
    // 6. Generar respuesta en lenguaje natural + chart
    const answer = await this.generateNaturalResponse(intent, data, query.question);
    
    // 7. Determinar tipo de gráfico óptimo
    const chartType = this.inferChartType(intent, data);
    
    // 8. Generar sugerencias basadas en contexto
    const suggestions = await this.generateSuggestions(intent, data, memoryContext);
    
    // 9. Guardar en historial
    await this.saveHistory(query, answer, sql, chartType, data);
    
    // 10. Guardar en memoria para futuro
    await memoryService.embed({
      type: 'insight',
      id: `insight-${Date.now()}`,
      creatorId: query.creatorId,
      content: `Pregunta: ${query.question}\nRespuesta: ${answer}\nSQL: ${sql}`,
      metadata: { intent: intent.category, chartType }
    });
    
    return { answer, sql, data, chartType, suggestions };
  }
  
  async saveDashboard(
    creatorId: string,
    question: string,
    sql: string,
    chartType: string,
    name: string
  ): Promise<string> {
    const { rows } = await pool.query(`
      INSERT INTO creator_dashboards (creator_id, name, description, question, sql_query, chart_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [creatorId, name, question, question, sql, chartType]);
    
    // Agregar a memoria para sugerencias futuras
    await memoryService.embed({
      type: 'saved_dashboard',
      id: rows[0].id,
      creatorId,
      content: `Dashboard guardado: ${name}\nPregunta: ${question}`,
      metadata: { name, chartType }
    });
    
    return rows[0].id;
  }
  
  async getSuggestions(creatorId: string): Promise<string[]> {
    // Buscar en memoria dashboards guardados y preguntas frecuentes
    const memory = await memoryService.searchSimilar(
      creatorId,
      'suggestions questions dashboards',
      5,
      ['insight', 'saved_dashboard']
    );
    
    // Generar sugerencias basadas en el contexto
    return this.generateContextualSuggestions(memory);
  }
}
```

#### 3.3.7 Clasificación de Intenciones

```typescript
const INSIGHTS_INTENT_CLASSIFIER = `
Clasifica la siguiente pregunta del creador en una categoría:

CATEGORÍAS:
- REVENUE_TOTAL: Ingresos totales, sumas
- REVENUE_COMPARISON: Comparar períodos o productos
- PRODUCT_PERFORMANCE: Performance de productos específicos
- PRODUCT_TREND: Tendencia de un producto
- CUSTOMER_ANALYSIS: Análisis de compradores
- AFFILIATE_PERFORMANCE: Performance de afiliados
- SUBSCRIPTION_ANALYSIS: Métricas de suscripción
- ENGAGEMENT_ANALYSIS: Reviews, Q&A, engagement
- FORECAST: Proyecciones futuras
- CONVERSION_ANALYSIS: Tasas de conversión

RESPUESTA en JSON:
{
  "category": "...",
  "subcategory": "...",
  "period": "7d|30d|90d|1y|all",
  "productId": "uuid o null",
  "filters": {...},
  "chartType": "bar|line|pie|table|number",
  "aggregation": "sum|avg|count|min|max"
}

EJEMPLOS:
- "¿Cuánto vendí este mes?" → { category: "REVENUE_TOTAL", period: "30d" }
- "¿Qué producto vende más?" → { category: "PRODUCT_PERFORMANCE", chartType: "bar" }
- "¿De dónde vienen mis clientes?" → { category: "CUSTOMER_ANALYSIS", chartType: "pie" }
`;
```

#### 3.3.8 Casos de Uso Comunes

| Pregunta Natural | Categoría | Chart | SQL generado |
|-----------------|-----------|-------|--------------|
| "¿Cuánto vendí?" | REVENUE_TOTAL | number | SUM(amount) |
| "¿Cuál fue mi mejor mes?" | REVENUE_COMPARISON | line | GROUP BY month ORDER BY sum |
| "¿Qué productos venden más?" | PRODUCT_PERFORMANCE | bar | GROUP BY product ORDER BY count |
| "¿Quiénes son mis mejores affiliates?" | AFFILIATE_PERFORMANCE | bar | GROUP BY affiliate |
| "¿Cuál es mi rating promedio?" | ENGAGEMENT_ANALYSIS | number | AVG(rating) |
| "¿De dónde vienen mis compradores?" | CUSTOMER_ANALYSIS | pie | GROUP BY country |
| "¿Qué día vendo más?" | REVENUE_TREND | line | GROUP BY EXTRACT(DOW FROM created_at) |
| "¿Cuánto debería cobrar?" | FORECAST | - | Basado en benchmarks |

#### 3.3.9 Reglas de Negocio

| Regla | Descripción |
|-------|-------------|
| **Créditos por query** | 1 crédito por pregunta |
| **Dashboards guardados** | Máximo 50 por creador |
| **Historial** | Últimas 100 preguntas guardadas |
| **Sugerencias** | Basadas en dashboards guardados y frecuencia |
| **Solo datos propios** | Creador solo ve sus propios datos |

#### 3.3.10 Notificaciones

| Evento | Destinatario | Canal |
|--------|--------------|-------|
| Dashboard guardado | Creador | In-app |
| Nuevo insight sugerido | Creador | In-app |

---

## 4. Arquitectura de Datos

### 4.1 Diagrama de Entidades

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   products  │       │   users     │       │   orders    │
│─────────────│       │─────────────│       │─────────────│
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ creator_id  │───────│             │───────│ buyer_id    │
│             │       │             │       │ product_id  │
└─────────────┘       └─────────────┘       └─────────────┘
       │
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ai_embeddings                                  │
│  (MEMORIA CENTRAL - alimenta TODAS las features AI)             │
│─────────────────────────────────────────────────────────────────│
│  source_type: 'lesson' | 'faq' | 'policy' | 'qa' | 'review'   │
│  embedding: vector(1536)                                        │
│  content_text, metadata                                         │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│ product_qa  │       │product_rev  │       │  reports    │
│─────────────│       │─────────────│       │─────────────│
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ product_id  │       │ product_id  │       │ reporter_id │
│ user_id     │       │ user_id     │       │ reported_*  │
│ question    │       │ rating      │       │ reason_id   │
│ parent_id   │       │ content     │       │ status      │
└─────────────┘       └─────────────┘       └─────────────┘

┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│product_faqs │       │ tutor_conv  │       │daily_metrics│
│─────────────│       │─────────────│       │─────────────│
│ id (PK)     │       │ id (PK)     │       │ id (PK)     │
│ product_id  │       │ product_id  │       │ creator_id  │
│ question    │       │ user_id     │       │ date        │
│ answer      │       │ session_id  │       │ metrics...  │
└─────────────┘       └─────────────┘       └─────────────┘
```

### 4.2 Índices Recomendados

```sql
-- Memory Service (pgvector)
CREATE INDEX idx_embeddings_source ON ai_embeddings(source_type);
CREATE INDEX idx_embeddings_product ON ai_embeddings(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX idx_embeddings_search ON ai_embeddings USING ivfflat (embedding vector_cosine_ops);

-- Q&A
CREATE INDEX idx_questions_product ON product_questions(product_id) WHERE is_public = TRUE;
CREATE INDEX idx_questions_user ON product_questions(user_id);

-- Reviews
CREATE INDEX idx_reviews_product ON product_reviews(product_id) WHERE is_public = TRUE;
CREATE INDEX idx_reviews_rating ON product_reviews(product_id, rating DESC);

-- Reports
CREATE INDEX idx_reports_status ON reports(status) WHERE status = 'pending';
CREATE INDEX idx_reports_reporter ON reports(reporter_id);

-- Tutor
CREATE INDEX idx_conversations_product ON tutor_conversations(product_id);
CREATE INDEX idx_conversations_user ON tutor_conversations(user_id);
CREATE INDEX idx_messages_conversation ON tutor_messages(conversation_id);
```

---

## 5. API Endpoints

### 5.1 Memory Service (Interno)

```typescript
// servicios internos, no expuestos como REST API

// services/ai/crema-memory.service.ts
CremaMemoryService.embed(source: EmbeddingSource)
CremaMemoryService.embedBatch(sources: EmbeddingSource[])
CremaMemoryService.retrieve(query: MemoryQuery)
CremaMemoryService.retrieveForTutor(productId, question, topK)
CremaMemoryService.deleteEmbedding(type, id)
CremaMemoryService.rebuildProductIndex(productId)
```

### 5.2 Q&A Endpoints

```
# Públicos
GET    /api/products/:productId/questions      - Listar preguntas públicas
GET    /api/products/:productId/faqs            - Listar FAQs

# Protegidos (Usuario)
POST   /api/products/:productId/questions       - Crear pregunta
PATCH  /api/questions/:questionId             - Editar mi pregunta
DELETE /api/questions/:questionId             - Eliminar mi pregunta
POST   /api/questions/:questionId/vote         - Marcar como útil

# Protegidos (Creador)
POST   /api/questions/:questionId/answer       - Responder pregunta
DELETE /api/questions/:questionId             - Eliminar pregunta

# FAQs (Creador)
GET    /api/products/:productId/faqs           - Listar FAQs
POST   /api/products/:productId/faqs         - Crear FAQ
PATCH  /api/faqs/:faqId                      - Editar FAQ
DELETE /api/faqs/:faqId                      - Eliminar FAQ
POST   /api/products/:productId/faqs/reorder  - Reordenar FAQs
```

### 5.3 Reviews Endpoints

```
# Públicos
GET    /api/products/:productId/reviews        - Listar reviews públicas
GET    /api/products/:productId/rating-summary - Rating promedio

# Protegidos (Comprador con order)
POST   /api/products/:productId/reviews       - Crear review
PATCH  /api/reviews/:reviewId                - Editar mi review
DELETE /api/reviews/:reviewId                - Eliminar mi review
POST   /api/reviews/:reviewId/vote           - Marcar como útil

# Protegidos (Creador)
GET    /api/products/:productId/reviews/all  - Todas las reviews
PATCH  /api/products/:productId/review-settings - Configurar visibility
PATCH  /api/reviews/:reviewId/feature        - Destacar review

# Admin
DELETE /api/admin/reviews/:reviewId          - Eliminar review
```

### 5.4 Reports/Denuncias Endpoints

```
# Protegidos (Usuario)
POST   /api/reports                          - Crear denuncia
GET    /api/reports/my-reports               - Mis denuncias

# Admin
GET    /api/admin/reports                    - Listar todas
GET    /api/admin/reports/:reportId         - Detalle
PATCH  /api/admin/reports/:reportId         - Actualizar estado
POST   /api/admin/reports/:reportId/actions - Agregar acción
POST   /api/admin/reports/:reportId/retain-funds - Retener fondos
POST   /api/admin/reports/:reportId/resolve  - Resolver

# Creador
GET    /api/creator/reports/my-products     - Denuncias sobre mis productos
```

### 5.5 Analytics Endpoints

```
# Creador
GET    /api/creator/insights/summary        - Resumen general
GET    /api/creator/insights/revenue        - Métricas de revenue
GET    /api/creator/insights/products        - Performance por producto
GET    /api/creator/insights/subscriptions  - Métricas de suscripción
GET    /api/creator/insights/engagement      - Métricas de engagement

# Admin
GET    /api/admin/analytics/platform        - Analytics de toda la plataforma
```

### 5.6 Tutor AI Endpoints

```
# Estudiante
POST   /api/products/:productId/tutor/chat   - Enviar mensaje
GET    /api/products/:productId/tutor/history - Historial de conversación

# Creador
GET    /api/products/:productId/tutor/config - Ver configuración
PATCH  /api/products/:productId/tutor/config - Editar configuración
POST   /api/products/:productId/tutor/train - Iniciar entrenamiento
GET    /api/products/:productId/tutor/insights - Ver insights generados
POST   /api/products/:productId/tutor/insights/:id/read - Marcar como leído

# Admin
GET    /api/admin/tutor/stats               - Stats globales de uso
```

---

## 6. Roadmap de Implementación

### Fase 1: Memory + Q&A + Reviews + Denuncias (10-12 semanas)

| Semana | Módulo | Tareas |
|--------|--------|--------|
| **1-2** | ⭐ **Crema Memory Service** | Tabla ai_embeddings, pgvector, servicio base, hooks de sync |
| **3-4** | Q&A Base | Tablas, CRUD básico, listados públicos |
| **5** | Q&A Avanzado + Q&A Agent | Votos útiles, FAQs, auto-respuesta IA |
| **6-7** | Reviews Base | Tablas, CRUD, rating summary |
| **8** | Reviews Avanzado | Configuración creator, votes, moderation |
| **9-10** | Denuncias Base | Tablas, motivos, CRUD, admin panel |
| **11** | Denuncias Workflow + Reports Agent | Retención de fondos, acciones, triage IA |
| **12** | Testing + Integración | Tests, CI, deployment |

### Fase 2: Analytics + IA Avanzada (8-10 semanas)

| Semana | Módulo | Tareas |
|--------|--------|--------|
| **1-2** | Analytics Base | Tablas daily_metrics, agregaciones, jobs |
| **3-4** | Dashboard Frontend | Gráficos, KPIs, filtros |
| **5-6** | Tutor AI Avanzado | Chat con memoria, insights automáticos |
| **7** | Métricas Avanzadas | Churn, LTV, cohort retention |
| **8** | Testing + Integración | Tests, CI, deployment |

### Total Estimado: 18-22 semanas (~5 meses)

### Estado de Implementación (Mayo 2026)

| Categoría | Servicio | Archivo | Tests | Estado |
|-----------|----------|---------|-------|--------|
| **Base** | LLM Service | `ai/llm.service.ts` | ✅ | ✅ Implementado |
| **Base** | Embedding Service | `ai/embedding.service.ts` | ✅ | ✅ Implementado |
| **Base** | Memory Service | `ai/memory.service.ts` | ✅ | ✅ Implementado |
| **Base** | Credits Service | `ai/credits.service.ts` | ✅ | ✅ Implementado |
| **Content** | ContentAssistant | `ai/content/content-assistant.service.ts` | ✅ | ✅ Implementado |
| **Content** | ContentReader | `ai/content/content-reader.service.ts` | ✅ | ✅ Implementado |
| **Content** | QuizGenerator | `ai/content/quiz-generator.service.ts` | ✅ | ✅ Implementado |
| **Content** | Transcription | `ai/content/transcription.service.ts` | ✅ | ✅ Implementado |
| **Agents** | QAAgentService | `ai/agents.service.ts` | ✅ | ✅ Implementado |
| **Agents** | TutorService | `ai/agents.service.ts` | ✅ | ✅ Implementado |
| **Agents** | InsightsService | `ai/agents.service.ts` | ✅ | ✅ Implementado |
| **Agents** | AnalyticsService | `ai/agents.service.ts` | ✅ | ✅ Implementado |
| **Moderation** | ConciergeService | `ai/concierge.service.ts` | ✅ | ✅ Implementado |
| **Moderation** | QAService | `ai/qa.service.ts` | ✅ | ✅ Implementado |
| **Moderation** | ReviewService | `ai/review.service.ts` | ✅ | ✅ Implementado |
| **Moderation** | DenunciationService | `ai/denunciation.service.ts` | ✅ | ✅ Implementado |
| **Memory** | Memory Enhancement (RBAC, HNSW, Quota, LRU, Cleanup) | `ai/memory.service.ts` + workers | ✅ | ✅ SDD completo |
| **Orchestration** | OrchestratorService | `ai/orchestrator.service.ts` | ✅ | ✅ 18 capabilities |
| **Interactive** | InteractiveAgentService | `ai/interactive-agent.service.ts` | ✅ | ✅ SDD Tasks 1-11 |

**Total: 20 servicios AI implementados**

#### Implementado sin SDD (Mayo 2026):

| Feature | Código | Rutas API | Tablas DB |
|---------|--------|----------|-----------|
| Q&A Agent | `qaAgentService` en `agents.service.ts` | ✅ `/qa/chat`, `/qa/config` | ✅ `product_qa_agent_config` |
#### Implementado:

| Feature | Servicio | API | Tablas |
|---------|----------|-----|--------|
| Tutor AI | `tutorService` en `agents.service.ts` | ✅ `/tutor/chat`, `/tutor/insights` | ✅ `product_tutor_config`, `tutor_insights` |
| Analytics | `analyticsService.getDashboardMetrics()` | ✅ `/analytics/dashboard` | ✅ `creator_daily_metrics` |
| Insights AI | `insightsService` (CRUD dashboards, NL→SQL) + `agents.service` (predictChurn, generateRecoveryEmail, compareEntities) | ✅ `/insights/dashboards`, `/insights/query`, `/insights/predict/churn`, `/insights/compare`, `/insights/recover/email` | ✅ `creator_dashboards`, `insights_history`, `churn_predictions`, `recovery_emails`, `ab_comparatives` |
| Reports | `reportService` en `denunciation.service.ts` | ✅ `/reports` CRUD | ✅ `reports`, `report_reasons`, `report_actions` |
| **Reports Agent** | `reportService.triageReport()` en `denunciation.service.ts` | ✅ `POST /admin/reports/:reportId/triage` | ✅ Reports + AI classification |
| Memory Enhancement | `memory-enhancement` SDD | ✅ RBAC, Quota, LRU | ✅ Índices HNSW, cleanup |
| Interactive Agent | `interactiveAgentService` + `interactive-agent.repository.ts` | ✅ `/api/interactive/*` | ✅ `user_course_data`, `product_module_fields` |

#### Pendiente:

| Prioridad | Tarea | SDD | Notas |
|-----------|-------|-----|-------|
| 🟢 BAJA | Orchestrator registration para servicios ya implementados | Descartado | Interactive Agent y Reports Agent usan rutas REST directas. Orchestrator disponible para futuras integraciones si hay caso de uso. |

> **Nota:** Los SDDs de memory-enhancement y ai-content-assistant fueron creados retrospectively. Interactive Agent y Reports Agent siguen el mismo patrón: implementados sin SDD formal y ahora documentados.

---

## 7. Dependencias y Costos

### 7.1 Externas

| Servicio | Uso | Costo Estimado |
|----------|-----|----------------|
| **OpenAI API** | Todos los features AI (embeddings + chat) | $0.50-2 USD/mes |
| **Anthropic API** | Alternative LLM provider | Opcional |
| **Gemini API** | Alternative LLM provider | Opcional |
| **Ollama** | Local LLM (desarrollo) | $0 (local) |
| **Resend** | Notificaciones email | Ya integrado |
| **PostgreSQL + pgvector** | Memoria AI + Base de datos | Ya existe |

### 7.2 Costos AI Detallados

| Concepto | Sin Memoria | Con Memoria | Ahorro |
|----------|-------------|-------------|--------|
| **Tokens por pregunta** | ~3,100 | ~500-800 | ~75% |
| **Costo/mes (30 Pro)** | ~$1.40 | ~$0.22 | ~85% |
| **Costo/año (30 Pro)** | ~$17 | ~$2.64 | ~85% |

### 7.3 Técnicas

| Dependencia | Versión Mínima |
|-------------|----------------|
| Node.js | 20.x |
| PostgreSQL | 15+ (pgvector) |
| Redis | 7+ |
| BullMQ | 2.x |

### 7.4 Frontend Requirements

| Page | Dependencias |
|------|--------------|
| Detalle producto | Q&A section, Reviews section |
| Dashboard creador | Analytics tabs, Tutor config, Reports |
| Admin panel | Reports management, Moderation tools |

---

## Anexo A: ~~Especificación de Report Reasons~~ (DELETED — duplicate of §2.3.3 seeds at lines 934-947)

> The report_reasons seed data in this section conflicted with the canonical set in §2.3.3. The canonical set (lines 934-947) is the single source of truth. This section has been removed to prevent confusion.

---

## Anexo B: Prompts del Sistema

```typescript
// Tutor AI Prompt
const TUTOR_SYSTEM_PROMPT = `
Eres {tutor_name}, el asistente de IA del creador de este curso.
Tu rol es ayudar a los estudiantes a resolver dudas sobre el contenido del curso.

INSTRUCCIONES:
1. Responde SOLO preguntas sobre el contenido del curso
2. Usa un tono amigable y profesional
3. Si no tienes certeza sobre algo, di que no lo sabes y sugiere contactar al creador
4. Usa ejemplos del contenido para ilustrar tus respuestas
5. Sé conciso pero completo

LIMITACIONES:
- NO inventes información que no esté en el contenido
- NO des consejos fuera del alcance del curso

CONTEXTO (del curso):
{lesson_context}
`;

// Q&A Agent Prompt
const QA_AGENT_PROMPT = `
Eres un asistente que responde preguntas sobre productos digitales.
Tu rol es ayudar a compradores potenciales resolviendo dudas.

INSTRUCCIONES:
1. Responde basándote SOLO en el contexto proporcionado
2. Si no hay información suficiente, sugiere contactar al creador
3. Usa un tono amigable y profesional
4. Si la pregunta es sobre algo fuera del contenido, redirige

CONTEXTO (lecciones + FAQs):
{context}
`;

// Reports Triage Prompt
const REPORTS_TRIAGE_PROMPT = `
Analiza la siguiente denuncia y clasifica:
1. suggestedReason: El motivo más probable (usando los códigos disponibles)
2. severity: 1 (spam/técnico), 2 (moderado), 3 (fraude/grave)
3. isSpam: boolean
4. suggestedAction: Acción sugerida

RESPUENDE en JSON con este formato exacto.
`;
```

---

## Anexo C: Changelog

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | Marzo 2026 | Versión inicial |
| 1.1 | Marzo 2026 | Crema Memory Service como prioridad 1, reorganización de fases, modelo de IA detallado con costos, Agentes IA agregados |
| 1.2 | Marzo 2026 | Sistema de créditos prepagos agregado, Insights AI Agent con dashboards dinámicos usando Crema Memory MCP |
| 1.3 | Abril 2026 | Multi-provider LLM support (OpenAI, Ollama, Anthropic, Gemini, Simulator), Streaming SSE implementado |
| 1.4 | Abril 2026 | Estado real documentado: Servicios base implementados (Content Assistant, Q&A, Reviews, Denunciation, Credits), Memory Enhancement Tasks pendientes, Orchestrator integración pendiente |
| 1.5 | Mayo 2026 | Estado actualizado: 18 servicios AI implementados (sin SDD formal). Pendientes: Interactive Agent (§2.5), Reports Agent triage IA. Memory Enhancement y ai-content-assistant completados con SDD. |

| 1.5 | Mayo 2026 | Estado actualizado: 18 servicios AI implementados (sin SDD formal). Pendientes: Interactive Agent (§2.5), Reports Agent triage IA. Memory Enhancement y ai-content-assistant completados con SDD. |
| 1.6 | Mayo 2026 | Interactive Agent (§2.5) completado con SDD. Feature completo: SQL, types, schemas, repository, service, routes, tests (1231 passing). Credit flow idempotente con referenceId check. Retry pattern con double-charge prevention. |

---

*Documento preparado para el proyecto Crema - Mayo 2026*
*Versión: 1.6 - Estado: Interactive Agent implementado, Reports Agent pendiente*
*Última actualización: Mayo 2026 - Interactive Agent SDD completo + merge a master*
