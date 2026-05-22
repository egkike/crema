# Tasks: SEO Optimizer

**Change**: `seo-optimizer` | **Capability**: `seo.optimizer` | **PRD Ref**: Section 4.12

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-360 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (feature-complete) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

**Decision needed before apply**: Yes  
**Chained PRs recommended**: No  
**Chain strategy**: stacked-to-main  
**400-line budget risk**: Low

---

## Overview

Generate SEO meta tags automatically for product pages. Reuses ContentAssistant infrastructure from §4.11. Target user: **Creator** (Plan Pro).

### Features to implement:
- Meta title (≤60 chars)
- Meta description (≤155 chars)
- OG Tags (Open Graph for social sharing)
- Schema markup (JSON-LD structured data)
- RAG context for better SEO generation

### Dependencies:
- ContentAssistantService (reused)
- llmService (reused)
- memoryService (RAG context)
- aiCreditService (credit deduction)

### Not in scope (future):
- Auto-publishing to CMS
- A/B testing meta variants
- Integration with external SEO tools

---

## Implementation Order

Tasks are numbered sequentially. Dependencies are listed per task.
Execute in order — do not skip or reorder.

---

## Task 1: Create `seo-optimizer.repository.ts`

**Depends on**: None (first task)

### What to do

Create `backend/src/repositories/seo-optimizer.repository.ts` following the singleton repository pattern.

**File**: `backend/src/repositories/seo-optimizer.repository.ts`

**Types to define** (top of file):
```typescript
export interface SEOConfig {
  id: string;
  product_id: string;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  schema_markup: Record<string, unknown> | null;
  keywords: string[] | null;
  canonical_url: string | null;
  created_at: Date;
  updated_at: Date;
}
```

**Repository object** (`export const seoOptimizerRepository`):
```typescript
export const seoOptimizerRepository = {
  /**
   * Find SEO config by product ID
   */
  async findByProductId(productId: string): Promise<SEOConfig | null> {
    const result = await pool.query<SEOConfig>(
      'SELECT * FROM "product_seo_configs" WHERE product_id = $1',
      [productId]
    );
    return result.rows[0] || null;
  },

  /**
   * Create or update SEO config (upsert)
   */
  async upsert(productId: string, config: Partial<SEOConfig>): Promise<SEOConfig> {
    const result = await pool.query<SEOConfig>(
      `INSERT INTO "product_seo_configs" (product_id, meta_title, meta_description, og_title, og_description, og_image_url, schema_markup, keywords, canonical_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (product_id) DO UPDATE SET
         meta_title = EXCLUDED.meta_title,
         meta_description = EXCLUDED.meta_description,
         og_title = EXCLUDED.og_title,
         og_description = EXCLUDED.og_description,
         og_image_url = EXCLUDED.og_image_url,
         schema_markup = EXCLUDED.schema_markup,
         keywords = EXCLUDED.keywords,
         canonical_url = EXCLUDED.canonical_url,
         updated_at = NOW()
       RETURNING *`,
      [productId, config.meta_title, config.meta_description, config.og_title, config.og_description, config.og_image_url, JSON.stringify(config.schema_markup), config.keywords, config.canonical_url]
    );
    return result.rows[0];
  },

  /**
   * Delete SEO config by product ID
   */
  async delete(productId: string): Promise<void> {
    await pool.query('DELETE FROM "product_seo_configs" WHERE product_id = $1', [productId]);
  },
};
```

### Verification
- [ ] File exists at `backend/src/repositories/seo-optimizer.repository.ts`
- [ ] `export const seoOptimizerRepository` is the main export
- [ ] Methods: `findByProductId`, `upsert`, `delete`
- [ ] No `any` types in the file

---

## Task 2: Create `seo-optimizer.service.ts`

**Depends on**: Task 1 (repository)

### What to do

Create `backend/src/services/ai/seo-optimizer.service.ts` following the singleton service pattern used by other AI services.

**File**: `backend/src/services/ai/seo-optimizer.service.ts`

**Types to define** (top of file):
```typescript
export interface SEOOptimizerInput {
  userId: string;
  productId: string;
  productName: string;
  productDescription: string;
  productType: ProductType;
  creatorName?: string;
}

export interface SEOOptimizerOutput {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl?: string;
  schemaMarkup: Record<string, unknown>;
  keywords: string[];
  canonicalUrl?: string;
}

export interface SEOOptimizerResponse {
  success: boolean;
  data?: SEOOptimizerOutput;
  error?: string;
}
```

**Imports needed**:
```typescript
import logger from '../../../utils/logger';
import { AppError } from '../../../errors/AppError';
import { configService } from '../config.service';
import { llmService, type LLMMessage } from '../llm.service';
import { memoryService } from './memory.service';
import { seoOptimizerRepository } from '../../repositories/seo-optimizer.repository';
import { ProductType } from './content/content-assistant.service';
```

**Helper functions** (module-level, exported for testability):
- `export function truncateToLength(text: string, maxLength: number): string` — Truncates text to max length, appending "..." if truncated.
- `export function extractKeywords(text: string, maxKeywords: number = 5): string[]` — Simple keyword extraction (word frequency, removing stop words).
- `export function getSchemaType(productType: ProductType): string` — Maps product type to Schema.org type.

**Product Type → Schema.org Type Mapping**:
```typescript
export function getSchemaType(productType: ProductType): string {
  const mapping: Record<ProductType, string> = {
    course: 'Course',
    ebook: 'Book',
    podcast: 'PodcastSeries',
    membership: 'Course',
    software: 'SoftwareApplication',
    audiobook: 'Audiobook',
  };
  return mapping[productType] || 'Product';
}
```

**System prompt** (module-level constant):
```typescript
const SEO_SYSTEM_PROMPT = `Eres un experto en SEO para productos digitales en español.
Tu tarea es generar meta tags optimizados para SEO y redes sociales.

REGLAS ESTRICTAS:
- meta_title: Máximo 60 caracteres, debe ser atractivo y descriptivo
- meta_description: Máximo 155 caracteres, debe incluir call-to-action implícito
- og_title: Máximo 60 caracteres, puede ser igual al meta_title
- og_description: Máximo 40 caracteres, debe ser impactante para redes
- keywords: Array de 5-10 keywords relevantes
- schema_type: Uno de "Course", "Book", "PodcastSeries", "SoftwareApplication", "Audiobook", "Product"

Responde SOLO con JSON válido, sin texto adicional:
{
  "meta_title": "...",
  "meta_description": "...",
  "og_title": "...",
  "og_description": "...",
  "keywords": ["...", "...", "..."],
  "schema_type": "..."
}`;
```

**Service object** (`export const seoOptimizerService`):
- Single method: `async generate(input: SEOOptimizerInput): Promise<SEOOptimizerResponse>`
- Logic inside `generate()`:
  1. Validate input: userId, productId required
  2. If productDescription is empty, throw AppError(400, 'Product description is required for SEO generation')
  3. **RAG Context**: Call `memoryService.searchSimilar(userId, \`${productName} ${productDescription}\`, 10, ['lesson', 'faq', 'review'])` to get product content context
  4. Build user prompt with product details + RAG context
  5. Call `llmService.chat()` with system prompt and user prompt
  6. Parse JSON response from LLM
  7. Apply truncation rules: meta_title ≤60, meta_description ≤155, og_title ≤60, og_description ≤40
  8. Build schemaMarkup based on productType using `getSchemaType()`
  9. Extract canonical URL pattern: `https://crema.io/products/{productId}`
  10. Return SEOOptimizerResponse with success:true and data

**Config keys** (read via `configService`):
| Key | Type | Default |
|-----|------|---------|
| `seo_optimizer.temperature` | number | 0.7 |
| `seo_optimizer.max_tokens` | number | 2000 |
| `seo_optimizer.model` | string | null (use default) |

### Verification
- [ ] File exists at `backend/src/services/ai/seo-optimizer.service.ts`
- [ ] `export const seoOptimizerService` is the main export
- [ ] Helper functions `truncateToLength`, `extractKeywords`, `getSchemaType` are **exported** for testing
- [ ] `generate()` method accepts `SEOOptimizerInput` and returns `Promise<SEOOptimizerResponse>`
- [ ] RAG context uses `memoryService.searchSimilar`
- [ ] No `any` types in the file
- [ ] `pnpm tsc --noEmit` passes

---

## Task 3: Add Zod schema to `ai.schema.ts`

**Depends on**: Task 2 (service types)

### What to do

Add the `seoOptimizerSchema` to `backend/src/schemas/ai.schema.ts`.

**Schema to add** (after `affiliateChatSchema`):
```typescript
// SEO Optimizer
export const seoOptimizerSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  productName: z.string()
    .min(1, { message: 'productName is required' })
    .max(200, { message: 'productName must be less than 200 characters' }),
  productDescription: z.string()
    .min(10, { message: 'productDescription must be at least 10 characters' })
    .max(5000, { message: 'productDescription must be less than 5000 characters' }),
  productType: z.enum(['course', 'ebook', 'podcast', 'membership', 'software', 'audiobook'], {
    message: 'productType must be one of: course, ebook, podcast, membership, software, audiobook',
  }),
  creatorName: z.string().max(100).optional(),
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export type SEOOptimizerRequest = z.infer<typeof seoOptimizerSchema>;
```

### Verification
- [ ] `seoOptimizerSchema` is exported from `ai.schema.ts`
- [ ] `SEOOptimizerRequest` type is exported
- [ ] Schema validates: UUID for productId, productName 1-200 chars, productDescription 10-5000 chars, valid productType
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 4: Add route to `ai.routes.ts`

**Depends on**: Task 2 (service), Task 3 (schema)

### What to do

Add the `POST /api/ai/product/seo` route to `backend/src/routes/ai.routes.ts`.

**Import additions** (top of file, with other AI service imports):
```typescript
import { seoOptimizerService } from '../services/ai/seo-optimizer.service';
import { seoOptimizerSchema } from '../schemas/ai.schema';
```

**Rate Limiter**: Use dedicated `seoOptimizerLimiter` (10 requests/min) following the pattern of existing rate limiters.

**Route implementation**: Add after Content Assistant routes section (after `/transcription/usage` endpoint):

```typescript
/**
 * POST /api/ai/product/seo
 * Generate SEO meta tags for a product
 * Access: JWT (creator only, must own the product)
 * Rate limited: 10/min (seoOptimizerLimiter)
 * Credits: 1 credit per generation (deducted AFTER LLM success)
 */
router.post(
  '/product/seo',
  jwtAuthMiddleware,
  seoOptimizerLimiter, // Dedicated rate limiter (10/min)
  validate(seoOptimizerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = uid(req);
    const { productId, productName, productDescription, productType, creatorName, userId: bodyUserId } = req.body;

    // Auth boundary: verify body userId matches JWT identity
    if (userId !== bodyUserId) {
      throw new AppError('Unauthorized access', 403);
    }

    // Verify user owns this product
    const productCheck = await pool.query(
      `SELECT id, creator_id FROM "${getValidatedSchema()}"."products" WHERE id = $1`,
      [productId]
    );

    if (productCheck.rows.length === 0) {
      throw new AppError('Product not found', 404);
    }

    if (productCheck.rows[0].creator_id !== userId) {
      throw new AppError('You do not have permission to generate SEO for this product', 403);
    }

    // STEP 1: Call LLM FIRST (fail-fast before credit deduction)
    const result = await seoOptimizerService.generate({
      userId,
      productId,
      productName,
      productDescription,
      productType,
      creatorName,
    });

    if (!result.success) {
      throw new AppError(result.error || 'SEO generation failed', 500);
    }

    // STEP 2: Deduct credits ONLY after successful LLM response
    try {
      await aiCreditService.useCredits(userId, 1, 'SEO Optimizer', productId);
    } catch (creditError: unknown) {
      logger.error({ error: creditError instanceof Error ? creditError.message : 'Unknown', userId, productId }, 'Credit deduction failed after LLM success');
      throw new AppError('Créditos insuficientes', 402);
    }

    res.json({
      success: true,
      data: result.data,
      creditsUsed: 1,
    });
  })
);
```

### Verification
- [ ] `seoOptimizerService` imported in `ai.routes.ts`
- [ ] `seoOptimizerSchema` imported in `ai.routes.ts`
- [ ] Route registered at `POST /product/seo`
- [ ] Middleware chain: `jwtAuthMiddleware` → `seoOptimizerLimiter` → `validate(seoOptimizerSchema)` → handler
- [ ] Product ownership verified (creator_id check)
- [ ] **Credit deducted AFTER LLM success** (not before) — follows affiliate-chat pattern
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 5: Register skill in `ai/index.ts`

**Depends on**: Task 2 (service)

### What to do

Add the `seo-optimizer` skill registration block to `backend/src/services/ai/index.ts`.

**Import addition** (top of file):
```typescript
import { seoOptimizerService } from './seo-optimizer.service';
```

**Skill block**: Add after the `content-assistant` skill block:

```typescript
// ========================================================================
// SEO Optimizer Service
// ========================================================================
{
  id: 'seo-optimizer',
  name: 'SEO Optimizer',
  capability: 'seo.optimizer',
  description: 'Genera meta tags optimizados para productos digitales',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'productName', type: 'string', required: true },
    { name: 'productDescription', type: 'string', required: true },
    { name: 'productType', type: 'string', required: true },
    { name: 'creatorName', type: 'string', required: false },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, productId, productName, productDescription, productType, creatorName } = input as {
      requestingUserId: unknown;
      productId: unknown;
      productName: unknown;
      productDescription: unknown;
      productType: unknown;
      creatorName?: unknown;
    };

    // Validate required parameters
    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new AppError('productId is required', 400);
    }
    if (typeof productName !== 'string' || productName.length === 0) {
      throw new AppError('productName is required', 400);
    }
    if (typeof productDescription !== 'string' || productDescription.length < 10) {
      throw new AppError('productDescription must be at least 10 characters', 400);
    }
    if (typeof productType !== 'string') {
      throw new AppError('productType is required', 400);
    }

    // Authorization: simplified (caller responsible for ownership verification at route level)
    return seoOptimizerService.generate({
      userId: requestingUserId,
      productId,
      productName,
      productDescription,
      productType: productType as ProductType,
      creatorName: creatorName as string | undefined,
    });
  },
},
```

### Verification
- [ ] `seoOptimizerService` imported in `index.ts`
- [ ] Skill object added to the `skills` array
- [ ] Capability ID is `seo.optimizer`
- [ ] All required parameters validated
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 6: Write unit tests for `seo-optimizer.service.ts`

**Depends on**: Task 2 (service)

### What to do

Create `backend/src/__tests__/services/ai/seo-optimizer.service.test.ts`.

**Test structure** (following existing test patterns):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { seoOptimizerService, truncateToLength, extractKeywords, getSchemaType } from '../../../services/ai/seo-optimizer.service';

// Mock services
vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
  },
}));

vi.mock('../../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue(null),
  },
}));

// Mock memory service for RAG context
vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn().mockResolvedValue([]),
  },
}));

// Test constants
const USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_NAME = 'Curso de TypeScript Profesional';
const PRODUCT_DESCRIPTION = 'Aprende TypeScript desde cero hasta nivel avanzado. Cubrimos tipos, genéricos, decoradores y más.';
const PRODUCT_TYPE = 'course';
const CREATOR_NAME = 'Juan Pérez';

describe('seoOptimizerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });
```

**Tests to write**:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | `truncateToLength` truncates long text | Text > maxLength gets "..." appended |
| 2 | `truncateToLength` preserves short text | Text ≤ maxLength passes unchanged |
| 3 | `truncateToLength` handles exact length | Text === maxLength passes unchanged |
| 4 | `extractKeywords` returns keywords | Common words filtered, key terms returned |
| 5 | `extractKeywords` limits count | Returns maxKeywords or fewer |
| 6 | `extractKeywords` handles empty input | Returns empty array for empty string |
| 7 | `getSchemaType` maps course → Course | Correct Schema.org type |
| 8 | `getSchemaType` maps ebook → Book | Correct Schema.org type |
| 9 | `getSchemaType` maps software → SoftwareApplication | Correct Schema.org type |
| 10 | `generate()` returns SEO data on success | LLM response parsed correctly |
| 11 | `generate()` validates productId required | Throws AppError(400) if missing |
| 12 | `generate()` validates productDescription min length | Throws AppError(400) if < 10 chars |
| 13 | `generate()` truncates meta fields correctly | meta_title ≤60, meta_description ≤155 |
| 14 | `generate()` uses RAG context | `memoryService.searchSimilar` called with correct params |

### Verification
- [ ] File exists at `backend/src/__tests__/services/ai/seo-optimizer.service.test.ts`
- [ ] All 14 tests pass with `pnpm vitest run seo-optimizer.service`
- [ ] No `any` types in test file
- [ ] Mocks properly scoped with `vi.mock()`
- [ ] `beforeEach` calls `vi.clearAllMocks()`, `afterEach` calls `vi.resetAllMocks()`
- [ ] Helper functions tested independently

---

## Task 7: Write integration tests for SEO route

**Depends on**: Task 4 (route), Task 5 (skill registration), Task 6 (service tests)

### What to do

Create `backend/src/__tests__/routes/seo-optimizer.routes.test.ts`.

**Test structure** (following existing route test patterns):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../../app';
import '../setup';

// Mock services
vi.mock('../../../services/ai/seo-optimizer.service', () => ({
  seoOptimizerService: {
    generate: vi.fn().mockResolvedValue({
      success: true,
      data: {
        metaTitle: 'Curso de TypeScript Profesional',
        metaDescription: 'Aprende TypeScript desde cero hasta nivel avanzado.',
        ogTitle: 'Curso de TypeScript',
        ogDescription: 'Domina TypeScript hoy',
        schemaMarkup: { '@type': 'Course', name: 'Curso de TypeScript' },
        keywords: ['typescript', 'programación', 'web'],
        canonicalUrl: 'https://crema.io/products/test-id',
      },
    }),
  },
}));

vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: {
    getBalance: vi.fn().mockResolvedValue({ balance: 100 }),
    useCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

// Test constants
const CREATOR_USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';

describe('SEO Optimizer Routes', () => {
  let creatorCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Auth via real login
    const res = await request
      .post('/api/auth/login')
      .send({ email: 'creator@test.com', password: 'p1' });
    const cookieArr = res.headers['set-cookie'];
    if (Array.isArray(cookieArr)) {
      creatorCookies = cookieArr.map((c: string) => c.split(';')[0]).join('; ');
    }
  });
```

**Tests to write**:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Returns 401 without JWT | Unauthenticated requests rejected |
| 2 | Returns 400 with missing `productId` | Zod validation catches missing field |
| 3 | Returns 400 with invalid UUID `productId` | Zod validation catches non-UUID |
| 4 | Returns 400 with empty `productName` | Zod validation catches empty string |
| 5 | Returns 400 with `productDescription` < 10 chars | Zod validation catches too short |
| 6 | Returns 400 with invalid `productType` | Zod validation catches invalid enum |
| 7 | Returns 403 when user does not own product | Ownership verification fails |
| 8 | Returns 200 for creator with valid product | Successful SEO generation |
| 9 | `aiCreditService.useCredits` called on success | Credits deducted after LLM success |
| 10 | Returns 402 when credits insufficient | Credit check fails gracefully |
| 11 | Response includes SEO data | metaTitle, metaDescription, ogTags, schemaMarkup |
| 12 | Route uses seoOptimizerLimiter | Rate limiting applied |

### Verification
- [ ] File exists at `backend/src/__tests__/routes/seo-optimizer.routes.test.ts`
- [ ] All tests pass with `pnpm vitest run seo-optimizer.routes`
- [ ] No `any` types in test file
- [ ] `import '../setup'` present for database setup
- [ ] Auth uses real login pattern
- [ ] Tests cover happy path and error paths (401, 400, 403, 402)

---

## Final Verification Checklist

After all tasks are complete, run:

```bash
# 1. TypeScript compilation
pnpm tsc --noEmit

# 2. Linting
pnpm lint

# 3. All tests
pnpm test

# 4. Specific SEO optimizer tests
pnpm vitest run seo-optimizer
```

### Test Results (Expected)

| Layer | Count | Status |
|-------|-------|--------|
| Unit tests (service) | 14 | Pending |
| Integration tests (route) | 12 | Pending |
| **Total** | **26** | Pending |

### File Checklist

| File | Action | Status |
|------|--------|--------|
| `backend/src/repositories/seo-optimizer.repository.ts` | **Create** | Pending |
| `backend/src/services/ai/seo-optimizer.service.ts` | **Create** | Pending |
| `backend/src/schemas/ai.schema.ts` | **Modify** (add schema) | Pending |
| `backend/src/routes/ai.routes.ts` | **Modify** (add route) | Pending |
| `backend/src/services/ai/index.ts` | **Modify** (add skill) | Pending |
| `backend/src/__tests__/services/ai/seo-optimizer.service.test.ts` | **Create** | Pending |
| `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` | **Create** | Pending |

**Total**: 5 new files, 3 modified files.

---

## Dependency Graph

```
Task 1 (repository) ──→ Task 2 (service) ──┬──→ Task 4 (route)
                                           │
                                           ├──→ Task 5 (skill registration)
                                           │
                                           └──→ Task 6 (unit tests)

Task 3 (schema) ───┬──→ Task 4 (route)
                     │
                     └──→ Task 6 (unit tests, type reference)

Task 2 + Task 3 ───→ Task 7 (integration tests)
```

Tasks 1 and 3 can be done in parallel with Task 2.  
Task 4 depends on both 1 and 3.  
Tasks 5 and 6 depend only on 2.  
Task 7 depends on 4 and 5.

---

## Notes

### PRD §4.12 Reference

From PRD.md:
- **Feature**: Genera meta tags automáticos para las páginas de productos
- **Usuario Target**: Creador
- **Funcionalidades**: Meta title, Meta description, OG Tags, Schema markup

### Database Schema

The `product_seo_configs` table should be created separately (if not already existing):

```sql
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
```

**Note**: This SDD focuses on the API endpoint. Database table creation should be done via a separate migration task if not already applied.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credit timing | Deduct AFTER LLM success | Fail-safe pattern, no charge if LLM fails |
| RAG context | Use `memoryService.searchSimilar` | Better SEO with real product content |
| Rate limiter | Dedicated `seoOptimizerLimiter` (10/min) | More restrictive than chat features |
| ProductType | `course`, `ebook`, `podcast`, `membership`, `software`, `audiobook` | Matches PRD product types |
| Repository | Separate `seoOptimizerRepository` | Clean separation of DB operations |

### Future Enhancements (Out of Scope)

- Save generated SEO to `product_seo_configs` table (future task)
- Auto-apply SEO to product page
- Regenerate existing SEO
- SEO preview tool
- A/B testing meta variants