# Tasks: Description Generator

**Change**: description-generator
**Date**: 2026-06-12
**Status**: 🚧 IN TASKS
**Author**: sdd-tasks
**PRD Ref**: PRD.md §4.11
**Strict TDD**: ✅ Active

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,065 total |
| 600-line budget risk | **Low** (every PR now has 17-58% buffer) |
| Chained PRs recommended | **Yes** (4 PRs) |
| Suggested split | 4 PRs as designed |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
| Decision needed before apply | **No** (preflight C1 ask-already handled, chained PRs confirmed) |

```
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
600-line budget risk: Low (17-58% buffer per PR)
```

---

## PR 1: feat/description-generator-shared-lib (~300 lines)

### T1.0 — Create `backend/src/lib/` dir + stub `ai-product-optimizer.lib.ts`

**Scope**: Directory creation, empty stubs.

- **T1.0.0 (RED)**: Test `normalizeDescription()` with 4 cases:
  ```typescript
  it('trims whitespace', () => expect(normalizeDescription('  hello  ')).toBe('hello'));
  it('lowercases', () => expect(normalizeDescription('HELLO')).toBe('hello'));
  it('strips HTML tags', () => expect(normalizeDescription('<p>Hello</p>')).toBe('hello'));
  it('collapses whitespace', () => expect(normalizeDescription('a  b   c')).toBe('a b c'));
  it('caps at 5000 chars', () => {
    const long = 'a'.repeat(6000);
    expect(normalizeDescription(long).length).toBe(5000);
  });
  ```
- **T1.0.1 (GREEN)**: Create `backend/src/lib/ai-product-optimizer.lib.ts` with `normalizeDescription()` function — trim → toLowerCase → strip HTML regex → collapse whitespace → slice(0, 5000).
- **T1.0.2 (REFACTOR)**: Extract HTML strip regex to module-level constant `const HTML_TAG_RE = /<[^>]*>/g`.

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (CREATE)
**Spec ref**: Shared Lib — Requirement §R6 (normalizeDescription)

---

### T1.1 — Implement `buildCacheKey()`

**Scope**: Cache key with SHA-256 hashing.

- **T1.1.0 (RED)**: Test 3 cases — deterministic (same input → same key), different inputs → different keys, schema version change → different key.
- **T1.1.1 (GREEN)**: Implement `buildCacheKey(productId, description, productType, schemaVersion)` using `crypto.createHash('sha256')` with pipe-delimited raw string + `CACHE_PREFIX` constant.

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Cache spec §R4 (key format)

---

### T1.2 — Implement `cacheGet<T>()` and `cacheSet()`

**Scope**: Redis cache with graceful degradation.

- **T1.2.0 (RED)**: Test `cacheGet` — valid JSON returns parsed object; Redis error (mock throws) returns null. Test `cacheSet` — Redis error logs warning, does not throw.
- **T1.2.1 (GREEN)**: Implement lazy Redis client via `getCacheRedis()` (same pattern as `config.service.ts`). `cacheGet<T>(key)` wraps `redis.get` + `JSON.parse` in try/catch. `cacheSet(key, value, ttl)` wraps `redis.set` with `JSON.stringify` + `'EX'` flag.
- **T1.2.2 (REFACTOR)**: Extract `getCacheRedis()` as module-level lazy-init singleton.

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Cache spec §R4 (Redis fallback), Scenario: Redis unavailable

---

### T1.3 — Implement `fetchProductRagContext()`

**Scope**: RAG context fetch.

- **T1.3.0 (RED)**: Test calls `memoryService.searchSimilar` with correct params (userId, query, 10, `['lesson', 'faq', 'review']`).
- **T1.3.1 (GREEN)**: Implement delegating to `memoryService.searchSimilar(userId, query, 10, ['lesson', 'faq', 'review'])`.

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Scenario: RAG returns chunks

---

### T1.4 — Implement `callLLMForOptimization()`

**Scope**: Typed LLM wrapper with optional Zod schema param.

- **T1.4.0 (RED)**: Test reads config (temperature, maxTokens, model), calls `llmService.chat`, returns content string.
- **T1.4.1 (GREEN)**: Implement with `configService.getNumber/get` for `{configPrefix}.temperature`, `{configPrefix}.max_tokens`, `{configPrefix}.model`, then calls `llmService.chat({ messages: [system, user], model, temperature, maxTokens })`.
- **T1.4.2 (REFACTOR)**: Handle the optional `schema?: z.ZodType<unknown>` param (W16 fix — schema not used in v1 but type signature must support it).

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Config Keys §R5 (description_generator.*)

---

### T1.5 — Implement `parseStructuredResponse<T>()`

**Scope**: JSON parser with safety fallback, never throws.

- **T1.5.0 (RED)**: Test 3 cases — valid JSON parsed correctly; markdown fence ` ```json ` stripped; malformed JSON returns fallback without throwing.
- **T1.5.1 (GREEN)**: Implement with `JSON.parse` in try/catch, pre-check for markdown fences via regex.

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Scenarios: parseStructuredResponse valid/invalid JSON

---

### T1.6 — Implement `deductCreditsAfterSuccess()`

**Scope**: Typed credit deduction, widened `operationKey` union.

- **T1.6.0 (RED)**: Test calls `getOperationCost` with all 5 operations including `'description_generation'`. Verify TypeScript infers union type without `as` cast (C1 fix).
- **T1.6.1 (GREEN)**: Implement:
  ```typescript
  export async function deductCreditsAfterSuccess(
    userId: string,
    operationKey: 'search' | 'chat' | 'generate_insight' | 'churn_prediction' | 'description_generation',
    metadata: string
  ): Promise<void> {
    const cost = aiCreditService.getOperationCost(operationKey);
    await aiCreditService.useCredits(userId, cost, metadata);
  }
  ```

**Files**: `backend/src/lib/ai-product-optimizer.lib.ts` (MODIFY)
**Spec ref**: Credit Operation §R3 (deduction), Scenario: typed operationKey without cast

---

### T1.6b — Add config key allowlist entries

**Scope**: `config.service.ts` has an `ALLOWED_CONFIG_KEYS` allowlist. The 3 new keys must be added or the `configService.getNumber/get` calls in `callLLMForOptimization` will fail at runtime.

- **T1.6b.0 (RED)**: Test that `configService.getNumber('description_generator.temperatura', 0.7)` returns the default 0.7 when key is not set. Currently this would fail if the key is not in `ALLOWED_CONFIG_KEYS`.
- **T1.6b.1 (GREEN)**: Add to `ALLOWED_CONFIG_KEYS` in `config.service.ts` (around line 17-67):
  ```
  'description_generator.temperatura': 0.7,
  'description_generator.max_tokens': 2000,
  'description_generator.model': null,
  ```

**Files**: `backend/src/services/config.service.ts` (MODIFY, +3 lines)
**Spec ref**: Configuration Keys §R4

---

### T1.7 — Verify lib

- **T1.7.0 (VERIFY)**: Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test --run ai-product-optimizer.lib` — all pass.

---

## PR 2a: feat/description-generator-service-skeleton (~250 lines)

### T2.0 — Create `description-generator.service.ts` skeleton

- **T2.0.0 (RED)**: Test that `descriptionGeneratorService` is exported and has `generate()` method.
- **T2.0.1 (GREEN)**: Create skeleton with empty `generate()` returning `{ success: true }`.

**Files**: `backend/src/services/ai/description-generator.service.ts` (CREATE)
**Spec ref**: Requirement §R1 (description.generator)

---

### T2.1 — Input validation in service

**Scope**: Defense-in-depth validation (orchestrator path bypasses Zod).

- **T2.1.0 (RED)**: Test 3 cases — empty productId → AppError(400), description < 10 chars → AppError(400), description > 5000 chars → AppError(400).
- **T2.1.1 (GREEN)**: Add validation block before try-catch.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenario: Valid input cache miss (pre-validation), orchestrator validation scenarios

---

### T2.2 — Cache check (cacheGet → return if hit)

**Scope**: `cacheGet` → return if hit.

- **T2.2.0 (RED)**: Test 2 cases — cache hit returns output with `cached: true`, 0 LLM calls via mock assertion.
- **T2.2.1 (GREEN)**: Compute `cacheKey` via `buildCacheKey`, call `cacheGet`, return `{ success: true, data: { ...cached, cached: true } }` on hit.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenario: Valid input cache hit, Scenario: Cache hit returns stored result

---

## PR 2b: feat/description-generator-service-core (~350 lines)

### T2.3 — RAG fetch with graceful degradation

**Scope**: Non-blocking RAG.

- **T2.3.0 (RED)**: Test 2 cases — RAG results passed to prompt builder; RAG throws → degrades gracefully (no throw, output still generated).
- **T2.3.1 (GREEN)**: Wrap `fetchProductRagContext` in try/catch → empty array on error.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenario: RAG failure degrades gracefully

---

### T2.4 — LLM call + parse + retry

**Scope**: Primary LLM interaction.

- **T2.4.0 (RED)**: Test 3 cases — `callLLMForOptimization` called with correct prompts; malformed JSON first attempt → retry with stricter prompt; both attempts fail → fallback returned with `success: true`.
- **T2.4.1 (GREEN)**: Implement LLM call via `callLLMForOptimization` + `parseStructuredResponse`. If first parse is degraded, append strict instruction to system prompt and retry once.
- **T2.4.2 (REFACTOR)**: Extract `buildUserPrompt()` and `buildRagContext()` helper functions.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenarios: LLM success valid JSON, LLM malformed JSON (1st + 2nd attempt), Scenario: empty titles → degraded

---

### T2.5 — Output building with truncation, defaults, `degraded` field

**Scope**: Safe output construction.

- **T2.5.0 (RED)**: Test 3 truncation cases — titles capped at 3, tags capped at 10, metaDescription capped at 155 chars. Test `degraded` flag in output (W8 fix).
- **T2.5.1 (GREEN)**: Build output with `.slice(0, N)` on arrays and strings. Set `degraded` based on `__degraded` marker from parse.
- **T2.5.2 (REFACTOR)**: Extract `mapSources(ragResults)` helper.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Output shape with `degraded: boolean`, Scenario: empty titles → degraded

---

### T2.6 — Cache write (cacheSet after LLM)

- **T2.6.0 (RED)**: Test that `cacheSet` is called with correct key, output, and TTL after successful LLM generation.
- **T2.6.1 (GREEN)**: Call `cacheSet(cacheKey, output, CACHE_TTL)` after building output.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenario: Cache miss triggers generation and stores result

---

### T2.7 — Error handling wrapper

**Scope**: Catch-all for service errors.

- **T2.7.0 (RED)**: Test 2 cases — `AppError` passes through; unexpected error returns `{ success: false, error: '...' }`.
- **T2.7.1 (GREEN)**: Implement try/catch wrapper around all service logic.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenario: LLM failure returns 502

---

### T2.8 — Language detection (W4 fix — English prompt)

**Scope**: System prompt in English with multilingual instructions.

- **T2.8.0 (RED)**: Test 3 cases — Spanish input `'Aprende TypeScript...'` → `detectedLanguage: 'es'`; English input → `'en'`; Portuguese input → `'pt'`.
- **T2.8.1 (GREEN)**: Set `SYSTEM_PROMPT` in English as per design §3.1 with explicit "FIRST detect language" instruction.

**Files**: `backend/src/services/ai/description-generator.service.ts` (MODIFY)
**Spec ref**: Scenarios: Input language Spanish/English/Portuguese detected

---

### T2.8b — Verify PR 2b service core (VERIFY gate)

**Scope**: VERIFY gate for PR 2b (T2.3–T2.8). Ensures compilation and tests pass before PR 3 starts.

- **T2.8b.0 (VERIFY)**: Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test --run description-generator.service` — all pass. If any fail, fix in PR 2b before merging.

---

### T2.9 — Verify service

- **T2.9.0 (VERIFY)**: Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test --run description-generator.service` — all pass.

---

## PR 3: feat/description-generator-registration (~500 lines)

### T3.0 — Add `descriptionGeneratorSchema` Zod schema

- **T3.0.0 (RED)**: Test 4 cases — missing `productId` → 400, invalid UUID → 400, `productDescription < 10` chars → 400, invalid `productType` → 400.
- **T3.0.1 (GREEN)**: Add Zod object with `productId: z.string().uuid()`, `productDescription: z.string().min(10).max(5000)`, `productType: z.enum([...])`, `userId: z.string().uuid()`.

**Files**: `backend/src/schemas/ai.schema.ts` (MODIFY, +20 lines)
**Spec ref**: Scenarios: Missing productId, invalid UUID, description too short, invalid productType

---

### T3.1 — Add `descriptionGeneratorLimiter` rate limiter

- **T3.1.0 (RED)**: Test that 11th request returns 429.
- **T3.1.1 (GREEN)**: Add rate limiter (10 req/min) after `seoOptimizerLimiter` following identical pattern.

**Files**: `backend/src/middlewares/rateLimit/rateLimit.ts` (MODIFY, +20 lines)
**Spec ref**: Scenario: Rate limit exceeded (11th request in 1 minute)

---

### T3.2 — Add `description_generation` operation cost

- **T3.2.0 (RED)**: Test `getOperationCost('description_generation')` returns 1.
- **T3.2.1 (GREEN)**: Add `description_generation: 1` to costs map and widen `operation` parameter union type.

**Files**: `backend/src/services/ai/credits.service.ts` (MODIFY, +5 lines)
**Spec ref**: Credit Operation §R3 (cost = 1)

---

### T3.3 — Add orchestrator capability `description.generator`

- **T3.3.0 (RED)**: Integration test validates `skillsRegistry.get('description-generator')` returns the capability (tested in T3.7).
- **T3.3.1 (GREEN)**: Register capability in `services/ai/index.ts` with all 5 parameters, 30s timeout, `cacheable: false`, handler delegating to `descriptionGeneratorService.generate()`.

**Files**: `backend/src/services/ai/index.ts` (MODIFY, +40 lines)
**Spec ref**: Requirement §R1 (description.generator capability), orchestrator scenarios

---

### T3.4 — Add route handler with `restrictTo('CREATOR')` + ownership + credits

**Scope**: Full middleware chain + route logic.

- **T3.4.0 (RED)**: Integration test scenarios (T3.7 covers these): no JWT → 401, non-Creator → 403, not owner → 403, 0 credits → 402, success → 200.
- **T3.4.1 (GREEN)**: Implement route `POST /product/description` with chain: `jwtAuthMiddleware`, `restrictTo('CREATOR')` (C2 fix), `descriptionGeneratorLimiter`, `validate(descriptionGeneratorSchema)`, handler in `asyncHandler`.

**Files**: `backend/src/routes/ai.routes.ts` (MODIFY, +30 lines)
**Spec ref**: Scenarios: No JWT, no ownership, 0 credits, valid request

---

### T3.5 — Add route timeout race with `clearTimeout` in `finally` (W6 fix)

- **T3.5.0 (RED)**: Test that on timeout (service > 60s mock), route rejects with 504.
- **T3.5.1 (GREEN)**: Implement `Promise.race` between service call and timeout promise. Clear `timeoutId` in `finally` block.

**Files**: `backend/src/routes/ai.routes.ts` (MODIFY, included in T3.4 handler)
**Spec ref**: Orchestrator timeout (30s), route timeout (60s)

---

### T3.6 — Credit deduction via `deductCreditsAfterSuccess` (C3 fix)

- **T3.6.0 (RED)**: Integration test: cache hit → `creditsUsed: 0`, cache miss → `creditsUsed: 1` (T3.7 covers this).
- **T3.6.1 (GREEN)**: In route handler, after successful generation: if `!result.data.cached && !result.data.degraded`, call `deductCreditsAfterSuccess(userId, 'description_generation', meta)`.

**Files**: `backend/src/routes/ai.routes.ts` (MODIFY, included in T3.4 handler)
**Spec ref**: Scenarios: Credit deducted only after successful LLM, Cache hit does not deduct credit, Degraded output does not deduct credit

---

### T3.7 — Integration test file with all 11+ scenarios

**Scope**: `description-generator.routes.test.ts` with all route-level scenarios.

- **T3.7.0 (RED)**: Create test file with mocks for service, rate limiter, config, credits. Write all test cases (initially failing).
- **T3.7.1 (GREEN)**: Tests pass after T3.0-T3.6 implementations.
- **T3.7.2 (REFACTOR)**: Extract common mocks/setup into `beforeEach` helpers.

**Test scenarios** (13 total):
| # | Scenario | Assertion |
|---|----------|-----------|
| 1 | No JWT | 401 |
| 2 | Invalid JWT | 401 |
| 3 | Missing `productId` | 400 |
| 4 | Invalid UUID `productId` | 400 |
| 5 | `productDescription` < 10 chars | 400 |
| 6 | Invalid `productType` | 400 |
| 7 | Product ownership mismatch | 403 |
| 8 | Product not found | 404 |
| 9 | 0 credits → 402 before LLM | 402 |
| 10 | Service timeout > 60s | 504 |
| 11 | Valid request → 200, `creditsUsed: 1` | 200 |
| 12 | Cache hit → `cached: true`, `creditsUsed: 0` | 200 |
| 13 | Rate limit headers present | Contains headers |

**Files**: `backend/src/__tests__/routes/description-generator.routes.test.ts` (CREATE, ~200 lines)
**Spec ref**: All route scenarios from spec §R2

---

### T3.8 — Verify integration

- **T3.8.0 (VERIFY)**: Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test --run description-generator.routes` — all pass.

---

## T5: Update Project Documentation (direct push to master)

### T5.0 — Update `docs/project/reusable-resources.md`

- Add `aiProductOptimizerLib` entry to AI Services table (§3):
  ```markdown
  | `aiProductOptimizerLib` | Shared LLM/RAG/cache/credit helpers for product optimization services |
  ```
- Add `descriptionGeneratorService` to AI Services table:
  ```markdown
  | `descriptionGeneratorService` | Product description generation (titles, description, objectives, tags, metaDescription) |
  ```
- Add `lib/ai-product-optimizer.lib.ts` to Lib Helpers table with its 7 exported functions.

**Files**: `docs/project/reusable-resources.md` (MODIFY)

---

### T5.1 — Update `docs/project/ai-features/PRD.md` §4.11

- Update status to `✅ Backend completo (4 PRs chained)`.
- Add link to merged PRs (PR #1, PR #2a, PR #2b, PR #3).

**Files**: `docs/project/ai-features/PRD.md` (MODIFY)

---

### T5.2 — Update `docs/project/ai-features/TECHNICAL-SPEC.md` (if exists)

- Add `description-generator` section if file exists.
- Document endpoint `POST /api/ai/product/description`.
- Document capability `description.generator`.

**Files**: `docs/project/ai-features/TECHNICAL-SPEC.md` (MODIFY if exists)

---

## TDD Compliance Checklist

- [x] Each PR has its own RED-GREEN-REFACTOR cycle
- [x] Test scenarios from spec.md map to specific test files
- [x] No PR ships code without tests (strict TDD enforced)
- [x] No PR ships tests without code (no orphan tests — each test TASK has a code TASK)
- [x] Strict TDD is enforced by sdd-apply phase via `strict_tdd: true` in `openspec/config.yaml`
- [ ] Each PR has buffer for TDD refactor (no PR at 0% budget)

---

## Implementation Order

1. **PR 1 → PR 2a → PR 2b → PR 3** (sequential, each depends on prior)
2. Each PR targets `master` directly (stacked-to-main strategy)
3. PR 1 enables PR 2a (lib consumed by service skeleton)
4. PR 2a enables PR 2b (skeleton consumed by LLM core)
5. PR 2b enables PR 3 (service consumed by route handler)
6. **T5** (docs) goes direct to master after all 4 PRs merge

### Dependency Notes

- **PR 2a** depends on **PR 1** (uses shared lib)
- **PR 2b** depends on **PR 1 + PR 2a** (uses shared lib + service skeleton)
- **PR 3** depends on **PR 1 + PR 2a + PR 2b** (uses shared lib + service)
- **T5** depends on all 4 PRs merged (must reflect final code)

---

## Dependency Graph

```
T1.0 ───────────────────────────────────┐
T1.1 ───────────────────────────────────┤
T1.2 ───────────────────────────────────┤
T1.3 ───────────────────────────────────┤
T1.4 ───────────────────────────────────┤
T1.5 ───────────────────────────────────┤──► PR 1 (stacked-to-main)
T1.6 ───────────────────────────────────┤
T1.7 ───────────────────────────────────┘
                    │
T2.0 ───────────────┤
T2.1 ───────────────┤
T2.2 ───────────────├──► PR 2a (stacked-to-main)
                    │
T2.3 ───────────────┤
T2.4 ───────────────┤
T2.5 ───────────────┤
T2.6 ───────────────┤
T2.7 ───────────────┤
T2.8 ───────────────┤
T2.8b ──────────────┤──► PR 2b (stacked-to-main)
T2.9 ───────────────┘
                    │
T3.0 ───────────────┤
T3.1 ───────────────┤
...                 ├──► PR 3 (stacked-to-main)
T3.8 ───────────────┘
                    │
T5.0 ───────────────┴──► master (direct push)
T5.1 ───────────────────► master (direct push)
T5.2 ───────────────────► master (direct push)
```
