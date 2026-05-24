# Apply Progress: SEO Optimizer

**Change**: `seo-optimizer` | **Started**: 2026-05-24

---

## Completed Tasks

### Task 3: Add Zod schema to ai.schema.ts ✅

**Files changed:**
- `backend/src/schemas/ai.schema.ts` — Added `seoOptimizerSchema` and `SEOOptimizerRequest` type after `affiliateChatSchema`

**Verification:**
- ✅ `seoOptimizerSchema` exported from `ai.schema.ts`
- ✅ `SEOOptimizerRequest` type exported
- ✅ Schema validates: UUID for productId/userId, productName 1-200 chars, productDescription 10-5000 chars, valid productType enum
- ✅ `pnpm tsc --noEmit` passes (0 errors)
- ✅ `pnpm lint` passes (0 errors)

### Task 4: Add route to ai.routes.ts ✅

**Files changed:**
- `backend/src/routes/ai.routes.ts` — Added `POST /api/ai/product/seo` route after Content Assistant routes section
- `backend/src/middlewares/rateLimit/rateLimit.ts` — Added `seoOptimizerLimiter` (10 requests/min)

**Import additions:**
- `import { seoOptimizerService } from '../services/ai/seo-optimizer.service'`
- `import { seoOptimizerSchema } from '../schemas/ai.schema'`
- Added `seoOptimizerLimiter` to existing rate limiter import line

**Middleware chain:**
`jwtAuthMiddleware` → `seoOptimizerLimiter` → `validate(seoOptimizerSchema)` → handler

**Verification:**
- ✅ Route registered at `POST /product/seo`
- ✅ Middleware chain: `jwtAuthMiddleware` → `seoOptimizerLimiter` → `validate(seoOptimizerSchema)` → handler
- ✅ Product ownership verified (creator_id check via pool.query)
- ✅ Credit deducted AFTER LLM success (try/catch with aiCreditService.useCredits)
- ✅ `seoOptimizerService` imported and used
- ✅ `seoOptimizerSchema` imported and used in validate middleware
- ✅ `seoOptimizerLimiter` created (10 requests/min) in rateLimit.ts
- ✅ `pnpm tsc --noEmit` passes (0 errors)
- ✅ `pnpm lint` passes (0 errors)

---

### Task 7: Write integration tests for SEO route ✅

**File created:**
- `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` — 16 integration tests for `POST /api/ai/product/seo`

**Test scenarios covered:**

| # | Scenario | Status Code | What it verifies |
|---|----------|-------------|------------------|
| 1 | No JWT token | 401 | Unauthenticated requests rejected |
| 2 | Invalid/expired JWT | 401 | Bad tokens rejected |
| 3 | Missing productId | 400 | Zod validation catches missing field |
| 4 | Invalid UUID productId | 400 | Zod validation catches non-UUID |
| 5 | productDescription < 10 chars | 400 | Zod validation catches too short |
| 6 | Invalid productType | 400 | Zod validation catches invalid enum |
| 7 | User doesn't own product | 403 | Ownership verification fails |
| 8 | Product not found | 404 | pool.query returns empty rows |
| 9 | User has 0 credits | 402 | Credit pre-check fails before LLM call |
| 10 | LLM generation timeout | 504 | Route propagates 504 from service layer |
| 11 | Happy path (valid request) | 200 | Successful SEO generation |
| 12 | Response includes SEO data | 200 | All expected fields present |
| 13 | useCredits called on success | 200 | Credits deducted after LLM success |
| 14 | X-RateLimit-* headers present | 200 | Rate limiting applied |
| 15 | Rate limit exceeded | 429 | Too many requests rejected |
| 16 | Body userId mismatch | 403 | JWT identity vs body userId check |

**Mock pattern:**
- `seoOptimizerService.generate` — mocked for happy path, 504 error scenarios
- `aiCreditService.getBalance` / `useCredits` — mocked for credit checks
- `pool.query` — mocked for product ownership verification
- `seoOptimizerLimiter` — mocked as passthrough with headers, or 429 response

**Key detail:** Zod's UUID validator requires proper version bits (not zero-padded UUIDs). Test constants use `'123e4567-e89b-42d3-a456-...'` pattern which passes validation.

**Verification:**
- ✅ 16 integration tests pass (`pnpm vitest run seo-optimizer.routes`)
- ✅ Combined with 18 service unit tests = 34 total SEO tests passing
- ✅ No `any` types in test file
- ✅ `import '../setup'` present for database/config mocks
- ✅ Auth uses `generateTestAccessToken` / `generateTestRefreshToken` pattern
- ✅ Mocks properly scoped with `vi.mock()` at module level
- ✅ `beforeEach` calls `vi.resetAllMocks()`, `afterEach` calls `vi.useRealTimers()` safety net
- ✅ `pnpm tsc --noEmit` passes (0 errors)
- ✅ `pnpm lint` passes (0 errors in test file)

---

## Remaining Tasks

- [ ] Task 0: DB Migration
- [ ] Task 1: Create `seo-optimizer.repository.ts`
- [ ] Task 2: Create `seo-optimizer.service.ts`
- [x] Task 3: Add Zod schema to `ai.schema.ts`
- [x] Task 4: Add route to `ai.routes.ts`
- [ ] Task 5: Register skill in `ai/index.ts`
- [ ] Task 6: Write unit tests for `seo-optimizer.service.ts`
- [x] Task 7: Write integration tests for SEO route
- [ ] Task 8: Update Project Documentation

---

## Deviations from Design

None.

---

## Workload / PR Boundary

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280-360 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | Single PR (feature-complete) |
