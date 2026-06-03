# Design: SEO Optimizer

**Change**: `seo-optimizer` | **Capability**: `seo.optimizer` | **PRD Ref**: Section 4.12

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|---|---|---|---|---|
| Content source | Product content from DB | User-provided content param | B: User-provided with DB fallback | Allows content override for better results; falls back to product content if not provided |
| Schema type selection | Fixed Course schema | Dynamic schema based on product type | B: Dynamic | Course, Ebook, Podcast, Membership, Software each have different Schema.org types |
| Credit model | Creator pays credits | Platform-paid (marketing tool) | A: Creator pays | SEO optimization is a creator tool, like content assistance |
| Storage | Save to `product_seo_configs` table | Return only, no persistence | A: Persist to table | Allows creators to review, edit, and reuse generated SEO configs |
| Skill registration | Register in Orchestrator | API-only route | A: Both | Orchestrator capability + REST API for flexibility |

## Data Flow

```
POST /api/ai/product/seo
   jwtAuthMiddleware -> seoOptimizerLimiter -> validate(zodSchema)
     |
     v
Route handler (ai.routes.ts)
   -- uid(req) -> userId from JWT
   -- Inline SQL: SELECT id, creator_id FROM "products" WHERE id = $1 AND creator_id = userId -> 403 | pass
     |
     v
seoOptimizerService.generate({ userId, productId, productName, productDescription, productType, creatorName })
   -- Fetch product from DB (title, description, content summary)
   -- **RAG Context**: memoryService.searchSimilar(userId, query, 10, ['lesson', 'faq', 'review'])
   -- Merge user-provided content with DB content + RAG fragments
   -- Build SEO-optimized prompt with product context + RAG context
   -- llmService.buildPrompt(systemPrompt, userMessage) -> LLMMessage[]
   -- llmService.chat({ messages, ...config })
     |
     v
Parse and validate LLM JSON response
     |
     v
aiCreditService.useCredits()  <- Credits deducted AFTER LLM success
   |
     v
seoOptimizerRepository.upsert(productId, seoConfig) -> saved config
     |
     v
{ success: true, data: { ...seoConfig } }
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/services/ai/seo-optimizer.service.ts` | Create | Singleton service with `generate()` method, prompt builders for each output type |
| `backend/src/services/ai/index.ts` | Modify | Add `seo-optimizer` skill registration block after `affiliate-chat` (around line 330) |
| `backend/src/routes/ai.routes.ts` | Modify | Add `POST /api/ai/product/seo` route after affiliate-chat routes |
| `backend/src/repositories/seo-optimizer.repository.ts` | Create | CRUD operations for `product_seo_configs` table |
| `backend/src/schemas/ai.schema.ts` | Modify | Add `seoOptimizerSchema` Zod schema |
| `db/init/13-seo-optimizer-tables.sql` | Create | `product_seo_configs` table + indexes |
| `docs/project/reusable-resources.md` | Modify | Add `seoOptimizerService`, `seoOptimizerRepository` to catalogs |

## Service Design

### `seoOptimizerService` — singleton object

Exported as `export const seoOptimizerService = { ... }`. Single method: `generate(input: SEOOptimizerInput): Promise<SEOOptimizerResponse>`.

**Method logic**:
1. **Input validation**: Check `productId` exists, `productDescription` is non-empty if provided
2. **Fetch product context**: Query product table for `title`, `description`, `type`
3. **Content assembly**: If `productDescription` param provided, use it; otherwise use product description + title
4. **Product type detection**: Use provided `productType` or detect from product `type` field
5. **Schema type mapping**: Map product type to Schema.org type:
   - `course` → `Course`
   - `ebook` → `Book`
   - `podcast` → `PodcastSeries`
   - `membership` → `Course` (or `Subscription`)
   - `software` → `SoftwareApplication`
   - `audiobook` → `Audiobook`
6. **LLM prompt building**: Generate structured JSON with:
   - `metaTitle`: max 60 chars, keyword-rich
   - `metaDescription`: max 155 chars, compelling
   - `ogTitle`: max 60 chars, social-optimized
   - `ogDescription`: max 100 chars
   - `ogImageUrl`: placeholder (creator can customize)
   - `keywords`: array of 5-10 SEO keywords
   - `schemaMarkup`: full JSON-LD object
7. **Response parsing**: Parse LLM JSON output, validate structure
8. **Persistence**: Upsert to `product_seo_configs` table

### Product Type → Schema.org Type Mapping

| Product Type | Schema.org @type | Notes |
|-------------|-----------------|-------|
| `course` | `Course` | Standard course schema |
| `ebook` | `Book` | Includes author, isbn potential fields |
| `podcast` | `PodcastSeries` | Episodes schema for individual episodes |
| `membership` | `Course` | Treated as structured learning |
| `software` | `SoftwareApplication` | Includes applicationCategory |
| `audiobook` | `Audiobook` | Includes duration, readBy |

### Schema Markup Structure (JSON-LD)

```json
{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "Meta Title",
  "description": "Meta Description",
  "provider": {
    "@type": "Organization",
    "name": "Crema"
  },
  "url": "https://crema.com/product/{productId}",
  "image": "OG Image URL",
  "keywords": "keyword1, keyword2, ..."
}
```

### Rate Limiting

The endpoint uses a dedicated `seoOptimizerLimiter` middleware (defined in `middlewares/rateLimit/rateLimit.ts`). The max requests per window is controlled by `seo_optimizer.rate_limit` (default: 10), read dynamically via `configService.getNumber()` on each request. This is more restrictive than chat features since SEO generation is less frequent.

### Error Handling

| Error | HTTP | Handling |
|-------|------|----------|
| No product access | 403 | Inline SQL ownership check throws |
| Credits insufficient | 402 | `aiCreditService.useCredits` throws |
| Invalid productId | 400 | Schema validation |
| LLM parse error | 500 | Log + return generic error |
| DB persistence error | 500 | Log + return generated data (non-fatal) |

## Skill Registration (in `index.ts`)

```typescript
{
  id: 'seo-optimizer',
  name: 'SEO Optimizer',
  capability: 'seo.optimizer',
  description: 'Genera meta tags y Schema markup optimizados para SEO',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'productName', type: 'string', required: false },
    { name: 'productDescription', type: 'string', required: false },
    { name: 'productType', type: 'string', required: false },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, productId, productName, productDescription, productType } = input as {
      requestingUserId: string;
      productId: string;
      productName?: string;
      productDescription?: string;
      productType?: string;
    };

    if (!requestingUserId || typeof requestingUserId !== 'string') {
      throw new AppError('requestingUserId is required', 400);
    }
    if (!productId || typeof productId !== 'string') {
      throw new AppError('productId is required', 400);
    }

    // Authorization: Full ownership check happens at route layer (see SPEC.md Route Registration)
    // This handler is called only after authentication and authorization are verified

    return seoOptimizerService.generate({
      userId: requestingUserId,
      productId,
      productName,
      productDescription,
      productType: productType as ProductType,
    });
  },
}
```

## Route Registration (in `ai.routes.ts`)

```typescript
router.post('/product/seo',
  jwtAuthMiddleware,
  seoOptimizerLimiter,
  validate(seoOptimizerSchema),
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const { productId, productName, productDescription, productType, creatorName, userId: bodyUserId } = req.body;

    // Auth boundary: verify body userId matches JWT identity
    if (userId !== bodyUserId) {
      throw new AppError('Unauthorized access', 403);
    }

    try {
      // Verify ownership - inline SQL pattern (see SPEC.md ownership requirement)
      const productCheck = await pool.query(
        `SELECT id, creator_id FROM "products" WHERE id = $1`,
        [productId]
      );

      if (productCheck.rows.length === 0) {
        throw new AppError('Product not found', 404);
      }

      if (productCheck.rows[0].creator_id !== userId) {
        throw new AppError('You do not have ownership of this product', 403);
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

      // STEP 2: Deduct credits ONLY after successful LLM response
      try {
        await aiCreditService.useCredits(userId, 1, 'SEO Optimizer', productId);
      } catch (creditError: unknown) {
        if (creditError instanceof Error && creditError.message.includes('insuficientes')) {
          throw new AppError('Créditos insuficientes', 402);
        }
        throw creditError; // Re-throw on unexpected credit errors
      }

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message, productId, userId }, 'SEO Optimizer endpoint error');
      throw new AppError('Error processing request. Please try again.', 500);
    }
  }
);
```

## Repository Design

### `seoOptimizerRepository` — singleton object

```typescript
export const seoOptimizerRepository = {
  /**
   * Get SEO config for a product
   */
  async findByProductId(productId: string): Promise<SEOConfig | null>;

  /**
   * Create or update SEO config
   */
  async upsert(productId: string, config: Partial<SEOConfig>): Promise<SEOConfig>;

  /**
   * Delete SEO config (when product is deleted)
   */
  async delete(productId: string): Promise<void>;
};
```

## Configuration

All config via `configService` (tiered: Redis → DB → .env → default). Keys:

| Key | Type | Default | Usage |
|---|---|---|---|
| `seo_optimizer.temperature` | number | 0.7 | LLM temperature |
| `seo_optimizer.max_tokens` | number | 2000 | Max output tokens |
| `seo_optimizer.model` | string | null | LLM model override |
| `seo_optimizer.rate_limit` | number | 10 | Max requests per minute per user |
| `seo_optimizer.system_prompt` | string | `DEFAULT_SEO_SYSTEM_PROMPT` | System prompt |

Default system prompt:

```
You are an SEO expert for online courses and digital products. Based on the provided product information, generate optimized meta tags and Schema.org markup.

OUTPUT FORMAT (JSON only):
{
  "metaTitle": "string (max 60 chars, include primary keyword)",
  "metaDescription": "string (max 155 chars, compelling and keyword-rich)",
  "ogTitle": "string (max 60 chars, social-optimized)",
  "ogDescription": "string (max 100 chars)",
  "ogImageUrl": "string (placeholder URL, creator can customize)",
  "keywords": ["string"] (5-10 relevant keywords),
  "schemaMarkup": { ... }
}

Rules:
- metaTitle must include the product name and a benefit or category keyword
- metaDescription must be compelling and include 1-2 keywords naturally
- ogTitle can be more promotional than metaTitle
- keywords should be specific, not generic
- schemaMarkup must follow Schema.org guidelines
- Respond in Spanish
- Return ONLY valid JSON, no explanation
```

## Database Schema

```sql
-- product_seo_configs: Meta tags por producto
CREATE TABLE IF NOT EXISTS product_seo_configs (
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

CREATE INDEX IF NOT EXISTS idx_seo_configs_product ON product_seo_configs(product_id);
```

## API Contracts

### POST /api/ai/product/seo

**Request**:

```typescript
{
  productId: string;         // Required: product UUID
  userId: string;           // Required: JWT identity match
  productName?: string;     // Optional: product name for context
  productDescription?: string; // Optional: override product description
  productType?: string;     // Optional: override auto-detection
  creatorName?: string;     // Optional: creator name for schema markup
}
```

**Response**:

```typescript
{
  success: true;
  data: {
    metaTitle: string;           // 30-60 chars
    metaDescription: string;    // 100-155 chars
    ogTitle: string;             // max 60 chars
    ogDescription: string;       // max 100 chars
    ogImageUrl: string;           // URL
    ogType: string;               // "product"
    ogSiteName: string;          // "Crema"
    canonicalUrl: string;         // canonical URL
    schemaMarkup: Record<string, unknown>; // JSON-LD object
    keywords: string[];           // 5-10 keywords
    sources?: Array<{             // optional RAG context
      source_type: 'lesson' | 'faq' | 'review';
      source_id: string;
      content: string;
      similarity: number;
    }>;
  };
  creditsUsed: number;            // 1 credit deducted
}
```

**Errors**:

| Code | HTTP | Description |
|------|------|-------------|
| UNAUTHORIZED | 403 | JWT userId mismatch |
| NO_PRODUCT_ACCESS | 403 | Not product owner |
| INSUFFICIENT_CREDITS | 402 | Not enough credits |
| INVALID_INPUT | 400 | Schema validation failed |
| SEO_GENERATION_ERROR | 500 | LLM error |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `sanitizeInput` with various inputs | Pure function tests |
| Unit | Schema type mapping for each product type | 6 test cases, verify correct @type |
| Unit | `generate()` with mocked `llmService`, `productRepository` | Mock service calls, verify prompt structure |
| Unit | JSON parsing handles valid/invalid LLM output | Parse success/failure cases |
| Integration | Route `POST /api/ai/product/seo`: 401 without JWT, 400 on bad schema, 403 on no ownership, 402 on no credits | Supertest with real middleware chain |
| Integration | Credit deduction verified | Mock `aiCreditService`, verify call count |
| Integration | DB persistence | Integration test with test DB |

## Migration / Rollout

1. **DB Migration**: Run `db/init/13-seo-optimizer-tables.sql` to create `product_seo_configs` table
2. **Service Registration**: Add `seoOptimizerService` and `seoOptimizerRepository` to their respective catalogs
3. **Route Registration**: Add route in `ai.routes.ts` + skill in `index.ts`
4. **Rate Limiter**: Ensure `seoOptimizerLimiter` is defined in `middlewares/rateLimit/rateLimit.ts`

**Rollback**: Comment out the `seo-optimizer` skill block in `index.ts`, the route in `ai.routes.ts`, and optionally drop the `product_seo_configs` table. No effect on other capabilities.

## Dependencies

| Module | Used As | Notes |
|--------|---------|-------|
| `llmService` | Core dependency | For LLM calls |
| `configService` | Config access | For temperature, maxTokens, rate limit |
| `aiCreditService` | Credit deduction | 1 credit per generation |
| `productRepository` | Fetch product data | For title, description, type |
| `inline SQL ownership check` | Ownership check | Inline SQL pattern per SPEC.md |
| `AppError` | Error handling | Standard error class |

## Rollout Plan

| Phase | Tasks | Notes |
|-------|-------|-------|
| 1 | Create DB migration, repository, service | Core functionality |
| 2 | Add route and schema | API endpoint |
| 3 | Register skill in Orchestrator | Capability registration |
| 4 | Add rate limiter | Performance protection |
| 5 | Unit tests | Test core logic |
| 6 | Integration tests | Full flow testing |

---

*See `docs/project/reusable-resources.md` for existing modules reference*