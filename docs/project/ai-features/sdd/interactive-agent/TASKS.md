# SDD Tasks: Interactive Agent (Talleres Dinámicos)

**Change**: interactive-agent
**Type**: AI Feature
**SDD Phase**: Tasks
**Status**: Draft
**Date**: Mayo 2026
**Owner**: Kike García
**Depends on**: design.md

---

## Task List

| # | Task | Priority | Depende de |
|---|------|:---------:|------------|
| 1 | Crear DB init script `12-interactive-agent.sql` | 🔴 ALTA | - |
| 2 | Crear TypeScript types en `types/interactive.types.ts` | 🔴 ALTA | - |
| 3 | Crear Zod schemas en `schemas/interactive.schema.ts` | 🔴 ALTA | - |
| 4 | Crear repository `repositories/ai/interactive-agent.repository.ts` | 🔴 ALTA | 1 |
| 5 | Crear service `services/ai/interactive-agent.service.ts` | 🔴 ALTA | 2, 4 |
| 6 | Crear routes `routes/interactive.routes.ts` | 🔴 ALTA | 5 |
| 7 | Registrar routes en `app.ts` | 🔴 ALTA | 6 |
| 8 | Agregar rate limiter `interactiveAgentLimiter` | 🟡 MEDIA | 6 |
| 9 | Unit tests del service | 🟡 MEDIA | 5 |
| 10 | Unit tests del repository | 🟡 MEDIA | 4 |
| 11 | Unit tests de routes | 🟡 MEDIA | 6 |

---

## Task Details

### Task 1: DB Init Script

**Archivo:** `backend/db/init/12-interactive-agent.sql`

**Contenido:**
- Tabla `user_course_data` (user_id, product_id, module_key, input_data JSONB, output_analysis JSONB, timestamps, UNIQUE)
- Tabla `product_module_fields` (product_id, module_key, field_name, field_type, field_label, field_placeholder, field_options JSONB, field_required, field_validation JSONB, order_index, timestamps, UNIQUE)
- Triggers `update_updated_at_column()`
- Índices: idx_user_course_data_user, idx_user_course_data_product, idx_user_course_data_module, idx_user_course_data_created, idx_product_module_fields_product, idx_product_module_fields_module, idx_product_module_fields_order

**Validación:**
```bash
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_name IN ('user_course_data', 'product_module_fields');"
# Debe mostrar ambas tablas
```

---

### Task 2: TypeScript Types

**Archivo:** `backend/src/types/interactive.types.ts`

```typescript
export interface FieldConfig {
  moduleKey: string;
  fieldName: string;
  fieldType: 'number' | 'string' | 'boolean' | 'select';
  fieldLabel: string;
  fieldPlaceholder?: string;
  fieldOptions?: Array<{ value: string; label: string }>;
  fieldRequired?: boolean;
  fieldValidation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  orderIndex?: number;
}

export interface ModuleFieldConfig {
  moduleKey: string;
  fields: FieldConfig[];
}

export interface UserModuleData {
  moduleKey: string;
  inputData: Record<string, unknown>;
  outputAnalysis?: Record<string, unknown>;
  completedAt?: string;
  updatedAt: string;
}

export interface AnalysisResult {
  analysis: string;
  recommendations: string[];
  nextSteps: string[];
  metrics: Record<string, unknown>;
  creditsUsed: number;
}

export interface AnalyticsResult {
  totalUsers: number;
  completedModules: number;
  averageCompletion: number;
  fieldStats: Array<{
    fieldName: string;
    moduleKey: string;
    average: number;
    responses: number;
  }>;
  recentActivity: Array<{
    userId: string;
    moduleKey: string;
    completedAt: string;
  }>;
}
```

**Validación:**
```bash
pnpm tsc --noEmit
# Sin errores
```

---

### Task 3: Zod Schemas

**Archivo:** `backend/src/schemas/interactive.schema.ts`

**Schema a crear:**
- `fieldConfigSchema` — valida un field individual
- `createFieldConfigSchema` — valida `{ moduleKey, fields[] }` para POST /fields
- `createFieldInputSchema` — valida `{ moduleKey, inputData }` para POST data
- `updateFieldInputSchema` — valida `{ inputData }` para PUT data

**Reglas de validación:**
- `moduleKey`: regex `/^[a-z0-9_]+$/`, max 100 chars
- `fieldName`: regex `/^[a-z0-9_]+$/`, max 100 chars
- `fieldType`: enum `('number' | 'string' | 'boolean' | 'select')`
- `inputData`: object, valores pueden ser `number | string | boolean`
- `fieldOptions`: array de `{ value: string, label: string }` (solo si fieldType='select')

**Validación:**
```bash
pnpm test -- --grep "interactive"
# Tests pasan
```

---

### Task 4: Repository

**Archivo:** `backend/src/repositories/ai/interactive-agent.repository.ts`

**Métodos:**
```typescript
export const interactiveAgentRepository = {
  // Fields (creator config)
  async findFieldsByProduct(productId: string): Promise<FieldConfigRow[]>
  async upsertFields(productId: string, moduleKey: string, fields: FieldConfig[]): Promise<void>
  async deleteFieldsByModule(productId: string, moduleKey: string): Promise<void>

  // User data
  async findUserData(userId: string, productId: string, moduleKey?: string): Promise<UserDataRow[]>
  async upsertUserData(
    userId: string,
    productId: string,
    moduleKey: string,
    inputData: Record<string, unknown>,
    outputAnalysis?: Record<string, unknown>,
    completed?: boolean
  ): Promise<void>

  // Analytics (agregado, sin datos personales)
  async getAggregatedStats(productId: string): Promise<AggregatedStats>
  async countUserStats(productId: string): Promise<{ distinctUsers: number; completedModules: number }>

  // Access helpers
  async hasProductAccess(userId: string, productId: string): Promise<boolean>
  async isProductOwner(userId: string, productId: string): Promise<boolean>
  async hasActiveOrder(userId: string, productId: string): Promise<boolean>
}
```

**Notas:**
- Todas las queries usan `pool.query` con parámetros (`$1`, `$2`, etc.)
- No usar `format()` ni string concatenation para queries
- Usar `getValidatedSchema()` para el nombre del schema

**Validación:**
```bash
pnpm tsc --noEmit
pnpm test -- --grep "interactive.*repository"
# Tests pasan
```

---

### Task 5: Service

**Archivo:** `backend/src/services/ai/interactive-agent.service.ts`

**Métodos:**
```typescript
export const interactiveAgentService = {
  // Field config
  async getFields(productId: string, userId: string): Promise<ModuleFieldConfig[]>
  async createFields(productId: string, userId: string, moduleKey: string, fields: FieldConfig[]): Promise<void>

  // User data
  async getUserData(productId: string, userId: string, moduleKey?: string): Promise<UserModuleData[]>
  async saveUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void>
  async updateUserData(productId: string, userId: string, moduleKey: string, inputData: Record<string, unknown>): Promise<void>

  // Analysis
  async analyzeData(productId: string, userId: string, moduleKey: string): Promise<AnalysisResult>

  // Analytics
  async getAnalytics(productId: string, creatorId: string): Promise<AnalyticsResult>
}
```

**Constantes:**
```typescript
const CREDIT_COST_SAVE = 1;
const CREDIT_COST_ANALYSIS = 3;
const MAX_INPUT_DATA_SIZE = 50 * 1024; // 50KB
const MAX_FIELDS_PER_MODULE = 50;
```

**Validación:**
```bash
pnpm tsc --noEmit
pnpm test -- --grep "interactive.*service"
# Tests pasan
```

---

### Task 6: Routes

**Archivo:** `backend/src/routes/interactive.routes.ts`

**Endpoints:**
| Method | Path | Auth | Handler |
|--------|------|------|---------|
| POST | `/interactive/fields/:productId` | CREATOR | `createFields` |
| GET | `/interactive/fields/:productId` | JWT | `getFields` |
| POST | `/interactive/data/:productId` | JWT | `saveUserData` |
| PUT | `/interactive/data/:productId/:moduleKey` | JWT | `updateUserData` |
| GET | `/interactive/data/:productId` | JWT | `getUserData` |
| POST | `/interactive/analyze/:productId/:moduleKey` | JWT | `analyzeData` |
| GET | `/interactive/analytics/:productId` | CREATOR | `getAnalytics` |

**Middleware chain:**
- POST/GET `/fields/:productId` (creator): `restrictTo('CREATOR') → validate(createFieldConfigSchema)` (jwtAuthMiddleware ya global en routes)
- GET `/fields/:productId` (buyer): (jwtAuthMiddleware ya global en routes)
- POST `/data/:productId`: `validate(createFieldInputSchema)` (jwtAuthMiddleware ya global en routes)
- PUT `/data/:productId/:moduleKey`: `validate(updateFieldInputSchema)` (jwtAuthMiddleware ya global en routes)
- GET `/data/:productId`: (jwtAuthMiddleware ya global en routes)
- POST `/analyze/:productId/:moduleKey`: `interactiveAgentLimiter` (jwtAuthMiddleware ya global en routes)
- GET `/analytics/:productId`: `restrictTo('CREATOR')` (jwtAuthMiddleware ya global en routes)

**Validación:**
```bash
pnpm tsc --noEmit
pnpm test -- --grep "interactive.*route"
# Tests pasan
```

---

### Task 7: Register Routes

**Archivo:** `backend/src/app.ts`

**Agregar:**
```typescript
import interactiveRoutes from './routes/interactive.routes';
// ...
app.use('/api/interactive', interactiveRoutes);
```

**Validación:**
```bash
pnpm tsc --noEmit
```

---

### Task 8: Rate Limiter

**Archivo:** `backend/src/middlewares/rateLimit/rateLimit.ts`

**Agregar:**
```typescript
export const interactiveAgentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: 'Demasiadas solicitudes de análisis. Intenta de nuevo en un minuto.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.user?.id || req.ip}:interactive`,
});
```

**Validación:**
```bash
pnpm tsc --noEmit
```

---

### Task 9-11: Tests

**Archivos:**
- `backend/src/__tests__/services/ai/interactive-agent.service.test.ts`
- `backend/src/__tests__/repositories/ai/interactive-agent.repository.test.ts`
- `backend/src/__tests__/routes/interactive.routes.test.ts`

**Patrón de mocks** (ver `reusable-resources.md`):
```typescript
vi.mock('../../../db/postgres', () => ({
  default: { query: vi.fn() },
}));

vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: { getBalance: vi.fn(), useCredits: vi.fn() },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: { buildPrompt: vi.fn(), chat: vi.fn() },
}));
```

**Validación:**
```bash
pnpm test -- --grep "interactive"
# Todos pasan
```

---

## Implementation Order

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11
```

## Verification Checklist

| Command | Expected |
|---------|----------|
| `pnpm tsc --noEmit` | Sin errores |
| `pnpm lint --filter backend` | Sin errores/warnings |
| `pnpm test -- --grep "interactive"` | 100% passing |
| `psql -c "SELECT * FROM user_course_data LIMIT 1"` | Sin error (tabla existe) |
| `psql -c "SELECT * FROM product_module_fields LIMIT 1"` | Sin error (tabla existe) |

---

## Definition of Done

- [ ] Todas las tasks completadas
- [ ] `pnpm tsc --noEmit` sin errores
- [ ] `pnpm lint --filter backend` sin errores/warnings
- [ ] Tests passing (coverage >= 80% service, >= 70% routes)
- [ ] Tablas creadas en DB (via init script o migration manual)
- [ ] Routes respondiendo correctamente (probar con curl/httpie)