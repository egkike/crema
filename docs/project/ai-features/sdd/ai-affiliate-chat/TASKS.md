# Tasks: AI Affiliate Chat

**Change**: `ai-affiliate-chat` | **Capability**: `affiliate.chat` | **PRD Ref**: Section 4.10

---

## Implementation Order

Tasks are numbered sequentially. Dependencies are listed per task.
Execute in order — do not skip or reorder.

---

## Task 1: Create `affiliate-chat.service.ts`

**Depends on**: None (first task)

### What to do

Create `backend/src/services/ai/affiliate-chat.service.ts` following the `concierge.service.ts` singleton pattern.

**File**: `backend/src/services/ai/affiliate-chat.service.ts`

**Types to define** (top of file):
```typescript
export interface AffiliateChatInput {
  productId: string;
  userId: string;
  message: string;
}

export interface AffiliateChatSource {
  source_type: 'lesson' | 'faq';
  source_id: string;
  content: string;
  similarity: number;
}

export interface AffiliateChatResponse {
  response: string;
  sources?: AffiliateChatSource[];
}
```

**Helper functions** (module-level, exported for route-level credit decisions):
- `export function sanitizeInput(input: string): string` — strip control chars below 32 and DEL (127). Identical to concierge implementation.
- `export function defensiveFramePrompt(message: string): string` — escape `<`/`>` and wrap in `<user_message>` tags. Identical to concierge implementation.
- `export function classifyIntent(message: string): 'product_info' | 'promo_copy' | 'affiliate_metrics'` — keyword matching with priority order:
  - `comision`/`metrica`/`conversion` → `affiliate_metrics` (highest priority)
  - `promo`/`copy`/`tweet`/`post`/`redes` → `promo_copy`
  - default → `product_info`

**System prompts** (module-level constants):
```typescript
const DEFAULT_PRODUCT_INFO_PROMPT = `You are an AI assistant for product affiliates. Answer ONLY using the product context provided. If the context does not contain relevant information, state that clearly. Do not fabricate facts. Respond in Spanish.`;

const DEFAULT_PROMO_COPY_PROMPT = `You are a marketing copywriter for affiliate marketers. Using the product context provided, generate compelling social media copy in Spanish. Be creative but accurate to the product content.`;
```

**Service object** (`export const affiliateChatService`):
- Single method: `async chat(input: AffiliateChatInput): Promise<AffiliateChatResponse>`
- Logic inside `chat()`:
  1. Sanitize input with `sanitizeInput(message)`
  2. Log security warning if sanitized length differs from original by >10%
  3. If sanitized input is empty, throw AppError(400, 'Invalid input')
  4. Frame with `defensiveFramePrompt(sanitized)`
  5. Classify intent with `classifyIntent(sanitized)` (priority order, first match wins)
  6. RAG: `memoryService.searchSimilar(userId, sanitizedQuery, 5, ['lesson', 'faq'])`
  7. Build context string from fragments
  8. Select system prompt based on intent (config key `affiliate_chat.system_prompt` or default)
  9. For `affiliate_metrics` intent: return stub response without LLM call
  10. For other intents: `llmService.buildPrompt(systemPrompt, context, framedMessage)` → `llmService.chat()`
  11. Return `{ response, sources }` where sources maps `EmbeddingSearchResult[]` fields

**Config keys** (read via `configService`):
| Key | Type | Default |
|-----|------|---------|
| `affiliate_chat.temperature` | number | 0.7 |
| `affiliate_chat.max_tokens` | number | 1000 |
| `affiliate_chat.model` | string | null |
| `affiliate_chat.system_prompt` | string | `DEFAULT_PRODUCT_INFO_PROMPT` |
| `affiliate_chat.rate_limit` | number | 30 |

**Imports needed**:
```typescript
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { configService } from '../config.service';
import { llmService, type LLMMessage } from './llm.service';
import { memoryService } from './memory.service';
import type { EmbeddingSearchResult } from '../../types/ai.types';
```

### Verification
- [ ] File exists at `backend/src/services/ai/affiliate-chat.service.ts`
- [ ] `export const affiliateChatService` is the main export
- [ ] Helper functions `sanitizeInput`, `defensiveFramePrompt`, `classifyIntent` are **exported** for route-level credit decisions
- [ ] `chat()` method accepts `AffiliateChatInput` and returns `Promise<AffiliateChatResponse>`
- [ ] No `any` types in the file
- [ ] `pnpm tsc --noEmit` passes

---

## Task 2: Add Zod schema to `ai.schema.ts`

**Depends on**: None (can be done in parallel with Task 1, but listed here for ordering)

### What to do

Add the `affiliateChatSchema` to `backend/src/schemas/ai.schema.ts` at the end of the file (before the Query Parameter Validation Schemas section, after `qaChatSchema`).

**Schema to add**:
```typescript
// Affiliate Chat
export const affiliateChatSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  message: z.string()
    .min(1, { message: 'message is required' })
    .max(2000, { message: 'message must be less than 2000 characters' }),
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export type AffiliateChatRequest = z.infer<typeof affiliateChatSchema>;
```

### Verification
- [ ] `affiliateChatSchema` is exported from `ai.schema.ts`
- [ ] `AffiliateChatRequest` type is exported
- [ ] Schema validates: UUID for productId, 1-2000 chars for message, UUID for userId
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 3: Add route to `ai.routes.ts`

**Depends on**: Task 1 (service), Task 2 (schema)

### What to do

Add the `POST /api/ai/affiliate/chat` route to `backend/src/routes/ai.routes.ts`.

**Import additions** (top of file):
```typescript
import { affiliateChatService, classifyIntent } from '../services/ai/affiliate-chat.service';
import { affiliateChatSchema } from '../schemas/ai.schema';
```

**Route placement**: After Phase 7 routes (Tutor + Insights section), before the end of the file. Add a new section comment:

```typescript
// ============================================
// Affiliate Chat Routes
// ============================================
```

**Route implementation**:
```typescript
/**
 * POST /api/ai/affiliate/chat
 * Chat with AI about a product (affiliates and buyers)
 * Uses credits for affiliates; included for buyers
 */
router.post('/affiliate/chat',
  jwtAuthMiddleware,
  aiChatLimiter,
  validate(affiliateChatSchema),
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const { productId, message, userId: bodyUserId } = req.body;

    // Auth boundary: verify body userId matches JWT identity (throws 403, not caught by try/catch)
    if (userId !== bodyUserId) {
      throw new AppError('Unauthorized access', 403);
    }

    try {
      // Verify user has access to this product (creator, buyer, or affiliate)
      await verifyProductAccess(pool, productId, userId);

      // Check if user is a buyer (confirmed order) — buyers don't pay credits
      const buyerCheck = await pool.query(
        `SELECT id FROM "${getValidatedSchema()}"."orders" WHERE product_id = $1 AND buyer_id = $2 AND status = 'confirmed'`,
        [productId, userId]
      );

      // Call service first; deduct credits ONLY on success and only for non-buyers
      const result = await affiliateChatService.chat({ productId, userId, message });

      // Only deduct credits if NOT a buyer (i.e., affiliate) AND intent is not affiliate_metrics
      // Note: classifyIntent is called on raw message here for credit decision only.
      // The service re-classifies on sanitized input internally; if they differ, the service wins.
      if (buyerCheck.rows.length === 0) {
        const intent = classifyIntent(message); // exported from affiliate-chat.service.ts
        if (intent !== 'affiliate_metrics') {
          // Wrap in own try/catch to prevent credit loss if useCredits fails after LLM success
          try {
            await aiCreditService.useCredits(userId, 1, 'Affiliate Chat', productId);
          } catch (creditError: unknown) {
            logger.error({ error: creditError instanceof Error ? creditError.message : 'Unknown', userId, productId }, 'Credit deduction failed after LLM success — credits may be consumed but response delivered');
          }
        }
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Affiliate chat endpoint error');
      throw new AppError('Error processing request. Please try again.', 500);
    }
  }
);
```

**Note**: The `verifyProductAccess` helper already checks for creator, buyer, or affiliate access. The buyer check is separate to determine credit charging.

### Verification
- [ ] `affiliateChatService` imported in `ai.routes.ts`
- [ ] `affiliateChatSchema` imported in `ai.routes.ts`
- [ ] Route registered at `POST /affiliate/chat`
- [ ] Middleware chain: `jwtAuthMiddleware` → `aiChatLimiter` → `validate(affiliateChatSchema)` → handler
- [ ] `verifyProductAccess` called before processing
- [ ] Credit deduction only for non-buyers
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 4: Register skill in `ai/index.ts`

**Depends on**: Task 1 (service)

### What to do

Add the `affiliate-chat` skill registration block to `backend/src/services/ai/index.ts`.

**Import addition** (top of file, with other service imports):
```typescript
import { affiliateChatService } from './affiliate-chat.service';
```

**Skill block**: Add after the `concierge-chat` skill block (around line 294), before the Memory Service Skills section.

```typescript
// ========================================================================
// Affiliate Chat Service
// ========================================================================
{
  id: 'affiliate-chat',
  name: 'AI Affiliate Chat',
  capability: 'affiliate.chat',
  description: 'Chat contextualizado sobre productos para afiliados y compradores',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'message', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, productId, message, userId } = input as {
      requestingUserId: unknown;
      productId: unknown;
      message: unknown;
      userId: unknown;
    };

    // Validate requestingUserId (required for authorization)
    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required and must be a non-empty string', 400);
    }

    // Validate message
    if (typeof message !== 'string' || message.length === 0) {
      throw new AppError('message is required and must be a non-empty string', 400);
    }
    if (message.length > 2000) {
      throw new AppError('message must be less than 2000 characters', 400);
    }

    // Validate productId
    if (typeof productId !== 'string' || productId.length === 0) {
      throw new AppError('productId is required and must be a non-empty string', 400);
    }

    // Validate userId
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AppError('userId is required and must be a non-empty string', 400);
    }

    // Authorization: verify caller owns this resource
    if (requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user affiliate chat', 403);
    }

    return affiliateChatService.chat({ productId, userId, message });
  },
},
```

### Verification
- [ ] `affiliateChatService` imported in `index.ts`
- [ ] Skill object added to the `skills` array
- [ ] Capability ID is `affiliate.chat`
- [ ] Handler validates all 4 parameters with typeof checks
- [ ] Authorization check: `requestingUserId === userId`
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes

---

## Task 5: Update `reusable-resources.md`

**Depends on**: Task 1 (service exists)

### What to do

Add `affiliateChatService` to the AI Services table in `docs/project/reusable-resources.md`.

**Location**: Section 3 → AI Services table (around line 88-99).

**Entry to add** (after `conciergeService`):
```markdown
| `affiliateChatService` | AI chat for affiliates/buyers about specific products (RAG-based) |
```

### Verification
- [ ] `affiliateChatService` appears in the AI Services table
- [ ] Description matches the service purpose
- [ ] Table formatting is consistent with existing entries

---

## Task 6: Write unit tests for `affiliate-chat.service.ts`

**Depends on**: Task 1 (service), Task 2 (types)

### What to do

Create `backend/src/__tests__/services/ai/affiliate-chat.service.test.ts`.

**Test structure** (following `interactive-agent.service.test.ts` pattern):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { affiliateChatService } from '../../../services/ai/affiliate-chat.service';
// ... mock imports for memoryService, llmService, configService

// Test constants — use UUIDs matching test fixtures pattern
const USER_ID = '00000000-0000-0000-0000-000000000001';
const BUYER_ID = '00000000-0000-0000-0000-000000000002';
const AFFILIATE_ID = '00000000-0000-0000-0000-000000000003';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';

// Mock services (same pattern as interactive-agent.service.test.ts)
vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn(),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    buildPrompt: vi.fn((systemPrompt, context, userMessage) => [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: context },
      { role: 'user', content: userMessage },
    ]),
  },
}));

vi.mock('../../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue(null),
  },
}));

describe('affiliateChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // Tests use vi.mocked(service.method) to assert call arguments
  // ...
```

**Tests to write**:

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | `sanitizeInput` strips control characters | Characters below code 32 and DEL (127) are removed |
| 2 | `sanitizeInput` preserves normal text | Regular text passes through unchanged |
| 3 | `defensiveFramePrompt` escapes `<` and `>` | Angle brackets become `&lt;` and `&gt;` |
| 4 | `defensiveFramePrompt` wraps in `<user_message>` tags | Output is `<user_message>...</user_message>` |
| 5 | `classifyIntent` maps promo keywords → `promo_copy` | "genera copy", "tweet", "post para redes" all map correctly |
| 6 | `classifyIntent` maps metric keywords → `affiliate_metrics` | "comisiones", "metricas", "conversiones" map correctly |
| 7 | `classifyIntent` defaults to `product_info` | Ambiguous input like "dime más" defaults correctly |
| 8 | `chat()` returns product_info response when intent is product_info | Mocked LLM returns expected response with sources |
| 9 | `chat()` returns promo_copy response when intent is promo_copy | System prompt switches to marketing prompt |
| 10 | `chat()` returns stub for affiliate_metrics intent | No LLM call made; stub response returned |
| 11 | `chat()` logs warning when input is significantly sanitized | Security warning logged when >10% length difference |
| 12 | `chat()` handles empty RAG results | Response states no product context available; sources is empty array |
| 13 | `chat()` re-throws LLM errors as AppError(500) | Generic error message, no stack trace exposed |

**Mock setup**:
```typescript
vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn(),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    buildPrompt: vi.fn((systemPrompt, context, userMessage) => [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: context },
      { role: 'user', content: userMessage },
    ]),
  },
}));

vi.mock('../../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue(null),
  },
}));
```

### Verification
- [ ] File exists at `backend/src/__tests__/services/ai/affiliate-chat.service.test.ts`
- [ ] All 13 tests pass with `pnpm vitest run affiliate-chat.service`
- [ ] No `any` types in test file
- [ ] Mocks are properly scoped with `vi.mock()`
- [ ] `beforeEach` calls `vi.clearAllMocks()`, `afterEach` calls `vi.resetAllMocks()`
- [ ] Test constants defined at top (`USER_ID`, `BUYER_ID`, `AFFILIATE_ID`, `PRODUCT_ID`)
- [ ] `vi.mocked()` used for assertions on mock call arguments

---

## Task 7: Write integration tests for affiliate chat route

**Depends on**: Task 3 (route), Task 4 (skill registration), Task 6 (service tests)

### What to do

Create `backend/src/__tests__/routes/affiliate-chat.routes.test.ts`.

**Test structure** (following `orchestrator.routes.test.ts` pattern):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../../app';
import '../setup';  // Sets up test database environment

// Mock services used by the route
vi.mock('../../../services/ai/affiliate-chat.service', () => ({
  affiliateChatService: {
    chat: vi.fn().mockResolvedValue({
      response: 'Test response',
      sources: [],
    }),
  },
}));

vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: {
    useCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

// Test constants
const BUYER_USER_ID = '00000000-0000-0000-0000-000000000002';
const AFFILIATE_USER_ID = '00000000-0000-0000-0000-000000000003';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';

const request = supertest(app);

describe('Affiliate Chat Routes', () => {
  let buyerCookies: string = '';
  let affiliateCookies: string = '';

  beforeEach(async () => {
    vi.clearAllMocks();

    // Auth via real login (same pattern as orchestrator.routes.test.ts)
    const resBuyer = await request
      .post('/api/auth/login')
      .send({ email: 'buyer@test.com', password: 'p1' });
    const buyerCookieArr = resBuyer.headers['set-cookie'];
    if (Array.isArray(buyerCookieArr)) {
      buyerCookies = buyerCookieArr.map((c: string) => c.split(';')[0]).join('; ');
    }

    const resAffiliate = await request
      .post('/api/auth/login')
      .send({ email: 'affiliate@test.com', password: 'p1' });
    const affiliateCookieArr = resAffiliate.headers['set-cookie'];
    if (Array.isArray(affiliateCookieArr)) {
      affiliateCookies = affiliateCookieArr.map((c: string) => c.split(';')[0]).join('; ');
    }
  });

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | Returns 401 without JWT | Unauthenticated requests are rejected |
| 2 | Returns 400 with missing `productId` | Zod validation catches missing field |
| 3 | Returns 400 with invalid UUID `productId` | Zod validation catches non-UUID |
| 4 | Returns 400 with empty `message` | Zod validation catches empty string |
| 5 | Returns 400 with `message` > 2000 chars | Zod validation catches too-long message |
| 6 | Returns 403 when user has no product access | `verifyProductAccess` rejects unauthorized user |
| 7 | Returns 200 for buyer with confirmed order | Buyer can chat; no credits deducted |
| 8 | Returns 200 for affiliate with active link | Affiliate can chat; credits are deducted |
| 9 | `aiCreditService.useCredits` NOT called for buyers | Buyer check prevents credit deduction |
| 10 | `aiCreditService.useCredits` called for affiliates | Credit deduction happens for non-buyers |
| 11 | Returns 429 when rate limit exceeded | `aiChatLimiter` blocks excessive requests |
| 12 | Response includes `X-RateLimit-*` headers | Rate limit headers present on every response |

### Verification
- [ ] File exists at `backend/src/__tests__/routes/affiliate-chat.routes.test.ts`
- [ ] All 12 tests pass with `pnpm vitest run affiliate-chat.routes`
- [ ] No `any` types in test file
- [ ] `import '../setup'` present for database setup
- [ ] `import { app } from '../../../app'` and `import request from 'supertest'` present
- [ ] Auth uses real login pattern (buyer + affiliate via POST /api/auth/login)
- [ ] Tests verify credit is NOT deducted for `affiliate_metrics` intent (stub response)
- [ ] `uid(req) === userId` auth check is tested (403 when body userId != JWT user)
- [ ] Tests cover happy paths (buyer, affiliate) and error paths (401, 400, 403, 429)
- [ ] Credit deduction behavior verified per user role

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

# 4. Specific affiliate chat tests
pnpm vitest run affiliate-chat
```

### File Checklist

| File | Action | Status |
|------|--------|--------|
| `backend/src/services/ai/affiliate-chat.service.ts` | **Create** | ☐ |
| `backend/src/schemas/ai.schema.ts` | **Modify** (add schema) | ☐ |
| `backend/src/routes/ai.routes.ts` | **Modify** (add route) | ☐ |
| `backend/src/services/ai/index.ts` | **Modify** (add skill) | ☐ |
| `docs/project/reusable-resources.md` | **Modify** (add catalog entry) | ☐ |
| `backend/src/__tests__/services/ai/affiliate-chat.service.test.ts` | **Create** | ☐ |
| `backend/src/__tests__/routes/affiliate-chat.routes.test.ts` | **Create** | ☐ |

**Total**: 3 new files, 4 modified files.

---

## Dependency Graph

```
Task 1 (service) ──┬──→ Task 3 (route) ──→ Task 7 (integration tests)
                   │
                   ├──→ Task 4 (skill registration)
                   │
                   └──→ Task 5 (reusable-resources)

Task 2 (schema) ───→ Task 3 (route)

Task 1 + Task 2 ───→ Task 6 (unit tests)
```

Tasks 1, 2 can be done in parallel.
Task 3 depends on both 1 and 2.
Tasks 4, 5 depend only on 1.
Task 6 depends on 1 (and 2 for types).
Task 7 depends on 3 and 4.
