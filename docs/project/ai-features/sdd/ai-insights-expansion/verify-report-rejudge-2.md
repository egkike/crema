# Verify Report — Re-Judgment (Blind Judge 2)

**Change**: `ai-insights-expansion`  
**Reviewer**: SDD Verify Executor (Re-judgment after fixes)  
**Date**: 2026-05-26  
**Type**: Blind rejudgment of SDD artifacts  
**Mode**: Strict TDD active (`openspec/config.yaml`)  

---

## Executive Summary

| Dimension | Verdict | Details |
|-----------|---------|---------|
| **Overall** | ⚠️ **PASS with Warnings** | 2 WARNING, 3 SUGGESTION issues remain. All 3 CRITICAL and 5 WARNING issues from prior reviews are now RESOLVED. |
| **Spec Coverage** | PASS | All 3 capabilities fully covered; acceptance criteria complete |
| **Design Consistency** | ⚠️ PASS | Design and Tasks now aligned on DB init, schema shapes, test paths, and persistence. Minor parameter-order inconsistencies remain. |
| **Security** | PASS | HTML sanitization now uses `sanitize-html`; no regex-in-production risk. All other security measures intact. |
| **Test Coverage** | PASS | Test paths corrected; test scenarios adequately cover RED→GREEN→TRIANGULATE. |
| **Workload Budget** | PASS | All 6 PRs within 400-line budget; chained strategy documented |
| **Strict TDD Compliance** | PASS | TDD evidence requirements prepared in tasks; test commands verified working |

---

## Issues Resolution Status

### CRITICAL Issues from Prior Reviews — All Resolved ✅

| # | Issue | Prior Severity | Resolution Evidence |
|---|-------|----------------|---------------------|
| CRIT-1 | DB script location conflict: Design vs Tasks | CRITICAL | **Design §2.1** and **Tasks Task 0** now agree on new file `14-ai-insights-expansion.sql` (not append to `05-ai-tables.sql`). Proposal still references old location (minor — see SUGG-1). |
| CRIT-2 | `compareSchema` shape mismatch (strings vs objects) | CRITICAL | **Tasks Task 1 schema** now uses `z.object({ label, params })` matching **Design §8.1**. |
| CRIT-3 | `insights_history` missing `is_successful`/`error_message` columns | CRITICAL | **Tasks Task 0** now includes `ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS` fixes for both columns. |

### WARNING Issues from Prior Reviews — All Resolved ✅

| # | Issue | Prior Severity | Resolution Evidence |
|---|-------|----------------|---------------------|
| WARN-1 | Churn Factor 4 measures orders, not accesses | WARNING | **Tasks Task 2**: Factor 4 removed with comment about access tracking requiring infrastructure. |
| WARN-2 | Churn queries don't filter by student status | WARNING | **Tasks Task 2**: Added JOIN on `orders` to filter only confirmed buyers. |
| WARN-3 | HTML sanitization using brittle regex | WARNING | **Design §5.2** and **Tasks Task 3**: Now use `sanitize-html` library with allowlist approach. |
| WARN-4 | Test file path discrepancies across docs | WARNING | **Design §11** and **Tasks Task 5**: All test paths now match actual files (`services/ai/`, `ai.routes.test.ts`). |
| WARN-5 | Compare persistence to `insights_history` mismatch | WARNING | **Design §3.3** and **Tasks Task 3**: Now persist to dedicated `ab_comparatives` table. |
| WARN-6 | `threshold` default inconsistency | WARNING | Design and Tasks now use `.default(50)` consistently. |
| WARN-7 | `generateRecoveryEmail` return type missing `recoveryEmailId` | WARNING | **Tasks Task 3** return spec now includes `recoveryEmailId`. |

### SUGGESTION Issues from Prior Reviews — All Resolved ✅

| # | Issue | Prior Severity | Resolution Evidence |
|---|-------|----------------|---------------------|
| SUG-1 | `riskFactors` type mismatch (string[] vs structured) | SUGGESTION | Both **Design §3.1** and **Tasks Task 0** now use `Array<{ factor: string; weight: number }>`. |
| SUG-2 | `tone` has redundant `.optional()` with `.default()` | SUGGESTION | **Tasks Task 1** and **Design §8.1**: Only `.default('empathic')` — no `.optional()`. |
| SUG-3 | Missing `ab_comparatives` table | SUGGESTION | **Tasks Task 0 SQL** now creates `ab_comparatives` table with columns and indexes. |
| SUG-4 | Missing confidence level in churn response | SUGGESTION | **Design §3.1** and **Tasks Task 2** now include `confidence: 'high' \| 'medium' \| 'low'`. |
| SUG-5 | `getOperationCost` type constraint | SUGGESTION | Hardcoded costs are intentional — documented approach. Minor; no resolution needed. |

---

## Remaining Issues

### WARNING A: `generateRecoveryEmail` Parameter Order Mismatch (Design vs Tasks)

**Severity**: ⚠️ WARNING  
**Phase**: Design + Tasks  
**Description**:  
The parameter order across documents is inconsistent:

| Document | Parameter Order |
|----------|----------------|
| **Design §3.2** (service contract) | `(productId, userId, targetUserId, tone?)` |
| **Design §7.1** (route handler call) | `insightsService.generateRecoveryEmail(productId, userId, targetUserId, tone)` |
| **Design §10** (orchestrator handler call) | `insightsService.generateRecoveryEmail(productId, userId, targetUserId, tone)` |
| **Tasks Task 3** (method signature) | `(productId, targetUserId, tone?, creatorId)` |
| **Tasks Task 4** (route handler call) | `insightsService.generateRecoveryEmail(productId, targetUserId, tone, userId)` |

**Mapping breakdown**:
- The DESIGN's consistent signature is `(productId, creatorUserId, targetStudentUserId, tone?)`
- The TASKS swaps the 2nd and 3rd parameters AND renames `userId` to `targetUserId`, putting `creatorId` last:
  - `(productId, targetUserId(student), tone?, creatorId)` — totally different semantic positions

**If the implementation follows Tasks Task 3 strictly**: The route handler call in **Tasks Task 4** (`generateRecoveryEmail(productId, targetUserId, tone, userId)`) would pass:
- `productId` → correct
- `targetUserId` from req.body → maps to 2nd param (which tasks calls `targetUserId` — ok, the name matches)
- `tone` from req.body → maps to 3rd param (called `tone?` — ok)
- `userId` = `uid(req)` → maps to 4th param (`creatorId` — ok)

Wait, actually thinking about it more carefully:
- Tasks Task 3 says: `Accept productId, targetUserId, tone?, creatorId`
- Tasks Task 4 route calls: `generateRecoveryEmail(productId, targetUserId, tone, userId)`
  - `productId` → `productId` ✓
  - `targetUserId` (from req.body) → `targetUserId` ✓
  - `tone` (from req.body) → `tone?` ✓
  - `userId` (from `uid(req)`) → `creatorId` ✓

So the **Tasks are internally consistent with themselves** — the route handler call in Task 4 matches the method signature in Task 3. The issue is that this differs from the **Design's** signature `(productId, userId, targetUserId, tone?)` where `userId` (creator) is the 2nd param, not the 4th.

**BUT**: There's still a subtle issue. The orchestrator handler in **Design §10** calls:
```typescript
insightsService.generateRecoveryEmail(productId, userId, targetUserId, tone)
```
This passes `userId, targetUserId` as 2nd and 3rd params, matching the design contract `(productId, userId, targetUserId, tone?)`. If the implementation follows the Design's contract, this works. If it follows Tasks' contract `(productId, targetUserId, tone?, creatorId)`, the orchestrator call in Design §10 would break because it passes `userId` (creator) as 2nd param, but the Tasks' contract expects `targetUserId` (student) as 2nd param.

**Impact**: The mismatched parameter order WILL cause a runtime bug if the orchestration handler (Design §10) is implemented using the Design's contract but the service method is implemented using the Tasks' contract. These must be reconciled.

**Recommendation**: Align all documents to a single parameter order. The Design's contract `(productId, userId, targetUserId, tone?)` is the most logical — userId (creator) comes before targetUserId (student), matching the patterns used in other service methods. Update Tasks Task 3 to match.

---

### WARNING B: `compareEntities` Parameter Order Mismatch (Design vs Tasks)

**Severity**: ⚠️ WARNING  
**Phase**: Design + Tasks  
**Description**:  
Similar inconsistency to WARNING A:

| Document | Parameter Order |
|----------|----------------|
| **Design §3.3** (service contract) | `(userId, entityType, entityA, entityB, metrics)` |
| **Design §7.1** (route handler call) | `compareEntities(userId, entityType, entityA, entityB, metrics)` |
| **Design §10** (orchestrator handler call) | `compareEntities(userId, entityType, entityA, entityB, metrics)` |
| **Tasks Task 3** (method signature) | `(entityType, entityA, entityB, metrics, creatorId)` |
| **Tasks Task 4** (route handler call) | `compareEntities(entityType, entityA, entityB, metrics, userId)` |

**Key differences**:
1. **Design**: `userId` is 1st param; `entityType` is 2nd.
2. **Tasks**: `entityType` is 1st param; `creatorId`/`userId` is last (5th).
3. **Design §10 orchestrator**: also uses `(userId, entityType, entityA, entityB, metrics)`.

**If implementation follows Tasks**: The route call `compareEntities(entityType, entityA, entityB, metrics, userId)` would pass `userId` (creator) as the 5th param `creatorId` — this would work internally within Tasks.

**If implementation follows Design**: The route call `compareEntities(userId, entityType, entityA, entityB, metrics)` passes `userId` as the 1st param.

**Problem**: These are incompatible. If the service method is written per Tasks (entityType-first), but the orchestrator handler per Design (userId-first), the orchestrator will pass `userId` as `entityType`, causing a validation failure at runtime.

**Recommendation**: Align all documents. Either:
- Option A: Design's order `(userId, entityType, entityA, entityB, metrics)` — keeps userId first, consistent with Design's `predictChurn` method (which also starts with `productId`, then `userId`), or
- Option B: Tasks' order `(entityType, entityA, entityB, metrics, creatorId)` — puts domain params first.

Recommend Option A because it matches the existing `predictChurn` pattern and the orchestrator handlers are already written with this order.

---

### SUGGESTION C: `sanitize-html` Dependency Not Explicitly Listed in Tasks

**Severity**: ℹ️ SUGGESTION  
**Phase**: Tasks  
**Description**:  
**Design §5.2** says `pnpm add sanitize-html`, but **Tasks Task 3** only shows the import:
```typescript
import sanitizeHtml from 'sanitize-html';
```

The `pnpm add` step is not documented in any task action.

**Impact**: Low — the install is a one-liner. But automated apply scripts may miss it.

**Recommendation**: Add `pnpm add sanitize-html` as a prerequisite step in Task 3 actions, or add a note in Task 0 (dependency setup).

---

### SUGGESTION D: Compare Schema `params` Validation Is Too Permissive

**Severity**: ℹ️ SUGGESTION  
**Phase**: Design + Tasks  
**Description**:  
The `compareSchema` defines:
```typescript
params: z.record(z.unknown())
```

This accepts any object, but:
- For `entityType: 'period'`, params should contain `{ startDate: string, endDate: string }`
- For `entityType: 'product'`, params should contain `{ productId: string }`

There's no schema-level validation that the params match the entityType.

**Impact**: Low — the service method would validate at runtime and throw appropriate errors. But Zod could catch this earlier with a discriminated union.

**Recommendation**: Consider using a Zod discriminated union:
```typescript
export const compareSchema = z.discriminatedUnion('entityType', [
  z.object({
    entityType: z.literal('period'),
    entityA: z.object({ label: z.string(), params: z.object({ startDate: z.string(), endDate: z.string() }) }),
    entityB: z.object({ label: z.string(), params: z.object({ startDate: z.string(), endDate: z.string() }) }),
    metrics: z.array(...),
  }),
  z.object({
    entityType: z.literal('product'),
    entityA: z.object({ label: z.string(), params: z.object({ productId: z.string().uuid() }) }),
    entityB: z.object({ label: z.string(), params: z.object({ productId: z.string().uuid() }) }),
    metrics: z.array(...),
  }),
]);
```

This is optional for v1 but would improve type safety.

---

### SUGGESTION E: Proposal Still References `05-ai-tables.sql` Instead of New Script

**Severity**: ℹ️ SUGGESTION  
**Phase**: Proposal  
**Description**:  
The **proposal.md** still lists `05-ai-tables.sql` as the target for the new tables in multiple places:
- Line 71: "Nuevas tablas en `db/init/05-ai-tables.sql`: `churn_predictions`, `recovery_emails`"
- Line 142: "DB Init | `backend/db/init/05-ai-tables.sql` | **Modify** — Agregar `churn_predictions`, `recovery_emails`"
- Line 334: Same in Affected Areas
- Line 402: Same in References

The **design** and **tasks** correctly target `14-ai-insights-expansion.sql`. The proposal should be updated to reflect the new file name.

**Impact**: Low — the proposal is the highest-level document and implementation follows the design and tasks. But future readers may be confused.

**Recommendation**: Update proposal.md Affected Areas, Scope, and References sections to reference `14-ai-insights-expansion.sql` instead of `05-ai-tables.sql`. Also update the In-Scope section to mention the dedicated `ab_comparatives` table.

---

### OBSERVATION: Integration Test Scenario Depth

**Severity**: ℹ️ INFO (not an issue)  
**Phase**: Tasks Task 5  
**Description**:  
The integration test plan in Tasks Task 5 correctly covers status-code scenarios (200, 401, 403, 400, 429). However, the success-path assertions could be more detailed:

| Current spec | Suggested addition |
|-------------|-------------------|
| "Returns 200 with valid request" | ✅ Also verify response shape: `data.predictions` is array with `userId`, `churnScore`, `riskFactors` |
| "Respects rate limiter (429 after N rapid requests)" | ✅ Also verify `Retry-After` header present |

The current plan is adequate but adding response-shape assertions would improve TDD assertion quality. This is a suggestion, not a blocker.

---

## Strict TDD Compliance

**Config**: `openspec/config.yaml` has `strict_tdd: true`

| Check | Status | Finding |
|-------|--------|---------|
| Test command configured | ✅ | `pnpm run vitest` (verified working: 90 files, 1294 tests passing) |
| TDD Cycle Evidence in tasks | ✅ | Tasks Task 5 uses RED→GREEN→TRIANGULATE pattern |
| Test file paths correct | ✅ | All paths now match actual files |
| Assertion quality: no tautologies | ✅ | Test scenarios describe meaningful assertions |
| Assertion quality: no ghost loops | ✅ | Not applicable |
| Assertion quality: type-only assertions | ✅ | Not observed |
| Assertion quality: smoke-only tests | ⚠️ | Integration tests for "200 with valid request" should explicitly verify response body structure |
| Assertion quality: implementation-detail CSS | ✅ | Backend only — not applicable |
| `pnpm tsc --noEmit` passes | ✅ | Verified zero errors |
| `pnpm test` passes | ✅ | Verified 1294 passing, 7 skipped |
| No regressions in existing capabilities | ✅ | All existing tests pass |

---

## Review Workload / PR Boundary Findings

| Field | Reported | Status |
|-------|----------|--------|
| Total estimated lines | ~1100-1300 | ✅ Reasonable estimate |
| 400-line budget risk | High | ✅ Properly identified |
| Chained PRs recommended | Yes (6 PRs) | ✅ Documented |
| Chain strategy | stacked-to-main | ✅ Documented |
| PR-1 (Task 0) | ~80 lines | ✅ Under budget |
| PR-2 (Task 1) | ~120 lines | ✅ Under budget |
| PR-3 (Task 2) | ~250-300 lines | ✅ Under budget |
| PR-4 (Task 3) | ~150 lines | ✅ Under budget |
| PR-5 (Task 4) | ~180 lines | ✅ Under budget |
| PR-6 (Task 5) | ~300 lines | ✅ Under budget |
| Scope creep | Low | ✅ All changes within the 3 defined capabilities |

**Scope boundary check**: No scope creep detected. The implementation is properly bounded within churn prediction, recovery email generation, and A/B comparatives.

---

## Verification Commands

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` (from backend/) | ✅ PASS — zero errors |
| `npx vitest run` (from backend/) | ✅ PASS — 1294 passed, 7 skipped, 90 test files |
| Code inspection: no new methods in agents.service.ts | ✅ Confirmed — no implementation exists yet (expected pre-apply) |
| Code inspection: no new schemas in ai.schema.ts | ✅ Confirmed |
| Code inspection: no new limiters in rateLimit.ts | ✅ Confirmed |
| Code inspection: no new capabilities in index.ts | ✅ Confirmed |

---

## Blocker Assessment

| # | Issue | Blocker? | Resolution |
|---|-------|----------|------------|
| 1 | `generateRecoveryEmail` parameter order mismatch (Design vs Tasks) | ⚠️ **Resolve before apply** | The service contract in Design §3.2 uses `(productId, userId, targetUserId, tone?)` but Tasks Task 3 uses `(productId, targetUserId, tone?, creatorId)`. The orchestrator handler in Design §10 calls with the Design's ordering. If the service is implemented per Tasks but called per Design, this WILL cause runtime bugs. |
| 2 | `compareEntities` parameter order mismatch (Design vs Tasks) | ⚠️ **Resolve before apply** | Same pattern: Design uses `(userId, entityType, entityA, entityB, metrics)` while Tasks uses `(entityType, entityA, entityB, metrics, creatorId)`. Must be reconciled. |
| 3 | All prior CRITICAL issues | ✅ Resolved | DB script location, schema shape, missing columns — all fixed. |

### Remaining Blockers: 2 (WARNING level — must resolve before apply)

---

## Conclusion

**Overall Verdict**: ⚠️ **PASS with Warnings**

All **3 CRITICAL** and **5 WARNING** issues from prior reviews have been resolved. The SDD artifacts are now largely consistent and well-aligned.

**Remaining issues**: 
- **2 WARNING** parameter-order mismatches that must be reconciled before apply (WARNING A and B)
- **3 SUGGESTION** issues that are non-blocking improvements

### Required Actions Before Apply

1. **Fix `generateRecoveryEmail` parameter order**: Align Tasks Task 3 with Design §3.2, or vice versa. Recommend adopting Design's order `(productId, userId, targetUserId, tone?)`.
2. **Fix `compareEntities` parameter order**: Align Tasks Task 3 with Design §3.3. Recommend adopting Design's order `(userId, entityType, entityA, entityB, metrics)`.

### Recommended Actions Before Apply

3. Update Proposal to reference `14-ai-insights-expansion.sql` instead of `05-ai-tables.sql` (SUGG-1)
4. Add `pnpm add sanitize-html` as a prerequisite in Tasks Task 3 (SUGG-2)
5. Consider discriminated union for compare schema `params` validation (SUGG-3)
6. Add response-shape assertions to integration test scenarios (Task 5)

---

## Artifact Summary

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `proposal.md` | ✅ Pass (with minor SUGGESTION for file reference) |
| Spec | `spec.md` | ✅ Pass |
| Design | `design.md` | ⚠️ Pass (with WARNING on parameter order) |
| Tasks | `tasks.md` | ⚠️ Pass (with WARNING on parameter order) |
| Previous Report 1 | `verify-report.md` | ✅ Issues tracked, most resolved |
| Previous Report 2 | `verify-report-2.md` | ✅ Issues tracked, most resolved |
| This Report | `verify-report-rejudge-2.md` | ✅ Created |

---

## Phase Envelope

```json
{
  "phase": "verify",
  "change": "ai-insights-expansion",
  "executor": "rejudge-2",
  "status": "pass_with_warnings",
  "executive_summary": "Re-judgment confirms that all 3 CRITICAL and 5 WARNING issues from prior reviews have been resolved. The DB script location, compareSchema shape, missing ALTER TABLE columns, churn heuristic fix, HTML sanitization library, test paths, and ab_comparatives table are all correctly aligned between design and tasks. Two WARNING-level parameter order mismatches remain for generateRecoveryEmail and compareEntities — these must be resolved before apply to avoid runtime bugs. Three SUGGESTION items are non-blocking improvements. The codebase is healthy: 1294 tests pass, TypeScript compiles cleanly.",
  "artifacts": {
    "proposal": "verified_with_suggestions",
    "spec": "verified",
    "design": "verified_with_warnings",
    "tasks": "verified_with_warnings"
  },
  "next_recommended": "Resolve 2 parameter-order mismatches, then proceed to sdd-apply phase",
  "risks": [
    "generateRecoveryEmail parameter order mismatch (Design: userId-2nd vs Tasks: targetUserId-2nd) — will cause runtime bug if not reconciled before implementation",
    "compareEntities parameter order mismatch (Design: userId-1st vs Tasks: entityType-1st) — same risk",
    "Proposal still references 05-ai-tables.sql for new tables instead of 14-ai-insights-expansion.sql",
    "sanitize-html npm package not explicitly listed as dependency to add in tasks"
  ],
  "skill_resolution": "paths-injected"
}
```
