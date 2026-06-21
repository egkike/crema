# Apply Progress: description-generator

**Change**: description-generator
**Phase**: apply
**Mode**: Strict TDD
**Date**: 2026-06-21

---

## PR 1: feat/description-generator-shared-lib

### Completed Tasks

- [x] T1.0 — Create `backend/src/lib/` dir + `ai-product-optimizer.lib.ts` with `normalizeDescription()`
- [x] T1.1 — Implement `buildCacheKey()` with SHA-256
- [x] T1.2 — Implement `cacheGet<T>()` and `cacheSet()` with graceful Redis fallback
- [x] T1.3 — Implement `fetchProductRagContext()` delegating to `memoryService.searchSimilar()`
- [x] T1.4 — Implement `callLLMForOptimization()` with config reading + optional schema param
- [x] T1.5 — Implement `parseStructuredResponse<T>()` with markdown fence stripping + safe fallback
- [x] T1.6 — Implement `deductCreditsAfterSuccess()` with widened union type (no `as` cast)
- [x] T1.6b — Add 3 config keys to `ALLOWED_CONFIG_KEYS` in `config.service.ts`
- [x] T1.7 — Verify gate: typecheck ✅, lint ✅, tests ✅

### Pending Tasks

- [x] T2.0 — Create `description-generator.service.ts` skeleton (PR 2a) ✅
- [x] T2.1 — Input validation (PR 2a) ✅
- [x] T2.2 — Cache check (PR 2a) ✅
- [x] T2.3–T2.9 — Service core (PR 2b) ✅
- [ ] T3.0–T3.8 — Registration + integration tests (PR 3)
- [ ] T5.0–T5.5 — Documentation updates

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T1.0 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | N/A (new) | ✅ 5 tests written, failed (module not found) | ✅ 5/5 pass after `normalizeDescription()` impl | ➖ N/A | ✅ `HTML_TAG_RE` extracted to module-level constant |
| T1.1 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 5/5 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `buildCacheKey()` impl | ➖ N/A | ➖ Clean implementation |
| T1.2 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 8/8 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `cacheGet`/`cacheSet` impl | ➖ N/A | ✅ `getCacheRedis()` extracted as lazy-init singleton |
| T1.3 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 11/11 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `fetchProductRagContext()` impl | ➖ N/A | ➖ Thin wrapper |
| T1.4 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 12/12 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `callLLMForOptimization()` impl | ➖ N/A | ✅ `_schema` param added (W16 fix, unused in v1) |
| T1.5 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 13/13 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `parseStructuredResponse()` impl | ➖ N/A | ➖ Clean implementation |
| T1.6 | `__tests__/lib/ai-product-optimizer.lib.test.ts` | Unit | ✅ 16/16 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `deductCreditsAfterSuccess()` impl | ➖ N/A | ➖ Typed union, no `as` cast |
| T1.6b | `__tests__/services/config.service.test.ts` | Unit | ✅ 17/17 | ✅ 1 test added, failed (keys missing) | ✅ 1/1 pass after adding 3 keys to `ALLOWED_CONFIG_KEYS` | ➖ N/A | ➖ N/A |
| T1.7 | N/A | Verify gate | N/A | N/A | ✅ `pnpm tsc --noEmit` — 0 errors | N/A | ✅ `pnpm lint` — 0 errors, 0 warnings |

---

## Verification Results

### Test Command
```
cd backend && pnpm test --run ai-product-optimizer.lib
```
**Result**: 22 tests passed (22/22)

### Full Suite Regression
```
cd backend && pnpm test --run
```
**Result**: 1517 tests passed, 0 failed (98 test files passed, 1 skipped)

### Typecheck
```
cd backend && npm run typecheck
```
**Result**: 0 errors

### Lint
```
cd backend && npm run lint
```
**Result**: 0 errors, 0 warnings

---

## Cross-PR Dependency Note

- **`description_generation: 1` cost entry was front-loaded from T3.2** (PR 3) into T1.6 (PR 1) as part of the deviation cleanup. When PR 3 apply runs, T3.2 will be a no-op for the cost map (entry already present). The TDD evidence for T3.2 should be documented as "pre-existing entry, no new test required" rather than a fresh RED→GREEN cycle.

---

## Implementation Decisions

1. **Redis mock pattern**: Used constructor-style mock (`function RedisMock() { this.get = ... }`) instead of `vi.fn().mockImplementation(() => ({...}))` to properly support `new Redis()` semantics with shared `vi.hoisted()` references.

2. **`getOperationCost` type widening**: Widened the `operation` parameter union type in `credits.service.ts` to include `'description_generation'`. The `costs` map is a strongly-typed `Record<'search' | 'chat' | 'generate_insight' | 'churn_prediction' | 'description_generation', number>` with all 5 entries, including `description_generation: 1` (front-loaded from PR 3 T3.2 — see Cross-PR Dependency Note).

3. **Import ordering**: Used `import crypto from 'crypto'` (no `node:` prefix — matches all 13 other files in the codebase). Grouped external packages (`ioredis`, `zod`) before internal relative imports, sorted alphabetically within groups.

---

## Files Changed

| File | Action | Diff Lines Added | Diff Lines Removed | Final Line Count |
|------|--------|-------------|---------------|------------------|
| `backend/src/lib/ai-product-optimizer.lib.ts` | CREATE | 189 | 0 | 194 |
| `backend/src/__tests__/lib/ai-product-optimizer.lib.test.ts` | CREATE | 304 | 0 | 304 |
| `backend/src/services/config.service.ts` | MODIFY | 4 | 1 | 299 |
| `backend/src/services/ai/credits.service.ts` | MODIFY | 2 | 1 | 250 |
| `backend/src/__tests__/services/config.service.test.ts` | MODIFY | 5 | 0 | 132 |
| **TOTAL** | | **504** | **2** | **1179** |

---

## Deviations from Design

**None.** The original implementation followed the design exactly, but two issues were caught during post-apply review and fixed in-place:

1. **`costs` map tightened**: Initial impl used `Record<string, number>` (weakened typing that lied about the runtime). Fixed by switching to `Record<'search' | 'chat' | 'generate_insight' | 'churn_prediction' | 'description_generation', number>` and adding `description_generation: 1` to the costs map. TypeScript now enforces the key set; runtime matches the type. **Closes the risk flagged in the apply result** (no path can return `undefined` for the new operation key).
2. **`crypto` import reverted to project convention**: Initial impl used `import crypto from 'node:crypto'`. Verified against 13 existing files in the codebase (e.g. `auth.controller.ts`, `user.repository.ts`, `SimulatorProvider.ts`) — all use `import crypto from 'crypto'`. Reverted to match project convention.

---

## Issues Found

Both fixed in this batch. Post-fix verification:

- `cd backend && pnpm test --run ai-product-optimizer.lib` → 22/22 pass
- `cd backend && pnpm test --run` → 1517/1517 pass (full regression)
- `cd backend && npm run typecheck` → 0 errors
- `cd backend && npm run lint` → 0 errors, 0 warnings

---

## PR 2a: feat/description-generator-service-skeleton

### Completed Tasks

- [x] T2.0 — Create `description-generator.service.ts` skeleton with `descriptionGeneratorService.generate()` stub
- [x] T2.1 — Input validation: productId required, description 10–5000 chars, throws `AppError(400)`
- [x] T2.2 — Cache check: `buildCacheKey` → `cacheGet` → return `{ success: true, data: { ...cached, cached: true } }` on hit

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T2.0 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | N/A (new) | ✅ 1 test written, failed (module not found) | ✅ 1/1 pass after skeleton impl | ➖ Single (structural) | ➖ None needed |
| T2.1 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 1/1 | ✅ 5 tests written, failed (promise resolved instead of rejecting) | ✅ 5/5 pass after validation block | ✅ 5 cases (empty productId, short desc, long desc, exactly 10 chars, exactly 5000 chars) | ✅ 3 tests refactored to single try/catch; 2 boundary tests added with return-value assertions |
| T2.2 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 4/4 | ✅ 2 tests written, 1 failed (cache hit returned no data) | ✅ 2/2 pass after cache check impl | ✅ 2 cases (cached output shape, no LLM call) | ➖ None needed |

---

## Verification Results

### Test Command
```
cd backend && pnpm test --run description-generator.service
```
**Result**: 8 tests passed (8/8)

### Full Suite Regression
```
cd backend && pnpm test --run
```
**Result**: 1525 tests passed, 0 failed (99 test files passed, 1 skipped)

### Typecheck
```
cd backend && npm run typecheck
```
**Result**: 0 errors

### Lint
```
cd backend && npm run lint
```
**Result**: 0 errors, 0 warnings

---

## Implementation Decisions

1. **Service skeleton follows seo-optimizer pattern**: `export const descriptionGeneratorService = { async generate(...) }` — singleton object, not class. Matches `seoOptimizerService` exactly.

2. **Validation before try-catch**: Validation throws directly (not caught by the service's error wrapper). This matches the seo-optimizer pattern where validation throws `AppError` before entering the try-catch block. Defense-in-depth: the HTTP path validates via Zod middleware first; the orchestrator path doesn't use Zod, so service-level validation is the only check there.

3. **Cache check uses lib helpers directly**: `buildCacheKey` and `cacheGet` from `ai-product-optimizer.lib.ts`. The `SCHEMA_VERSION = 1` constant is defined in the service (bumped when output shape changes). Cache hit returns `{ success: true, data: { ...cached, cached: true } }` — the spread ensures the `cached` field is always `true` regardless of what was stored.

4. **Unused import cleanup**: `EmbeddingSearchResult` type was initially imported but not needed until PR 2b (RAG context). Removed to pass lint.

---

## Files Changed

| File | Action | Diff Lines Added | Diff Lines Removed | Final Line Count |
|------|--------|-------------|---------------|------------------|
| `backend/src/services/ai/description-generator.service.ts` | CREATE | 92 | 0 | 288 |
| `backend/src/__tests__/services/ai/description-generator.service.test.ts` | CREATE | 197 | 0 | 521 |
| **TOTAL** | | **289** | **0** | **809** |

---

## Deviations from Design

**None.** Implementation matches design §2.2 exactly for the PR 2a scope (skeleton + validation + cache read). The remaining service logic (RAG, LLM, output building, error handling, language detection) will be added in PR 2b.

---

## Issues Found

**None.** One lint error caught during verification (unused `EmbeddingSearchResult` import) — fixed immediately.

---

## PR 2b: feat/description-generator-service-core

### Completed Tasks

- [x] T2.3 — RAG fetch with graceful degradation (try/catch → empty array on error)
- [x] T2.4 — LLM call + parse + retry (retry once with stricter prompt on degraded parse)
- [x] T2.5 — Output building with truncation (titles: 3, tags: 10, metaDescription: 155) + `degraded` field
- [x] T2.6 — Cache write (`cacheSet` after successful non-degraded generation)
- [x] T2.7 — Error handling wrapper (AppError passes through, unexpected → `{ success: false }`)
- [x] T2.8 — Language detection (English system prompt with "FIRST detect language" instruction)
- [x] T2.8b — Verify gate: typecheck ✅, lint ✅, tests ✅
- [x] T2.9 — Final verify: typecheck ✅, lint ✅, tests ✅

---

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T2.3 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 8/8 | ✅ 2 tests written, failed (service returned `{ success: true }` stub) | ✅ 2/2 pass after RAG try/catch impl | ➖ N/A | ➖ Clean |
| T2.4 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 16/16 | ✅ 3 tests written, failed (LLM never called) | ✅ 3/3 pass after LLM + parse + retry impl | ✅ 3 cases (correct prompts, retry stricter prompt, both fail degraded) | ✅ `buildUserPrompt()` and `buildRagContext()` extracted as module-level helpers |
| T2.5 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 20/20 | ✅ 4 tests written, failed (no truncation, no degraded flag) | ✅ 4/4 pass after output building with `.slice(0, N)` | ✅ 4 cases (titles cap 3, tags cap 10, meta cap 155, degraded flag) | ✅ `mapSources()` extracted as module-level helper |
| T2.6 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 23/23 | ✅ 1 test written, failed (cacheSet never called) | ✅ 1/1 pass after `cacheSet` call post-generation | ➖ N/A | ➖ Clean |
| T2.7 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 25/25 | ✅ 2 tests written, failed (errors not caught) | ✅ 2/2 pass after try/catch wrapper around cache-miss path | ➖ N/A | ➖ Clean |
| T2.8 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 29/29 | ✅ 3 tests written, failed (no `detectedLanguage` in output) | ✅ 3/3 pass after system prompt + language passthrough | ➖ N/A | ➖ Language detection is LLM-side per design |
| T2.8b | N/A | Verify gate | N/A | N/A | ✅ `pnpm tsc --noEmit` — 0 errors | N/A | ✅ `pnpm lint` — 0 errors, 0 warnings |
| T2.9 | N/A | Verify gate | N/A | N/A | ✅ `pnpm tsc --noEmit` — 0 errors | N/A | ✅ Full regression: 1546/1546 pass |

---

## Verification Results

### Test Command
```
cd backend && pnpm test --run description-generator.service
```
**Result**: 29 tests passed (29/29) — 8 from PR 2a + 21 new in PR 2b

### Full Suite Regression
```
cd backend && pnpm test --run
```
**Result**: 1546 tests passed, 0 failed (99 test files passed, 1 skipped)

### Typecheck
```
cd backend && npm run typecheck
```
**Result**: 0 errors

### Lint
```
cd backend && npm run lint
```
**Result**: 0 errors, 0 warnings

---

## Implementation Decisions

1. **Retry mechanism**: If first `parseStructuredResponse` returns the fallback (degraded: true) or has empty required fields (`hasDegradedFields` returning true), the service retries ONCE with a stricter system prompt — differentiated by failure mode: 'malformed JSON' prompt for parse failures, 'missing required fields' prompt for empty-field failures. The retry LLM call is wrapped in its own try/catch — if it throws, `isDegraded = true` and the fallback is returned.

2. **Cache write only for non-degraded output**: Degraded output (fallback data) is NOT cached. This prevents polluting the cache with incomplete data that would be served to subsequent identical requests.

3. **Error handling structure**: Validation throws BEFORE the try/catch (AppError propagates directly). Everything else (cache check, RAG, LLM, output building) is inside the try/catch. `AppError` instances are caught and returned as `{ success: false, error }`. Non-AppError instances are logged and returned as `{ success: false, error: 'Failed to generate product description' }`.

4. **Language detection is LLM-side**: The system prompt instructs the LLM to detect the input language and include `detectedLanguage` in its JSON response. The service passes through the value with validation (must be 'es', 'en', or 'pt'; defaults to 'en' otherwise). No separate NLP library needed.

5. **Module-level helpers extracted**: `buildUserPrompt()`, `buildRagContext()`, `mapSources()`, and `hasDegradedFields()` are all module-level functions (not inside the service object). This follows the design §2.2 structure and makes them independently testable.

6. **Mock default re-establishment**: Tests use `vi.resetAllMocks()` in `afterEach` (from PR 2a pattern), which clears mock implementations. PR 2b adds `beforeEach` re-establishment of default mock return values to prevent cross-test contamination.

7. **Boundary test adaptation**: The 2 boundary tests from PR 2a (exactly 10 chars, exactly 5000 chars) originally asserted `toEqual({ success: true })` which was the stub's cache-miss return. With the full implementation, cache miss now returns `{ success: true, data: output }`. The tests were adapted to assert `result.success === true` inside the try block — preserving their intent (validation boundary acceptance) while matching the new return shape.

---

## Files Changed

| File | Action | Diff Lines Added | Diff Lines Removed | Final Line Count |
|------|--------|-------------|---------------|------------------|
| `backend/src/services/ai/description-generator.service.ts` | MODIFY | 220 | 32 | 288 |
| `backend/src/__tests__/services/ai/description-generator.service.test.ts` | MODIFY | 324 | 27 | 541 |
| **TOTAL** | | **544** | **59** | **829** |

---

## Deviations from Design

**Minor deviation in error handling structure.** Design §2.2 shows the LLM call throwing `AppError(500)` inside its own try/catch, then the outer catch re-checks `instanceof AppError`. The implementation follows this exactly. However, the retry LLM call's error is caught separately (inside the retry block) to prevent it from propagating to the outer catch — this ensures the service returns `{ success: true, data: { degraded: true } }` instead of `{ success: false }` when the retry LLM call fails. This matches the spec requirement: "both attempts fail → fallback returned with success: true".

---

## Issues Found

1. **`vi.resetAllMocks()` cleared mock implementations**: The PR 2a test pattern used `vi.resetAllMocks()` in `afterEach`, which clears mock implementations set by `vi.mock()` factory. This caused all PR 2b tests to fail because default mock return values were lost between tests. Fixed by re-establishing defaults in `beforeEach`.

2. **TypeScript error in `makeFallback` helper**: Initial implementation used `Array<{ contentType: string; ... }>` for the `sources` parameter, which was incompatible with the output type's `'lesson' | 'faq' | 'review'` literal union. Fixed by using `DescriptionGeneratorOutput['sources']` as the parameter type.
