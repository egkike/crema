# Product Requirements Document (PRD)
## Crema - Sistema de Interacción y Analytics

**Versión**: 1.2  
**Fecha**: Marzo 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García  
**Fases**: 2 (Memory + Q&A + Reviews + Denuncias | Analytics + IA avanzada)

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

---

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
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
  async useCredit(userId: string, amount: number = 1): Promise<boolean> {
    const credits = await this.getBalance(userId);
    
    if (credits.balance < amount) {
      throw new AppError('Créditos insuficientes', 402, {
        required: amount,
        available: credits.balance
      });
    }
    
    await pool.query(`
      UPDATE ai_credits 
      SET balance = balance - $1, 
          total_used = total_used + $1,
          updated_at = NOW()
      WHERE user_id = $2
    `, [amount, userId]);
    
    await this.logTransaction(userId, 'usage', -amount, credits.balance - amount);
    
    return true;
  }
  
  // Agregar créditos (post-pago)
  async addCredits(userId: string, packageId: string): Promise<void> {
    const pkg = await this.getPackage(packageId);
    const expiresAt = addMonths(new Date(), 12);
    
    await pool.query(`
      INSERT INTO ai_credits (user_id, balance, total_purchased, expires_at)
      VALUES ($1, $2, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET
        balance = ai_credits.balance + $2,
        total_purchased = ai_credits.total_purchased + $2,
        expires_at = GREATEST(ai_credits.expires_at, $3)
    `, [userId, pkg.credits, expiresAt]);
    
    await this.logTransaction(userId, 'purchase', pkg.credits, credits.balance + pkg.credits);
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

### 1.4 Premisas del Sistema

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
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
  metadata?: Record<string, any>;
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
  metadata: Record<string, any>;
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
async function onPolicyChange(policy: ContentPolicy, action: 'create' | 'update') {
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de votos de utilidad
CREATE TABLE question_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES product_questions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id) -- Un review por usuario por producto
);

-- Tabla de votos útiles en reviews
CREATE TABLE review_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES product_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(review_id, user_id)
);

-- Tabla de configuración de reviews por producto
CREATE TABLE product_review_settings (
    product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
    reviews_enabled BOOLEAN DEFAULT TRUE,
    show_in_product_page BOOLEAN DEFAULT TRUE,
    require_verified_purchase BOOLEAN DEFAULT TRUE,
    min_purchase_days INT DEFAULT 0, -- Días desde compra para hacer review
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    code VARCHAR(50) UNIQUE NOT NULL,
    label_es VARCHAR(100) NOT NULL,
    label_en VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'product', 'creator', 'content'
    severity_level INT DEFAULT 1 CHECK (severity_level >= 1 AND severity_level <= 3),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de denuncias
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Tipos de entidad reportada
    reporter_id UUID NOT NULL REFERENCES users(id),
    reported_user_id UUID REFERENCES users(id), -- Si es denuncia de creador
    reported_product_id UUID REFERENCES products(id), -- Si es denuncia de producto
    reported_review_id UUID REFERENCES product_reviews(id), -- Si es denuncia de review
    
    -- Detalles
    reason_id UUID NOT NULL REFERENCES report_reasons(id),
    description TEXT,
    evidence_urls JSONB DEFAULT '[]', -- URLs de imágenes/evidence
    
    -- Workflow
    status VARCHAR(20) DEFAULT 'pending' CHECK (
        status IN ('pending', 'under_review', 'resolved', 'dismissed', 'escalated')
    ),
    admin_id UUID REFERENCES users(id), -- Admin que atiende
    admin_notes TEXT,
    resolution_notes TEXT,
    resolution_action VARCHAR(50), -- 'warned', 'suspended', 'banned', 'product_removed', 'funds_retained'
    funds_retained_until TIMESTAMP WITH TIME ZONE, -- Para retención de fondos
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadatos
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de historial de acciones sobre denuncias
CREATE TABLE report_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seeds de motivos predefinidos
INSERT INTO report_reasons (code, label_es, label_en, category, severity_level) VALUES
('COPYRIGHT', 'Contenido con derechos de autor', 'Copyrighted content', 'product', 2),
('FRAUD', 'Estafa o fraude', 'Fraud or scam', 'creator', 3),
('MISLEADING', 'Información engañosa', 'Misleading information', 'product', 2),
('HARASSMENT', 'Acoso o contenido dañino', 'Harassment or harmful content', 'content', 3),
('SPAM', 'Spam o publicidad masiva', 'Spam or mass advertising', 'creator', 1),
('INAPPROPRIATE', 'Contenido inapropiado', 'Inappropriate content', 'product', 2),
('TECHNICAL_ISSUE', 'Problema técnico con el producto', 'Technical issue with product', 'product', 1),
('REFUND_ABUSE', 'Abuso de política de reembolso', 'Refund policy abuse', 'creator', 2);
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
    const context = await memoryService.retrieveForTutor(productId, question, topK: 3);
    
    if (context.length === 0 && mode === 'faq-only') {
      return { confidence: 0, sources: [] };
    }
    
    // 2. Generar respuesta con contexto
    const messages = [
      { role: 'system', content: QA_AGENT_PROMPT },
      { role: 'system', content: `Contexto relevante:\n${formatContext(context)}` },
      { role: 'user', content: question },
    ];
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      max_tokens: 300,
    });
    
    const answer = response.choices[0].message.content!;
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
    // 1. Buscar políticas relevantes
    const policies = await memoryService.retrieve({
      query: description,
      sources: ['policy'],
      limit: 3
    });
    
    // 2. Clasificar con IA
    const classification = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REPORTS_TRIAGE_PROMPT },
        { role: 'system', content: `Políticas relevantes:\n${formatPolicies(policies)}` },
        { role: 'user', content: `Denuncia: ${description}` },
      ],
    });
    
    return JSON.parse(classification.choices[0].message.content!);
  }
}
```

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(creator_id, date)
);

CREATE VIEW creator_insights_summary AS
SELECT 
    creator_id,
    SUM(total_revenue) as lifetime_revenue,
    SUM(total_revenue) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as revenue_30d,
    COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '30 days') as reviews_30d,
    AVG(avg_rating) FILTER (WHERE avg_rating IS NOT NULL AND date >= CURRENT_DATE - INTERVAL '90 days') as avg_rating_90d,
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
    last_training_at TIMESTAMP WITH TIME ZONE,
    training_status VARCHAR(20) DEFAULT 'not_started',
    training_error TEXT,
    messages_used INT DEFAULT 0,
    messages_limit INT DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Conversaciones con el Tutor
CREATE TABLE tutor_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Mensajes individuales
CREATE TABLE tutor_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES tutor_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tokens_used INT,
    response_time_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    const context = await memoryService.retrieveForTutor(productId, message, topK: 3);
    
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
    const response = await openai.chat.completions.create({
      model: config.model_name,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });
    
    const answer = response.choices[0].message.content!;
    const tokens = response.usage!.total_tokens;
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
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
  data?: any;
  chartType: 'bar' | 'line' | 'pie' | 'table' | 'number';
  suggestions?: string[];
  savedDashboardId?: string;
}

class InsightsAgentService {
  
  async askQuestion(query: InsightsQuery): Promise<InsightsResponse> {
    // 1. Usar créditos AI
    await aiCreditsService.useCredit(query.creatorId);
    
    // 2. Buscar contexto en memoria (preguntas anteriores del creador)
    const memoryContext = await memoryService.retrieve({
      query: query.question,
      sources: ['insight'], // Tipo especial para insights
      creatorId: query.creatorId,
      limit: 3
    });
    
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
    const memory = await memoryService.retrieve({
      query: 'suggestions questions dashboards',
      sources: ['insight', 'saved_dashboard'],
      creatorId,
      limit: 5
    });
    
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
| "¿Qué día vendo más?" | REVENUE_TREND | line | GROUP BY DAYOFWEEK |
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

## Anexo A: Especificación de Report Reasons

```sql
INSERT INTO report_reasons (code, label_es, label_en, category, severity_level) VALUES
-- Producto
('COPYRIGHT', 'Contenido con derechos de autor', 'Copyrighted content', 'product', 2),
('MISLEADING', 'Información engañosa o falsa', 'Misleading or false information', 'product', 2),
('INAPPROPRIATE', 'Contenido inapropiado', 'Inappropriate content', 'product', 2),
('TECHNICAL_ISSUE', 'El producto no funciona o está dañado', 'Product does not work or is damaged', 'product', 1),
('NOT_AS_DESCRIBED', 'No coincide con la descripción', 'Does not match description', 'product', 2),
('MALWARE', 'Contiene virus o malware', 'Contains virus or malware', 'product', 3),
-- Creador
('FRAUD', 'Estafa o intento de fraude', 'Fraud or scam attempt', 'creator', 3),
('HARASSMENT', 'Acoso o comportamiento abusivo', 'Harassment or abusive behavior', 'creator', 3),
('SPAM', 'Spam o promoción masiva no deseada', 'Spam or unwanted mass promotion', 'creator', 1),
('REFUND_ABUSE', 'Abuso de política de reembolsos', 'Refund policy abuse', 'creator', 2),
-- Reviews
('FAKE_REVIEW', 'Review falsa o spam', 'Fake or spam review', 'review', 2),
('OFFENSIVE_REVIEW', 'Review ofensiva o inapropiada', 'Offensive or inappropriate review', 'review', 2),
('COMPETITOR_REVIEW', 'Review de competencia malintencionada', 'Malicious competitor review', 'review', 2);
```

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

---

*Documento preparado para el proyecto Crema - Abril 2026*
*Versión: 1.3 - Multi-provider + Streaming*
*Última actualización: Abril 2026 - Multi-provider LLM + Streaming SSE*
