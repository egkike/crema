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
- [ ] T2.3–T2.9 — Service core (PR 2b)
- [ ] T3.0–T3.8 — Registration + integration tests (PR 3)
- [ ] T5.0–T5.5 — Documentation updates

---

## TDD Cycle Evidence

| Task | RED (test written first) | GREEN (implementation passes) | REFACTOR |
|------|--------------------------|-------------------------------|----------|
| T1.0 | ✅ 5 tests written, failed (module not found) | ✅ 5/5 pass after `normalizeDescription()` impl | ✅ `HTML_TAG_RE` extracted to module-level constant |
| T1.1 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `buildCacheKey()` impl | N/A — clean implementation |
| T1.2 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `cacheGet`/`cacheSet` impl | ✅ `getCacheRedis()` extracted as lazy-init singleton |
| T1.3 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `fetchProductRagContext()` impl | N/A — thin wrapper |
| T1.4 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `callLLMForOptimization()` impl | ✅ `_schema` param added (W16 fix, unused in v1) |
| T1.5 | ✅ 3 tests written, failed (function not found) | ✅ 3/3 pass after `parseStructuredResponse()` impl | N/A — clean implementation |
| T1.6 | ✅ 1 test written, failed (function not found) | ✅ 1/1 pass after `deductCreditsAfterSuccess()` impl | N/A — typed union, no `as` cast |
| T1.6b | ✅ 1 test added to `config.service.test.ts`, failed (keys missing) | ✅ 1/1 pass after adding 3 keys to `ALLOWED_CONFIG_KEYS` | N/A |
| T1.7 | N/A (verify gate) | ✅ `pnpm tsc --noEmit` — 0 errors | ✅ `pnpm lint` — 0 errors, 0 warnings |

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

| File | Action | Lines Added | Lines Removed |
|------|--------|-------------|---------------|
| `backend/src/lib/ai-product-optimizer.lib.ts` | CREATE | 189 | 0 |
| `backend/src/__tests__/lib/ai-product-optimizer.lib.test.ts` | CREATE | 304 | 0 |
| `backend/src/services/config.service.ts` | MODIFY | 4 | 1 |
| `backend/src/services/ai/credits.service.ts` | MODIFY | 2 | 1 |
| `backend/src/__tests__/services/config.service.test.ts` | MODIFY | 5 | 0 |
| **TOTAL** | | **504** | **2** |

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

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| T2.0 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | N/A (new) | ✅ 1 test written, failed (module not found) | ✅ 1/1 pass after skeleton impl | ➖ Single (structural) | ➖ None needed |
| T2.1 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 1/1 | ✅ 5 tests written, failed (promise resolved instead of rejecting) | ✅ 5/5 pass after validation block | ✅ 5 cases (empty productId, short desc, long desc, exactly 10 chars, exactly 5000 chars) | ✅ 3 tests refactored to single try/catch; 2 boundary tests added with return-value assertions |
| T2.2 | `__tests__/services/ai/description-generator.service.test.ts` | Unit | ✅ 4/4 | ✅ 2 tests written, 1 failed (cache hit returned no data) | ✅ 2/2 pass after cache check impl | ✅ 2 cases (cached output shape, no LLM call) | ➖ None needed |

---

### Verification Results

#### Test Command
```
cd backend && pnpm test --run description-generator.service
```
**Result**: 8 tests passed (8/8)

#### Full Suite Regression
```
cd backend && pnpm test --run
```
**Result**: 1525 tests passed, 0 failed (99 test files passed, 1 skipped)

#### Typecheck
```
cd backend && npm run typecheck
```
**Result**: 0 errors

#### Lint
```
cd backend && npm run lint
```
**Result**: 0 errors, 0 warnings

---

### Implementation Decisions

1. **Service skeleton follows seo-optimizer pattern**: `export const descriptionGeneratorService = { async generate(...) }` — singleton object, not class. Matches `seoOptimizerService` exactly.

2. **Validation before try-catch**: Validation throws directly (not caught by the service's error wrapper). This matches the seo-optimizer pattern where validation throws `AppError` before entering the try-catch block. Defense-in-depth: the HTTP path validates via Zod middleware first; the orchestrator path doesn't use Zod, so service-level validation is the only check there.

3. **Cache check uses lib helpers directly**: `buildCacheKey` and `cacheGet` from `ai-product-optimizer.lib.ts`. The `SCHEMA_VERSION = 1` constant is defined in the service (bumped when output shape changes). Cache hit returns `{ success: true, data: { ...cached, cached: true } }` — the spread ensures the `cached` field is always `true` regardless of what was stored.

4. **Unused import cleanup**: `EmbeddingSearchResult` type was initially imported but not needed until PR 2b (RAG context). Removed to pass lint.

---

### Files Changed

| File | Action | Lines Added | Lines Removed |
|------|--------|-------------|---------------|
| `backend/src/services/ai/description-generator.service.ts` | CREATE | 92 | 0 |
| `backend/src/__tests__/services/ai/description-generator.service.test.ts` | CREATE | 197 | 0 |
| **TOTAL** | | **289** | **0** |

---

### Deviations from Design

**None.** Implementation matches design §2.2 exactly for the PR 2a scope (skeleton + validation + cache read). The remaining service logic (RAG, LLM, output building, error handling, language detection) will be added in PR 2b.

---

### Issues Found

**None.** One lint error caught during verification (unused `EmbeddingSearchResult` import) — fixed immediately.
