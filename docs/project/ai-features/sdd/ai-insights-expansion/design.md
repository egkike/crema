# Design: AI Insights Expansion

**Change**: ai-insights-expansion
**Date**: 2026-05-26
**Phase**: Design (SDD Phase 3)
**PRD Ref**: PRD.md §4.8
**Status**: ✅ **IMPLEMENTED** (Junio 2026) — All design decisions applied. PRs #32, #33, #35-#41, #43, #44 mergeados.

---

## 1. Architecture Overview

### 1.1 Decision: Extend `insightsService`, Not Create New Services

The three new capabilities — churn prediction, A/B comparatives, and recovery email generation — share the same domain (creator analytics/insights), infrastructure (`pool`, `llmService`, `aiCreditService`), and authorization pattern (creator ownership). Extracting them into separate services would introduce duplication of:

- `getValidatedSchema()` calls
- Pool connection management
- Credit deduction and balance checking
- Logging and AppError patterns
- Ownership verification against `products.creator_id`

**Trade-off**: `insightsService` grows from ~300 to ~700 lines. Mitigation: each method is self-contained (own prompt, own query, own LLM call). If the service surpasses 1000 lines or 8 methods, extract sub-services then.

### 1.2 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/ai/insights/predict/churn                            │
│  POST /api/ai/insights/compare                                  │
│  POST /api/ai/insights/recover/email                            │
│                    │                                             │
│  rate limiters:    │ churnPredictionLimiter (5/min)              │
│                    │ compareLimiter (10/min)                     │
│                    │ recoveryEmailLimiter (10/min)               │
│                    │                                             │
│  jwtAuthMiddleware │ Zod validation (schemas)                    │
│                    │                                             │
│         ┌──────────▼──────────────────────┐                     │
│         │     insightsService (singleton)  │                     │
│         │  + predictChurn()                │                     │
│         │  + compareEntities()             │                     │
│         │  + generateRecoveryEmail()       │                     │
│         │  (existing: getDashboards, etc.) │                     │
│         └──────────┬──────────────────────┘                     │
│                    │                                             │
│    ┌───────────────┼──────────────────────┐                     │
│    ▼               ▼                       ▼                     │
│  pool (pg)    llmService              aiCreditService           │
│    │               │                       │                     │
│    ▼               ▼                       ▼                     │
│ churn_predictions  LLM API          ai_credits table             │
│ recovery_emails   (GPT/Claude)                                  │
│ insights_history                                                 │
│ orders, products, etc.                                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Model

### 2.1 New Tables

Add to `backend/db/init/14-ai-insights-expansion.sql` (new init script; follows `13-*-*.sql` convention in reusable-resources.md §10).

```sql
-- 14-ai-insights-expansion.sql
-- AI Insights Expansion: Churn Predictions + Recovery Emails
-- SDD: ai-insights-expansion
-- Phase: 7.5-7.6 (extends Phase 7 Advanced AI tables)

-- 7.5 Churn Predictions Table
CREATE TABLE IF NOT EXISTS churn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    churn_score INTEGER NOT NULL CHECK (churn_score >= 0 AND churn_score <= 100),
    risk_factors JSONB NOT NULL DEFAULT '[]',
    narrative TEXT,
    recommended_action TEXT,
    data_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_creator
    ON churn_predictions(creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_product
    ON churn_predictions(product_id);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_target
    ON churn_predictions(target_user_id);

-- 7.6 Recovery Emails Table
CREATE TABLE IF NOT EXISTS recovery_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    preview_text VARCHAR(150),
    tone VARCHAR(20) NOT NULL DEFAULT 'empathic'
        CHECK (tone IN ('empathic', 'direct', 'motivational')),
    churn_prediction_id UUID REFERENCES churn_predictions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_emails_creator
    ON recovery_emails(creator_id, created_at DESC);
```

### 2.2 Rationale for Dedicated Tables (vs. JSON in `insights_history`)

| Approach | Pro | Con |
|----------|-----|-----|
| JSON in `insights_history` | Zero new tables | Can't filter by `churn_score`, `tone`, `target_user_id` efficiently; no referential integrity; no foreign keys |
| Dedicated tables | Structured queries (`WHERE churn_score > 50`), FK integrity, indexes | 2 new tables, 4 new indexes |

The query patterns justify dedicated tables: "show all churn predictions above 70% for product X" requires a `WHERE churn_score > 70 AND product_id = $1` — this is a table scan on JSONB but an index scan on a typed column.

### 2.3 No `insights_history` Write for These Operations

`insights_history` stores raw NL→SQL queries and their SQL results. The three new operations don't produce SQL — they produce structured predictions, emails, and comparative analyses. Each writes to its own table (`churn_predictions`, `recovery_emails`) or uses `insights_history` (compare writes both SQL queries there already via the existing pattern).

---

## 3. Service Method Contracts

### 3.1 `insightsService.predictChurn(productId, userId, threshold?)`

**Purpose**: Predict churn probability for all students of a product.

**Signature**:
```typescript
async predictChurn(
  productId: string,
  userId: string,
  threshold?: number  // optional: only return predictions >= threshold score
): Promise<ChurnPredictionResult>
```

**Preconditions**:
- `userId` owns `productId` (checked via `verifyProductOwnership`)
- Credits balance >= 5

**Processing pipeline**:
1. Verify product ownership: `SELECT id FROM products WHERE id = $1 AND creator_id = $2`
2. Check credit balance (5 credits)
3. Query student activity data:
   ```sql
   SELECT
     o.buyer_id,
     MAX(o.created_at) as last_purchase_date,
     COUNT(o.id) as total_orders,
     -- Progreso: asumimos que existe user_progress o similar;
     -- en v1, si no hay tabla user_progress, inferimos de lesson_completions o
     -- usamos NULL y el LLM trabaja con datos parciales
   FROM orders o
   WHERE o.product_id = $1 AND o.status = 'completed'
   GROUP BY o.buyer_id
   ```
4. Query interaction data (Q&A, reviews):
   ```sql
   SELECT
     pq.user_id,
     MAX(pq.created_at) as last_question_date,
     COUNT(pq.id) as total_questions
   FROM product_questions pq
   WHERE pq.product_id = $1
   JOIN orders o ON o.buyer_id = pq.user_id AND o.product_id = $1 AND o.status = 'confirmed'
   GROUP BY pq.user_id
   ```
5. Calculate churn heuristics per student (see §4)
6. Build LLM prompt with per-student data
7. LLM generates `narrative` and `recommendedAction` per student
8. Persist to `churn_predictions` (one row per student)
9. Deduct 5 credits
10. Return `{ predictions: ChurnPrediction[], totalStudents, creditsUsed }`

**Return type**:
```typescript
interface ChurnPrediction {
  id: string;
  userId: string;
  userName: string;
  churnScore: number;       // 0-100
  riskFactors: Array<{ factor: string; weight: number }>;  // structured format for frontend
  narrative: string;        // LLM-generated qualitative analysis
  recommendedAction: string; // e.g. "Enviar email de recuperación con descuento del 20%"
  confidence: 'high' | 'medium' | 'low';  // based on data availability
}

interface ChurnPredictionResult {
  predictions: ChurnPrediction[];
  totalStudents: number;
  creditsUsed: number;
}
```

**Error cases**:
| Condition | Error | Status |
|-----------|-------|--------|
| Not product owner | `AppError('No tienes permiso...')` | 403 |
| No credits | `AppError('Créditos insuficientes')` | 402 |
| Product has no students | Returns empty predictions, not an error | 200 |
| LLM call fails | `AppError('Error al generar predicciones...')` | 502 |

### 3.2 `insightsService.generateRecoveryEmail(productId, userId, targetUserId, tone?)`

**Purpose**: Generate a personalized recovery email for a specific at-risk student.

**Signature**:
```typescript
async generateRecoveryEmail(
  productId: string,
  userId: string,        // creator requesting the email
  targetUserId: string,  // student to recover
  tone?: 'empathic' | 'direct' | 'motivational'
): Promise<RecoveryEmailResult>
```

**Preconditions**:
- `userId` owns `productId`
- Credits balance >= 3

**Processing pipeline**:
1. Verify product ownership
2. Check credit balance (3 credits)
3. Query student data:
   - Name + email from `users` table
   - Product title from `products` table
   - Progress: from `orders` (last purchase), Q&A interactions
   - Last activity date
4. Build LLM prompt with:
   ```
   System: Eres un creador de cursos que quiere recuperar un alumno.
   Datos: nombre={name}, curso={courseName}, progreso={progress}%,
          último acceso={lastAccess}, tono={tone}
   Genera: email con subject, body HTML, y preview text.
   ```
5. LLM generates structured output (parse JSON: `{ subject, bodyHtml, previewText }`)
6. Sanitize `bodyHtml`: strip `<script>`, `onerror=`, `onclick=`, `javascript:` using regex allowlist approach (since we don't have DOMPurify in backend; see §9)
7. Persist to `recovery_emails`
8. Deduct 3 credits
9. Return `{ email: { subject, bodyHtml, previewText }, studentName, productName }`

**Return type**:
```typescript
interface RecoveryEmail {
  subject: string;
  bodyHtml: string;    // sanitized HTML
  previewText: string; // max 150 chars
  tone: string;
}

interface RecoveryEmailResult {
  email: RecoveryEmail;
  studentName: string;
  productName: string;
  creditsUsed: number;
  recoveryEmailId: string;
}
```

### 3.3 `insightsService.compareEntities(userId, entityType, entityA, entityB, metrics)`

**Purpose**: Compare metrics between two periods or two products.

**Signature**:
```typescript
async compareEntities(
  userId: string,
  entityType: 'period' | 'product',
  entityA: CompareEntity,  // { label: string; params: Record<string, unknown> }
  entityB: CompareEntity,
  metrics: MetricType[]     // e.g. ['revenue', 'sales', 'engagement']
): Promise<CompareResult>
```

**Preconditions**:
- Credits balance >= 3
- For `entityType: 'product'`: `userId` owns both products

**Processing pipeline**:
1. Check credit balance (3 credits)
2. If entityType is 'product': verify ownership of both products
3. For each entity (A, B):
   a. Build NL→SQL prompt with the specific entity context and requested metrics
   b. LLM generates SQL
   c. Validate SQL via `validateGeneratedSQL()` (existing function)
   d. Execute query
   e. Collect raw results
4. Build LLM prompt for comparative analysis:
   - Input: entity labels, metric results A vs B, raw numbers
   - Request: narrative analysis, deltas, percentage changes, recommendation
5. LLM generates: `{ narrative, deltas: { [metric]: { a, b, delta, deltaPercent } }, recommendation }`
6. Save both SQL queries + results to `ab_comparatives` table (dedicated table, not `insights_history` - structural mismatch resolved)
7. Deduct 3 credits
8. Return structured comparison

**Return type**:
```typescript
interface CompareEntity {
  label: string;  // "Enero 2026" or "Curso de React"
  params: Record<string, unknown>;  // { startDate, endDate } or { productId }
}

type MetricType = 'revenue' | 'sales' | 'conversion' | 'engagement' | 'reviews';

interface MetricDelta {
  metric: string;
  a: number;
  b: number;
  delta: number;       // b - a
  deltaPercent: number; // ((b - a) / a) * 100, or null if a === 0
}

interface CompareResult {
  entityA: { label: string; data: unknown[] };
  entityB: { label: string; data: unknown[] };
  narrative: string;
  deltas: MetricDelta[];
  recommendation: string;
  creditsUsed: number;
}
```

---

## 4. Churn Heuristics (v1)

### 4.1 Scoring Algorithm

| # | Factor | Condition | Weight |
|---|--------|-----------|--------|
| 1 | Inactividad prolongada | `days_since_last_activity > 30` | +40% |
| 2 | Bajo progreso + inactividad | `progress < 20% AND days_since_last_activity > 14` | +30% |
| 3 | Sin interacciones | `last_question_date IS NULL OR last_question_date > 60 days ago` | +20% |

**Note**: A fourth factor ("Acceso frecuente sin progreso") was removed in v1 because `total_orders` measures purchase count, not access activity. Access tracking requires additional infrastructure (login/visit logging) planned for a future iteration.

**Formula**: `churnScore = MIN(100, SUM(applied_weights))`

**Confidence**: If less than 30 days of data available, prepend narrative with `⚠️ Baja confianza: datos insuficientes (< 30 días)`.

### 4.2 Data Sources

| Data Needed | Source Table | Fallback |
|------------|-------------|----------|
| Last purchase/access date | `orders` where `product_id` + `buyer_id` | `MAX(created_at)` |
| Progress % | `user_progress` if exists | Inferred from `lesson_completions`/`orders` count vs total lessons; if table doesn't exist, set to `null` and let LLM handle |
| Interactions (Q&A) | `product_questions` | `NULL` if none |
| Interactions (Reviews) | `product_reviews` | `NULL` if none |
| Student name | `users` inner join | Required |

### 4.3 LLM Prompt Template

```
System: Eres un analista de datos especializado en predicción de abandono (churn) de estudiantes en cursos online.

Contexto:
- Producto: {productName}
- Total de estudiantes analizados: {totalStudents}
- Fecha del análisis: {currentDate}

Para cada estudiante, se te proporcionan datos objetivos y un score de riesgo calculado por heurísticas.

TAREA: Para cada estudiante, genera:
1. Una narrativa breve (2-3 frases) explicando POR QUÉ está en riesgo
2. Una recomendación accionable específica para recuperarlo

Formato de respuesta: JSON array con objetos:
{
  "userId": "...",
  "narrative": "...",
  "recommendedAction": "..."
}

REGLAS:
- Sé específico: menciona días de inactividad, progreso, interacciones
- Recomendaciones accionables: "Enviar email con descuento del 20%", "Mensaje personalizado destacando módulos no completados"
- Si los datos son insuficientes, indícalo en la narrativa

Datos de estudiantes:
{studentDataJson}
```

---

## 5. Recovery Email Generation

### 5.1 LLM Prompt Template

```
System: Eres un creador de cursos digitales con excelente comunicación.
Tu objetivo es recuperar a un alumno que muestra señales de abandono.

DATOS DEL ALUMNO:
- Nombre: {studentName}
- Curso: {productName}
- Progreso: {progress}%
- Último acceso: {lastAccess} ({daysAgo} días)
- Interacciones recientes: {recentInteractions}

TONO SOLICITADO: {tone}

INSTRUCCIONES:
1. Asunto: atractivo, personalizado, máximo 60 caracteres
2. Body: HTML válido con estructura clara (saludo, cuerpo, cierre, firma)
3. Preview text: máximo 150 caracteres, resume el valor del email
4. NO incluyas <script>, event handlers, ni estilos inline peligrosos
5. Usa un tono {tone_description}:
   - empathic: comprensivo, cercano, "entendemos que la vida es ocupada..."
   - direct: claro, concreto, "notamos que no has avanzado en 2 semanas..."
   - motivational: entusiasta, inspirador, "¡te falta poco para completar el curso!"

Responde SOLO con JSON:
{
  "subject": "...",
  "bodyHtml": "...",
  "previewText": "..."
}
```

### 5.2 HTML Sanitization

**IMPORTANT**: Use the `sanitize-html` npm package for production-grade HTML sanitization. Do NOT use hand-rolled regex.

```bash
pnpm add sanitize-html
```

```typescript
import sanitizeHtml from 'sanitize-html';

const cleanHtml = sanitizeHtml(rawBodyHtml, {
  allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote'],
  allowedAttributes: {
    'a': ['href', 'target', 'rel'],
  },
  transformTags: {
    'a': sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
  },
});
```

**Why not regex**: HTML sanitization via regex is brittle and will miss edge cases (nested encodings, SVG-based XSS, MathML vectors, data: URIs, form action hijacking, etc.). `sanitize-html` uses a battle-tested allowlist approach.

---

## 6. A/B Comparatives — Reusing NL→SQL Pipeline

### 6.1 SQL Generation Prompt (per entity)

```
System: Eres un asistente que convierte preguntas de negocio en consultas SQL para PostgreSQL.

Genera UNA consulta SQL que obtenga las siguientes métricas para {entityDescription}:
{metricsList}

Tablas disponibles:
- orders: id, buyer_id, product_id, total_amount, currency, status, created_at
- products: id, creator_id, title, type, status, created_at
- product_reviews: id, product_id, user_id, rating, content, created_at
- product_questions: id, product_id, user_id, question, answer, created_at
- commissions: id, order_id, recipient_id, amount, currency, type, status, created_at

Reglas:
1. SOLO SELECT
2. Filtra por creator_id = {userId} para asegurar propiedad de datos
3. {entitySpecificFilters}
4. Precios en total_amount (entero, 5000 = $50.00), divide por 100 para mostrar en pesos
5. Usa COALESCE para métricas que puedan ser NULL

Responde SOLO con JSON:
{ "sql": "SELECT ...", "explanation": "..." }
```

### 6.2 Comparative Analysis Prompt (after both queries execute)

```
System: Eres un analista de datos que compara resultados entre dos entidades.

DATOS:
- Entidad A: {entityALabel}
  Resultados: {entityAData}

- Entidad B: {entityBLabel}
  Resultados: {entityBData}

Métricas solicitadas: {metrics}

TAREA:
1. Calcula el delta absoluto y porcentual para CADA métrica
2. Genera una narrativa de 3-5 frases explicando las diferencias más significativas
3. Proporciona UNA recomendación accionable basada en los datos

Responde SOLO con JSON:
{
  "narrative": "...",
  "deltas": [
    { "metric": "revenue", "a": 50000, "b": 75000, "delta": 25000, "deltaPercent": 50.0 }
  ],
  "recommendation": "..."
}
```

---

## 7. Route Definitions

### 7.1 New Routes in `backend/src/routes/ai.routes.ts`

Add after the existing insights routes (after `POST /insights/query/stream`, before the Affiliate Chat section):

```typescript
// ============================================
// Insights Expansion: Churn Prediction, A/B Comparatives, Recovery Email
// ============================================

/**
 * POST /api/ai/insights/predict/churn
 * Predict churn probability for product students
 * Access: JWT (creator must own product)
 * Rate limited: 5/min (churnPredictionLimiter)
 * Credits: 5 per prediction
 */
router.post(
  '/insights/predict/churn',
  jwtAuthMiddleware,
  churnPredictionLimiter,
  validate(churnPredictionSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { productId, threshold } = req.body;

      // Verify product ownership using helper
      await verifyProductOwnership(pool, productId, userId);

      const result = await insightsService.predictChurn(productId, userId, threshold);

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      // Preserve AppError status codes (402, 403)
      if (error instanceof AppError) throw error;
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Churn prediction endpoint error');
      throw new AppError('Error al generar predicciones', 500);
    }
  }
);

/**
 * POST /api/ai/insights/compare
 * Compare metrics between two entities (periods or products)
 * Access: JWT (creator must own compared products)
 * Rate limited: 10/min (compareLimiter)
 * Credits: 3 per comparison
 */
router.post(
  '/insights/compare',
  jwtAuthMiddleware,
  compareLimiter,
  validate(compareSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { entityType, entityA, entityB, metrics } = req.body;

      // For product comparisons, verify ownership of both products
      if (entityType === 'product') {
        await verifyProductOwnership(pool, entityA.productId, userId);
        await verifyProductOwnership(pool, entityB.productId, userId);
      }

      const result = await insightsService.compareEntities(
        userId, entityType, entityA, entityB, metrics
      );

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Compare endpoint error');
      throw new AppError('Error al generar comparativa', 500);
    }
  }
);

/**
 * POST /api/ai/insights/recover/email
 * Generate a personalized recovery email for a student
 * Access: JWT (creator must own product)
 * Rate limited: 10/min (recoveryEmailLimiter)
 * Credits: 3 per generation
 */
router.post(
  '/insights/recover/email',
  jwtAuthMiddleware,
  recoveryEmailLimiter,
  validate(recoveryEmailSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = uid(req);
      const { productId, targetUserId, tone } = req.body;

      // Verify product ownership
      await verifyProductOwnership(pool, productId, userId);

      const result = await insightsService.generateRecoveryEmail(
        productId, userId, targetUserId, tone
      );

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Recovery email endpoint error');
      throw new AppError('Error al generar email de recuperación', 500);
    }
  }
);
```

### 7.2 Route Import Changes

Add to imports in `ai.routes.ts`:
```typescript
import {
  churnPredictionLimiter,
  compareLimiter,
  recoveryEmailLimiter,
} from '../middlewares/rateLimit/rateLimit';
import {
  churnPredictionSchema,
  compareSchema,
  recoveryEmailSchema,
} from '../schemas/ai.schema';
```

---

## 8. Zod Validation Schemas

### 8.1 New Schemas in `backend/src/schemas/ai.schema.ts`

```typescript
// =============================================================================
// Insights Expansion: Churn Prediction, A/B Comparatives, Recovery Email
// =============================================================================

export const churnPredictionSchema = z.object({
  productId: z.string().uuid({ message: 'Invalid product ID' }),
  threshold: z.number().int().min(0).max(100).optional(),
});

export const compareSchema = z.object({
  entityType: z.enum(['period', 'product'], {
    message: 'entityType must be "period" or "product"',
  }),
  entityA: z.object({
    label: z.string().min(1).max(100),
    // For period: { startDate: string, endDate: string }
    // For product: { productId: string }
    params: z.record(z.unknown()),
  }),
  entityB: z.object({
    label: z.string().min(1).max(100),
    params: z.record(z.unknown()),
  }),
  metrics: z.array(
    z.enum(['revenue', 'sales', 'conversion', 'engagement', 'reviews']),
    { message: 'metrics must be an array of valid metric types' }
  ).min(1).max(10),
});

export const recoveryEmailSchema = z.object({
  productId: z.string().uuid({ message: 'Invalid product ID' }),
  targetUserId: z.string().uuid({ message: 'Invalid target user ID' }),
  tone: z.enum(['empathic', 'direct', 'motivational']).default('empathic'),
});
```

---

## 9. Rate Limiters

### 9.1 New Limiters in `backend/src/middlewares/rateLimit/rateLimit.ts`

```typescript
// Rate limiter para Churn Prediction — operación costosa (múltiples queries + LLM)
// SPEC: 5 req/min per user
export const churnPredictionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Límite de predicciones de churn alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de predicción de churn alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para A/B Comparatives — queries SQL dobles
// SPEC: 10 req/min per user
export const compareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Límite de comparativas alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de comparativas alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});

// Rate limiter para Recovery Email — generación LLM de email
// SPEC: 10 req/min per user
export const recoveryEmailLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Límite de generación de emails alcanzado. Intenta de nuevo en 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => {
    const userId = req.user?.id;
    return userId || ipKeyGenerator(req.ip || '');
  },
  handler: (req, res, _next, options) => {
    logger.warn(
      { key: req.rateLimit?.key, path: req.path },
      'Límite de recovery emails alcanzado'
    );
    res.status(options.statusCode || 429).json(options.message);
  },
});
```

---

## 10. Orchestrator Skill Registrations

### 10.1 New Skills in `backend/src/services/ai/index.ts`

Add three entries to the `skills: Skill[]` array (following the existing `insights-ask` pattern):

```typescript
{
  id: 'insights-predict',
  name: 'Churn Prediction',
  capability: 'insights.predict',
  description: 'Predice probabilidad de abandono por alumno usando datos históricos + LLM',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
    { name: 'threshold', type: 'number', required: false },
  ],
  options: { timeout: 60000, retries: 1, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, productId, userId, threshold } = input as {
      requestingUserId: unknown; productId: unknown; userId: unknown; threshold: unknown;
    };

    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new AppError('productId is required', 400);
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AppError('userId is required', 400);
    }
    if (requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user insights', 403);
    }
    if (threshold !== undefined && (typeof threshold !== 'number' || threshold < 0 || threshold > 100)) {
      throw new AppError('threshold must be a number between 0 and 100', 400);
    }

    return insightsService.predictChurn(productId, userId, threshold);
  },
},
{
  id: 'insights-compare',
  name: 'A/B Comparatives',
  capability: 'insights.compare',
  description: 'Compara métricas entre dos períodos o productos con insight narrativo',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
    { name: 'entityType', type: 'string', required: true },
    { name: 'entityA', type: 'object', required: true },
    { name: 'entityB', type: 'object', required: true },
    { name: 'metrics', type: 'array', required: true },
  ],
  options: { timeout: 60000, retries: 1, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, userId, entityType, entityA, entityB, metrics } = input as {
      requestingUserId: unknown; userId: unknown; entityType: unknown;
      entityA: unknown; entityB: unknown; metrics: unknown;
    };

    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AppError('userId is required', 400);
    }
    if (requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user insights', 403);
    }
    if (entityType !== 'period' && entityType !== 'product') {
      throw new AppError('entityType must be "period" or "product"', 400);
    }
    if (!entityA || typeof entityA !== 'object') {
      throw new AppError('entityA must be an object', 400);
    }
    if (!entityB || typeof entityB !== 'object') {
      throw new AppError('entityB must be an object', 400);
    }
    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new AppError('metrics is required and must be a non-empty array', 400);
    }

    return insightsService.compareEntities(
      userId,
      entityType as 'period' | 'product',
      entityA as { label: string; params: Record<string, unknown> },
      entityB as { label: string; params: Record<string, unknown> },
      metrics as string[],
    );
  },
},
{
  id: 'insights-recover',
  name: 'Recovery Email Generator',
  capability: 'insights.recover',
  description: 'Genera email personalizado para recuperar alumno en riesgo',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
    { name: 'targetUserId', type: 'string', required: true },
    { name: 'tone', type: 'string', required: false },
  ],
  options: { timeout: 60000, retries: 1, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, productId, userId, targetUserId, tone } = input as {
      requestingUserId: unknown; productId: unknown; userId: unknown;
      targetUserId: unknown; tone: unknown;
    };

    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new AppError('productId is required', 400);
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AppError('userId is required', 400);
    }
    if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
      throw new AppError('targetUserId is required', 400);
    }
    if (requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user insights', 403);
    }
    if (tone !== undefined && !['empathic', 'direct', 'motivational'].includes(tone as string)) {
      throw new AppError('tone must be empathic, direct, or motivational', 400);
    }

    return insightsService.generateRecoveryEmail(
      productId, userId, targetUserId, tone as 'empathic' | 'direct' | 'motivational' | undefined
    );
  },
},
```

---

## 11. File Change Summary

| # | File | Action | Lines (est.) |
|---|------|--------|-------------|
| 1 | `backend/src/services/ai/agents.service.ts` | **Modify** — Add `predictChurn`, `generateRecoveryEmail`, `compareEntities` to `insightsService` singleton; add `sanitizeEmailHtml` helper | +350 |
| 2 | `backend/src/services/ai/index.ts` | **Modify** — Add 3 skill registrations (`insights-predict`, `insights-compare`, `insights-recover`) | +150 |
| 3 | `backend/src/routes/ai.routes.ts` | **Modify** — Add 3 endpoints, import new limiters + schemas | +120 |
| 4 | `backend/src/schemas/ai.schema.ts` | **Modify** — Add `churnPredictionSchema`, `compareSchema`, `recoveryEmailSchema` | +35 |
| 5 | `backend/src/middlewares/rateLimit/rateLimit.ts` | **Modify** — Add `churnPredictionLimiter`, `compareLimiter`, `recoveryEmailLimiter` | +75 |
| 6 | `backend/db/init/14-ai-insights-expansion.sql` | **Create** — `churn_predictions` + `recovery_emails` tables + indexes | +35 |
| 7 | `backend/src/__tests__/services/ai/agents.service.test.ts` | **Modify** — Add tests for `predictChurn`, `generateRecoveryEmail`, `compareEntities` | +300 |
| 8 | `backend/src/__tests__/ai.routes.test.ts` | **Modify** — Add integration tests for 3 new endpoints | +150 |
| 9 | `docs/project/reusable-resources.md` | **Modify** — Update §3 AI Services + §10 Init Script Inventory | +10 |

**Total estimated new/modified lines**: ~1225

---

## 12. Test Strategy

### 12.1 Unit Tests (`backend/src/__tests__/services/ai/agents.service.test.ts`)

Mock: `pool`, `llmService`, `aiCreditService`, `getValidatedSchema`, `logger`

| Test Group | Tests |
|------------|-------|
| `predictChurn` | Returns predictions for product with students; returns empty when no students; throws 402 when no credits; throws 403 when not owner; respects threshold filter; persists to `churn_predictions`; score is in 0-100 range |
| `generateRecoveryEmail` | Generates email with subject + bodyHtml + previewText; uses default tone (empathic); respects custom tone; throws 402 when no credits; sanitizes HTML output (no script tags); persists to `recovery_emails` |
| `compareEntities` | Compares two products; compares two periods; throws 403 when not owner of compared product; throws 400 for invalid entityType; returns deltas with correct calculations; persists to `ab_comparatives` |

### 12.2 Integration Tests (`backend/src/__tests__/ai.routes.test.ts`)

| Endpoint | Tests |
|----------|-------|
| `POST /api/ai/insights/predict/churn` | 200 with valid input; 401 without JWT; 403 when not owner; 400 with invalid productId; 402 when no credits; 429 when rate limit exceeded |
| `POST /api/ai/insights/compare` | 200 for period comparison; 200 for product comparison; 400 when entityType invalid; 403 when not owner of compared product |
| `POST /api/ai/insights/recover/email` | 200 with valid input; 200 with custom tone; 400 with invalid targetUserId; bodyHtml contains no script tags |

### 12.3 Contract for Mock Setup

```typescript
// llmService mock pattern (existing in services/ai/agents.service.test.ts)
vi.mock('../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    buildPrompt: vi.fn((system, context, question) => [
      { role: 'system', content: system },
      { role: 'system', content: `Context:\n${context}` },
      { role: 'user', content: `[USER_INPUT_START]\n${question}\n[USER_INPUT_END]` },
    ]),
    getProvider: () => 'simulator',
    isConfigured: () => false,
  },
}));

// aiCreditService mock must also mock getOperationCost + getBalance + useCredits
vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    getOperationCost: vi.fn().mockReturnValue(1),
    getBalance: vi.fn().mockResolvedValue({ balance: 100, expiresAt: new Date() }),
    useCredits: vi.fn().mockResolvedValue(undefined),
  },
}));
```

---

## 13. Error Handling & Observability

### 13.1 Error Flow

```
Route handler
  │
  ├── Zod validation fails → 400 (handled by validate middleware)
  ├── JWT missing/invalid → 401 (handled by jwtAuthMiddleware)
  ├── Rate limit exceeded → 429 (handled by rate limiter)
  ├── Not product owner → 403 AppError (thrown in route)
  ├── Credits insufficient → 402 AppError (thrown in service)
  ├── LLM call fails → 502 AppError (caught in service, logged, re-thrown)
  ├── SQL execution fails → 500 AppError (caught, logged with sanitized SQL)
  └── Unexpected error → 500 AppError (caught by global error handler)
```

### 13.2 Logging

```typescript
// Start of operation
logger.info({ userId, productId }, 'Churn prediction requested');

// Credit check
logger.info({ userId, cost: 5, balance }, 'Credits verified for churn prediction');

// Data queries complete
logger.info({ studentCount: 15 }, 'Student data collected for churn prediction');

// LLM call
logger.info({ promptLength: 2500 }, 'LLM churn narrative requested');

// Persistence
logger.info({ predictionsStored: 15 }, 'Churn predictions persisted');

// Error cases
logger.warn({ userId, productId, reason: 'not_owner' }, 'Churn prediction denied');
logger.error({ error: err.message, sql: sanitizedSql }, 'Churn data query failed');
```

### 13.3 No Sensitive Data in Logs

- Never log `targetUserId` email content
- Never log LLM-generated email bodies at info/warn level
- Sanitize SQL in error logs (already done in existing `insightsService.query`)
- Log `productId`, `userId`, `studentCount`, `promptLength` — never actual prompts

---

## 14. Rollback Plan

1. Comment out the 3 skill registrations in `backend/src/services/ai/index.ts` (ids: `insights-predict`, `insights-compare`, `insights-recover`)
2. Comment out the 3 route definitions in `routes/ai.routes.ts`
3. Comment out the 3 rate limiter exports in `rateLimit/rateLimit.ts`
4. Restart backend
5. Existing `insights.ask`, `insights.stream`, and dashboards CRUD are unaffected
6. Tables `churn_predictions` and `recovery_emails` remain (harmless, no data writes without active service)
7. Schema exports (`churnPredictionSchema`, etc.) are harmless if not imported
8. Full revert: `git revert <commit>`

---

## 15. Trade-offs & Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Extend `insightsService` vs new services | Extend singleton | Shared domain, pool, credits, auth; 700 lines is acceptable |
| Heuristics vs ML for churn | Heuristics + LLM | v1 lacks data volume for ML; LLM adds qualitative value heuristics alone can't |
| Generate vs Send email | Generate only | Creator must review before sending; future NotificationService will handle sending |
| Dedicated tables vs JSON in history | Dedicated tables | `WHERE churn_score > 70` requires typed column indexing |
| `validateGeneratedSQL` reuse | Yes, identical pipeline | Proven SQL injection defense; no need to reinvent |
| Compare timeout | 30s | Two SQL queries + LLM analysis; generous for complex queries |
| HTML sanitization | `sanitize-html` library | Battle-tested allowlist approach; regex-based sanitization is brittle and misses edge cases |
| New init script vs append to existing | New `14-*.sql` | Idempotent `IF NOT EXISTS`; cleaner separation; follows existing naming convention |

---

## 16. References

- Proposal: `docs/project/ai-features/sdd/ai-insights-expansion/proposal.md`
- Spec: `docs/project/ai-features/sdd/ai-insights-expansion/spec.md`
- Current `insightsService`: `backend/src/services/ai/agents.service.ts` (line 927+)
- Current routes: `backend/src/routes/ai.routes.ts` (line 1864+)
- Rate limiters: `backend/src/middlewares/rateLimit/rateLimit.ts`
- Orchestrator skills: `backend/src/services/ai/index.ts`
- DB init scripts: `backend/db/init/05-ai-tables.sql`
- Init script inventory: `docs/project/reusable-resources.md` §10
- Schemas: `backend/src/schemas/ai.schema.ts`
- Tests: `backend/src/__tests__/services/ai/agents.service.test.ts`
- OpenSpec config: `openspec/config.yaml` (strict_tdd: true, vitest)
