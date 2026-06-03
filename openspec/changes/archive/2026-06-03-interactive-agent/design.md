# SDD Design: Interactive Agent (Talleres Dinámicos)

**Change**: interactive-agent
**Type**: AI Feature
**SDD Phase**: Design
**Status**: ✅ COMPLETED
**Date**: Mayo 2026
**Owner**: Kike García
**Implementation note**: After adversarial judgment (3 rounds), all 11 SDD tasks completed and merged to master (commit eb30679). 1231 tests passing. Key features: idempotent credit flow, retry pattern, parallelized queries, field type validation.

---

## 1. Architecture

### 1.1 File Structure

```
backend/src/
├── services/ai/
│   └── interactive-agent.service.ts      # Singleton service
├── repositories/ai/
│   └── interactive-agent.repository.ts   # Repository singleton
├── routes/
│   └── interactive.routes.ts              # Route definitions
└── types/
    └── interactive.types.ts              # TypeScript interfaces

backend/db/init/
└── 12-interactive-agent.sql              # DB schema + seeds

backend/src/__tests__/
├── services/ai/interactive-agent.service.test.ts
└── repositories/ai/interactive-agent.repository.test.ts
```

### 1.2 Service Pattern

Uses **Singleton service** pattern (same as `qaAgentService`, `tutorService`):

```typescript
// src/services/ai/interactive-agent.service.ts
// ============================================================================
// Helper functions (standalone — NOT private methods on object literal)
// ============================================================================

function buildAnalysisSystemPrompt(productName: string, moduleKey: string): string {
  return `Eres un analista de negocios para el producto "${productName}".
El usuario ha completado el módulo "${moduleKey}" con los siguientes datos que ingresó:

Genera un análisis personalizado que incluya:
1. Análisis basado en estos datos específicos
2. Recomendaciones actionables (máx 5)
3. Próximos pasos concretos (máx 3)
4. Métricas calculadas si aplica

Responde en JSON con este formato:
{
  "analysis": "string",
  "recommendations": ["string"],
  "nextSteps": ["string"],
  "metrics": {}
}`;
}

function formatUserDataForPrompt(inputData: Record<string, unknown>, fields: FieldConfigRow[]): string {
  return Object.entries(inputData)
    .map(([key, value]) => {
      const field = fields.find(f => f.field_name === key);
      const label = field?.field_label || key;
      return `- ${label}: ${value}`;
    })
    .join('\n');
}

function parseAnalysisResponse(raw: string): Omit<AnalysisResult, 'creditsUsed'> {
  try {
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.analysis || !parsed.recommendations) {
      throw new Error('Invalid response structure');
    }
    return {
      analysis: parsed.analysis,
      recommendations: parsed.recommendations,
      nextSteps: parsed.nextSteps ?? [],
      metrics: parsed.metrics ?? {},
    };
  } catch {
    // Fallback graceful — NO lanza error
    return {
      analysis: 'Análisis no disponible por el momento.',
      recommendations: ['Intenta nuevamente más tarde'],
      nextSteps: [],
      metrics: {},
    };
  }
}

// ============================================================================
// Service
// ============================================================================

export const interactiveAgentService = {
  // Field config
  async getFields(productId: string, userId: string): Promise<ModuleFieldConfig[]>,
  async createFields(productId: string, userId: string, moduleKey: string, fields: FieldConfig[]): Promise<void>,

  // User data
  async getUserData(productId: string, userId: string, moduleKey?: string): Promise<UserModuleData[]>,
  async saveUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void>,
  async updateUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void>,

  // Analysis
  async analyzeData(productId: string, userId: string, moduleKey: string): Promise<AnalysisResult>,

  // Analytics (creator only)
  async getAnalytics(productId: string, creatorId: string): Promise<AnalyticsResult>,
}
```

### 1.3 Repository Pattern

```typescript
// src/repositories/ai/interactive-agent.repository.ts
export const interactiveAgentRepository = {
  // Field config (creator)
  async findFieldsByProduct(productId: string): Promise<FieldConfig[]>
  async upsertFields(productId: string, moduleKey: string, fields: FieldConfig[]): Promise<void>
  async deleteFields(productId: string, moduleKey: string): Promise<void>

  // User data
  async findUserData(userId: string, productId: string, moduleKey?: string): Promise<UserDataRow[]>
  async upsertUserData(userId: string, productId: string, moduleKey: string, inputData: Record<string, unknown>, outputAnalysis?: Record<string, unknown>, completed?: boolean): Promise<void>

  // Analytics (agregado, sin datos personales)
  async getAggregatedStats(productId: string): Promise<AggregatedStats>

  // Helpers
  async hasProductAccess(userId: string, productId: string): Promise<boolean>
  async hasActiveOrder(userId: string, productId: string): Promise<boolean>
  async isProductOwner(userId: string, productId: string): Promise<boolean>

  // Mapping: DB snake_case → service camelCase
  mapRowToUserData(row: UserDataRow): UserModuleData {
    return {
      moduleKey: row.module_key,
      inputData: row.input_data,
      outputAnalysis: row.output_analysis,
      completedAt: row.completed_at?.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
```

---

## 2. Database Schema

### 2.1 Init Script (`db/init/12-interactive-agent.sql`)

```sql
-- Interactive Agent tables for dynamic workshops
-- Phase: Analytics + IA Avanzada (AI-FEATURES-PRD §2.5)

BEGIN;

-- ============================================================================
-- user_course_data: Datos del usuario por producto/módulo
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_course_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL,
    input_data JSONB NOT NULL DEFAULT '{}',
    output_analysis JSONB,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id, module_key)
);

COMMENT ON TABLE user_course_data IS 'User-specific course/module data for interactive workshops';
COMMENT ON COLUMN user_course_data.input_data IS 'JSON: user answers for module fields';
COMMENT ON COLUMN user_course_data.output_analysis IS 'JSON: AI-generated analysis results';
COMMENT ON COLUMN user_course_data.completed IS 'Boolean flag indicating if the user completed the module (all required fields filled + analysis generated)';
COMMENT ON COLUMN user_course_data.completed_at IS 'Timestamp when user completed the module';

-- ============================================================================
-- product_module_fields: Configuración de campos por módulo (creator defines)
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_module_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    module_key VARCHAR(100) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('number', 'string', 'boolean', 'select')),
    field_label VARCHAR(255) NOT NULL,
    field_placeholder VARCHAR(255),
    field_options JSONB DEFAULT '[]',
    field_required BOOLEAN DEFAULT false,
    field_validation JSONB DEFAULT '{}',
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, module_key, field_name)
);

COMMENT ON TABLE product_module_fields IS 'Creator-defined input fields per module for interactive workshops';
COMMENT ON COLUMN product_module_fields.field_type IS 'Type: number, string, boolean, select';
COMMENT ON COLUMN product_module_fields.field_options IS 'JSON array for select type: [{value, label}]';
COMMENT ON COLUMN product_module_fields.field_validation IS 'JSON: {min, max, pattern} for validation';

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_course_data_updated_at
    BEFORE UPDATE ON user_course_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER product_module_fields_updated_at
    BEFORE UPDATE ON product_module_fields
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_course_data_user ON user_course_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_product ON user_course_data(product_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_module ON user_course_data(module_key);
CREATE INDEX IF NOT EXISTS idx_user_course_data_created ON user_course_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_product ON product_module_fields(product_id);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_module ON product_module_fields(module_key);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_order ON product_module_fields(product_id, module_key, order_index);

COMMIT;
```

---

## 3. API Implementation

### 3.1 Route Definition

```typescript
// src/routes/interactive.routes.ts
import { Router } from 'express';
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { validate } from '../middlewares/auth/validate.middleware';
import { interactiveAgentLimiter } from '../middlewares/rateLimit/rateLimit';
import { interactiveAgentService } from '../services/ai/interactive-agent.service';
import { createFieldConfigSchema, createFieldInputSchema, updateFieldInputSchema } from '../schemas/interactive.schema';

const router = Router();

// All routes require authentication
router.use(jwtAuthMiddleware);

// Crea/actualiza campos por módulo (creator only)
router.post(
  '/fields/:productId',
  restrictTo('CREATOR'),
  validate(createFieldConfigSchema),
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const { moduleKey, fields } = req.body;
    await interactiveAgentService.createFields(productId, userId, moduleKey, fields);
    res.json({ success: true });
  })
);

// Obtiene campos configurados (comprador o creator)
// Nota: access control se aplica en service layer — getFields() llama hasProductAccess()
// que verifica hasActiveOrder() o isProductOwner() antes de retornar datos
router.get(
  '/fields/:productId',
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const fields = await interactiveAgentService.getFields(productId, userId);
    res.json({ modules: fields });
  })
);

// Guarda datos del usuario (comprador)
router.post(
  '/data/:productId',
  validate(createFieldInputSchema),
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const { moduleKey, inputData } = req.body;
    await interactiveAgentService.saveUserData(productId, userId, moduleKey, inputData);
    res.json({ success: true, savedAt: new Date().toISOString() });
  })
);

// Actualiza datos existentes
router.put(
  '/data/:productId/:moduleKey',
  validate(updateFieldInputSchema),
  asyncHandler(async (req, res) => {
    const { productId, moduleKey } = req.params;
    const userId = req.user.id;
    const { inputData } = req.body;
    await interactiveAgentService.updateUserData(productId, userId, moduleKey, inputData);
    res.json({ success: true, savedAt: new Date().toISOString() });
  })
);

// Obtiene mis datos guardados
router.get(
  '/data/:productId',
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const moduleKey = req.query.moduleKey as string | undefined;
    const data = await interactiveAgentService.getUserData(productId, userId, moduleKey);
    res.json({ modules: data });
  })
);

// Solicita análisis IA (rate limited)
router.post(
  '/analyze/:productId/:moduleKey',
  interactiveAgentLimiter,
  asyncHandler(async (req, res) => {
    const { productId, moduleKey } = req.params;
    const userId = req.user.id;
    const result = await interactiveAgentService.analyzeData(productId, userId, moduleKey);
    res.json(result);
  })
);

// Analytics para creator
router.get(
  '/analytics/:productId',
  restrictTo('CREATOR'),
  asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const userId = req.user.id;
    const result = await interactiveAgentService.getAnalytics(productId, userId);
    res.json(result);
  })
);

export default router;
```

### 3.2 Route Access Control

| Route | Auth | Access Control |
|-------|------|----------------|
| `POST /fields/:productId` | CREATOR | `restrictTo('CREATOR')` + ownership check en service |
| `GET /fields/:productId` | JWT | Buyer (hasActiveOrder) o Creator (ownership) |
| `POST /data/:productId` | JWT | Buyer only (hasActiveOrder) |
| `PUT /data/:productId/:moduleKey` | JWT | Buyer only (hasActiveOrder) |
| `GET /data/:productId` | JWT | Buyer only (hasActiveOrder) |
| `POST /analyze/:productId/:moduleKey` | JWT | Buyer only (hasActiveOrder) |
| `GET /analytics/:productId` | CREATOR | `restrictTo('CREATOR')` + ownership check en service |

### 3.3 Rate Limiter

```typescript
// src/middlewares/rateLimit/rateLimit.ts
export const interactiveAgentLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 analysis requests per minute per user
  message: {
    success: false,
    error: 'Demasiadas solicitudes de análisis. Intenta de nuevo en un minuto.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.id || req.ip}:interactive`,
});
```

---

## 4. Service Implementation

### 4.1 Constants

```typescript
const CREDIT_COST_SAVE = 1;
const CREDIT_COST_ANALYSIS = 3;
const MAX_INPUT_DATA_SIZE = 50 * 1024; // 50KB
const MAX_FIELDS_PER_MODULE = 50;
```

### 4.2 Access Control Helper

```typescript
async function verifyProductAccess(productId: string, userId: string, requiredRole: 'buyer' | 'creator'): Promise<void> {
  if (requiredRole === 'creator') {
    const isOwner = await interactiveAgentRepository.isProductOwner(userId, productId);
    if (!isOwner) {
      throw new AppError('INTERACTIVE_NOT_PRODUCT_OWNER', 403);
    }
  } else {
    const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
    if (!hasOrder) {
      throw new AppError('INTERACTIVE_NO_PRODUCT_ACCESS', 403);
    }
  }
}
```

### 4.3 Analysis Logic

```typescript
// src/services/ai/interactive-agent.service.ts

async analyzeData(productId: string, userId: string, moduleKey: string): Promise<AnalysisResult> {
  // 1. Verificar acceso como comprador
  const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
  if (!hasOrder) {
    throw new AppError('INTERACTIVE_NO_PRODUCT_ACCESS', 403);
  }

  // 2. Verificar credit balance
  const cost = CREDIT_COST_ANALYSIS;
  const credits = await aiCreditService.getBalance(userId);
  if (credits.balance < cost) {
    throw new AppError('INTERACTIVE_INSUFFICIENT_CREDITS', 402);
  }

  // 3. Obtener user data + field config
  const userData = await interactiveAgentRepository.findUserData(userId, productId, moduleKey);
  if (!userData.length) {
    throw new AppError('INTERACTIVE_NO_DATA_TO_ANALYZE', 404);
  }

  const fields = await interactiveAgentRepository.findFieldsByProduct(productId);
  const moduleFields = fields.filter(f => f.module_key === moduleKey);

  // 3b. Validate all required fields are present before burning credits
  const requiredFields = moduleFields.filter(f => f.field_required);
  const inputData = userData[0].input_data;
  const missingRequired = requiredFields.filter(f => !Object.prototype.hasOwnProperty.call(inputData, f.field_name));
  if (missingRequired.length > 0) {
    throw new AppError('INTERACTIVE_INCOMPLETE_FIELDS', 400);
  }

  // 4. Obtener producto
  const product = await productRepository.getProductById(productId);
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 404);
  }

  // 5. Construir prompt (user data va en userQuestion para delimiters)
  const systemPrompt = buildAnalysisSystemPrompt(product.title, moduleKey);
  const userQuestion = formatUserDataForPrompt(userData[0].input_data, moduleFields);
  const messages = llmService.buildPrompt(systemPrompt, '', userQuestion);

  // 6. Llamar LLM
  const response = await llmService.chat({
    messages,
    model: config.ai.openaiModel,
    temperature: 0.7,
    maxTokens: 1000,
  });

  // 7. Parsear respuesta y guardar (con fallback graceful)
  const analysis = parseAnalysisResponse(response.content);
  // completed_at set here intentionally — UI prevents calling analyze before all required fields are filled
  await interactiveAgentRepository.upsertUserData(
    userId, productId, moduleKey, userData[0].input_data, analysis, true // completed_at = NOW()
  );

  // 8. Consumir créditos (después del DB write ok — si falla, credit no se consume)
  await aiCreditService.useCredits(userId, cost, `Interactive analysis: ${productId}/${moduleKey}`);

  return { ...analysis, creditsUsed: cost };
```

### 4.4 Credit Consumption en saveUserData

```typescript
async saveUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void> {
  // 1. Verificar acceso como comprador
  const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
  if (!hasOrder) {
    throw new AppError('INTERACTIVE_NO_PRODUCT_ACCESS', 403);
  }

  // 2. Verificar tamaño máximo (50KB)
  let dataSize: number;
  try {
    dataSize = Buffer.byteLength(JSON.stringify(inputData), 'utf8');
  } catch {
    throw new AppError('INTERACTIVE_INVALID_DATA', 400);
  }
  if (dataSize > MAX_INPUT_DATA_SIZE) {
    throw new AppError('INTERACTIVE_DATA_TOO_LARGE', 400);
  }

  // 3. Check if row exists (only charge on first insert, not on update)
  const existing = await interactiveAgentRepository.findUserData(userId, productId, moduleKey);
  const isNew = !existing.length;

  // 4. Guardar datos
  await interactiveAgentRepository.upsertUserData(userId, productId, moduleKey, inputData);

  // 5. Consumir 1 crédito SOLO en insert (no en update via saveUserData)
  if (isNew) {
    await aiCreditService.useCredits(userId, CREDIT_COST_SAVE, `Interactive save: ${productId}/${moduleKey}`);
  }
}

async updateUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void> {
  // 1. Verificar acceso como comprador
  const hasOrder = await interactiveAgentRepository.hasActiveOrder(userId, productId);
  if (!hasOrder) {
    throw new AppError('INTERACTIVE_NO_PRODUCT_ACCESS', 403);
  }

  // 2. Verificar tamaño máximo (50KB)
  let dataSize: number;
  try {
    dataSize = Buffer.byteLength(JSON.stringify(inputData), 'utf8');
  } catch {
    throw new AppError('INTERACTIVE_INVALID_DATA', 400);
  }
  if (dataSize > MAX_INPUT_DATA_SIZE) {
    throw new AppError('INTERACTIVE_DATA_TOO_LARGE', 400);
  }

  // 3. Verify data exists before updating (bypasses save credit charge if row doesn't exist)
  const existing = await interactiveAgentRepository.findUserData(userId, productId, moduleKey);
  if (!existing.length) {
    throw new AppError('INTERACTIVE_NO_DATA', 404);
  }

  // 4. Actualizar datos (0 créditos extra — el usuario ya pagó al guardar la primera vez)
  await interactiveAgentRepository.upsertUserData(userId, productId, moduleKey, inputData);
}
```

---

## 5. Security Checklist

| Check | Implementation |
|-------|----------------|
| Auth | `jwtAuthMiddleware` on all routes |
| Buyer access | `hasActiveOrder()` check in `saveUserData`, `updateUserData`, `analyzeData` |
| Creator ownership | `isProductOwner()` check in `createFields`, `getAnalytics` |
| Input validation | Zod schemas on all POST/PUT |
| SQL injection | Parameterized queries only |
| Credit check | Before analysis, check balance |
| Rate limiting | `interactiveAgentLimiter` on `/analyze` |
| No PII logging | `input_data` excluded from error logs |
| Max data size | `Buffer.byteLength(JSON.stringify(inputData), 'utf8') > MAX_INPUT_DATA_SIZE` check in service |
| UUID validation | `UUID_REGEX` check en route handler para `:productId` params |

---

## 6. Testing Strategy

### 6.1 Unit Tests

```typescript
// src/__tests__/services/ai/interactive-agent.service.test.ts

describe('interactiveAgentService', () => {
  describe('getFields', () => {
    it('should return empty array when no fields configured', async () => {
      // mock: no fields in DB
      // verify: returns []
    });
    it('should group fields by module_key', async () => {
      // mock: 3 fields across 2 modules
      // verify: 2 module groups with correct field counts
    });
  });

  describe('saveUserData', () => {
    it('should throw if user has no active order', async () => {
      // mock: hasActiveOrder → false
      // verify: throws AppError('INTERACTIVE_NO_PRODUCT_ACCESS', 403)
    });
    it('should throw if data exceeds 50KB', async () => {
      // mock: inputData > 50KB
      // verify: throws AppError('INTERACTIVE_DATA_TOO_LARGE', 400)
    });
    it('should consume 1 credit on save', async () => {
      // mock: valid data + hasActiveOrder → true
      // verify: aiCreditService.useCredits called with amount=1
    });
  });

  describe('analyzeData', () => {
    it('should throw if insufficient credits', async () => {
      // mock: balance = 0
      // verify: throws AppError('INTERACTIVE_INSUFFICIENT_CREDITS', 402)
    });
    it('should save analysis result to output_analysis', async () => {
      // mock: valid data + credits + LLM response
      // verify: interactiveAgentRepository.upsertUserData called with outputAnalysis
    });
    it('should use productRepository.getProductById (not findById)', async () => {
      // verify: productRepository.getProductById called
    });
  });
});
```

### 6.2 Coverage Target

- Service methods: >= 80%
- Repository: >= 80%
- Routes: >= 70%

---

## 7. Out of Scope Decisions

| Decision | Reason |
|----------|--------|
| No BullMQ async | v1 análisis es simple y rápido |
| No Orchestrator integration | v1 standalone; v2 puede integrar |
| No webhook notifications | v1 user polling acceptable |
| No multi-language prompts | v1 solo español |
| No field dependency logic | Fields son independientes, no se validan dependencias entre módulos |
| No Redis cache para análisis | v1 no cache; se puede agregar después |

---

## 8. API Corrections (vs versiones anteriores)

| Doc anterior decía | Corrección |
|--------------------|------------|
| `getFields(productId)` sin userId | `getFields(productId: string, userId: string)` |
| `createFields(productId, userId, fields)` sin moduleKey | `createFields(productId, userId, moduleKey, fields)` |
| `productRepository.findById` | `productRepository.getProductById` |
| `llmService.chat(model, messages, { ... })` | `llmService.chat({ messages, model, ... })` |
| `saveUserData` sin credit consumption | Agregar `aiCreditService.useCredits(userId, 1, ...)` |
| `analyzeData` sin check de `hasActiveOrder` | Agregar en service antes de procesar |
| 50KB limit mentioned pero no enforced | Agregar check `Buffer.byteLength(JSON.stringify(inputData), 'utf8') > MAX_INPUT_DATA_SIZE` |
| "分析师" en prompt | Corregido a "analista" |
| No `completed_at` en tabla | Agregado `completed_at TIMESTAMPTZ` a `user_course_data` |