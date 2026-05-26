# Verify Report: AI Insights Expansion

**Change**: `ai-insights-expansion`
**Date**: 2026-05-26
**Phase**: Verify (SDD Phase 8)
**Reviewer**: SDD Verify Executor
**PRD Ref**: PRD.md §4.8
**Mode**: Strict TDD active (`openspec/config.yaml`)

---

## Status: ⚠️ PASS with Warnings

### Executive Summary

The SDD artifacts are well-structured and consistent. The spec, design, and tasks cover all three mandated capabilities (churn prediction, A/B comparatives, recovery email generation) with detailed acceptance criteria, architecture, and implementation plans. The design correctly follows existing project patterns (singleton services, Zod schemas, rate limiters, JWT auth).

**5 issues found** — 2 conflicts, 1 missing, 2 warnings. None are blockers for implementation, but should be resolved before or during apply.

---

## Verification Checklist Results

### 1. Spec Coverage — All 3 Capabilities 🟢

| Capability | Spec Coverage | Scenarios |
|---|---|---|
| `insights.predict` (Churn Prediction) | ✅ Full | Happy path, insufficient credits, not owner, rate limit |
| `insights.compare` (A/B Comparatives) | ✅ Full | Happy path, SQL injection attempt, rate limit |
| `insights.recover` (Recovery Email) | ✅ Full | Happy path, unsafe HTML sanitization, not owner, rate limit |

Additional spec sections:
- ✅ Credit charging (deduction accuracy)  
- ✅ Rate limiting (limiter registration)
- ✅ Database schema (table DDL with indexes)
- ✅ Orchestrator registration
- ✅ No regression in existing capabilities
- ✅ Input validation (Zod rejection before business logic)
- ✅ Observability (logging requirements)
- ✅ Security (auth, authorization, SQL injection, XSS, prompt injection, error handling)

### 2. Design Decisions Consistent with Existing Patterns 🟢

| Pattern | Existing Code | Design Match |
|---------|--------------|-------------|
| Singleton service object | `insightsService = { ... }` in `agents.service.ts` (line 927) | ✅ Extends `insightsService` directly |
| Route structure | `router.post(...)` with `jwtAuthMiddleware`, limiter, `validate()`, handler | ✅ Identical structure in §7.1 |
| Product ownership check | `verifyProductOwnership(pool, id, userId)` in `routeHelpers.util.ts` | ✅ Used in all routes |
| User ID extraction | `uid(req)` helper | ✅ Used consistently |
| Zod schemas | `z.object({...})` with `.uuid()`, `.min()`, `.max()`, `.optional()` | ✅ Identical pattern in §8 |
| Rate limiters | `rateLimit({ windowMs, max, message, standardHeaders, ... })` | ✅ Identical pattern in §9 |
| Orchestrator registration | `{ id, name, capability, parameters, options, handler }` in `index.ts` | ✅ Identical pattern in §10 |
| Credit usage | `aiCreditService.useCredits(userId, amount, description)` | ✅ |
| Credit check | `aiCreditService.getBalance(userId)` → check `.balance` | ✅ |
| SQL validation | `validateGeneratedSQL(sql)` + safety limits | ✅ Reuses exact pipeline |
| Error handling | `AppError` with status codes | ✅ |
| Logging | `logger.info/warn/error` with context objects | ✅ |

### 3. Review Workload Budget 🟢

| Estimate | Value | Status |
|----------|-------|--------|
| Total changed lines | ~1100–1300 | ⚠️ Exceeds 400-line budget |
| Budget risk | High | ✅ Recognized in tasks.md |
| Chained PRs recommended | Yes | ✅ 6 PRs recommended |
| Chain strategy | stacked-to-main | ✅ Documented |
| Individual PRs under 400 lines | All ≤300 lines | ✅ Protected |

PR breakdown from tasks.md:

| PR | Task | Est. Lines | Within 400? |
|----|------|-----------|-------------|
| 1 | Task 0 (DB + Types) | ~80 | ✅ |
| 2 | Task 1 (Schemas + Limiters) | ~120 | ✅ |
| 3 | Task 2 (predictChurn service) | ~200 | ✅ |
| 4 | Task 3 (recover + compare services) | ~150 | ✅ |
| 5 | Task 4 (Orchestrator + Routes) | ~180 | ✅ |
| 6 | Task 5 (Tests + Docs) | ~300 | ✅ |

**Verdict**: The review workload protection is thorough and well-justified.

### 4. Conflicts with Existing Codebase 🟡

| # | Issue | Severity | Details |
|---|-------|----------|---------|
| 1 | **DB init script: new file vs append** | Conflict | **design.md §2.1** says create `14-ai-insights-expansion.sql` (new script). **proposal.md** and **tasks.md** say append sections 7.5–7.6 to existing `05-ai-tables.sql`. The proposal/tasks are internally consistent; the design diverges. Recommend: reconcile to single approach. Appending to `05-ai-tables.sql` keeps related AI tables together. |
| 2 | **Test file paths: design vs actual** | Conflict | **design.md §12** lists `backend/src/__tests__/services/agents.service.test.ts`. The actual file is at `backend/src/__tests__/services/ai/agents.service.test.ts`. **tasks.md** correctly uses the actual path. Design should be updated to match. |
| 3 | **`getOperationCost` type constraint** | Missing | The existing `getOperationCost(operation: 'search' | 'chat' | 'generate_insight')` doesn't accept new operation types. The design and tasks hardcode costs (5/3/3) instead of using this method, which is acceptable. However, the method should be extended or the design should document why it's intentionally bypassed. |

### 5. Credits / Reliability / Review Workload — Soundness 🟢

| Aspect | Assessment |
|--------|-----------|
| Credit costs | 5 (predict), 3 (compare), 3 (recover) — proportional to LLM cost per operation |
| Rate limiters | 5/min (churn, expensive multi-query), 10/min (compare, recover) — appropriate |
| Error resilience | Partial results on single-entity failure for compare; partial results on LLM failure for churn |
| Idempotency | `useCredits` with `referenceId` provides idempotent credit deduction |
| Rollback plan | Detailed in all three phases (proposal, design, tasks) |

---

## Detailed Findings

### Finding 1: DB Init Script Location Conflict

**Severity**: ⚠️ WARNING  
**Phase**: Design vs Proposal/Tasks  
**Description**:  
- **design.md §2.1**: "Add to `backend/db/init/14-ai-insights-expansion.sql` (new init script)"  
- **proposal.md** (Affected Areas): `backend/db/init/05-ai-tables.sql` — **Modified** — "Agregar `churn_predictions`, `recovery_emails` (secciones 7.5, 7.6)"  
- **tasks.md Task 0**: "Append to `backend/db/init/05-ai-tables.sql` after section 7.4"  

**Recommendation**: Resolve before apply. If appending to `05-ai-tables.sql`, update design.md §2.1 to match. If creating a new file, update proposal and tasks. Appending to `05-ai-tables.sql` keeps Phase 7 tables together and is simpler.

---

### Finding 2: Test File Path Mismatch

**Severity**: ⚠️ WARNING  
**Phase**: Design vs Codebase  
**Description**:  
- **design.md §12**: `backend/src/__tests__/services/agents.service.test.ts`  
- **Actual file**: `backend/src/__tests__/services/ai/agents.service.test.ts`  
- **tasks.md Task 5**: `backend/src/__tests__/services/ai/agents.service.test.ts` ✅  

The `ai/` subdirectory exists and is the correct location. The design's path is missing the `ai/` segment.

**Recommendation**: Update design.md §12 to use correct path.

---

### Finding 3: `getOperationCost` Type Not Extended

**Severity**: ℹ️ INFO  
**Phase**: Design + Tasks  
**Description**:  
The existing `aiCreditService.getOperationCost()` signature is:
```typescript
getOperationCost(operation: 'search' | 'chat' | 'generate_insight'): number
```
The new operations (`insights.predict`, `insights.compare`, `insights.recover`) are not in this union. The design and tasks hardcode costs directly in the service methods instead of using `getOperationCost`. This works, but:
1. The credit costs are not centralized in a single lookup
2. `getOperationCost` will need to be extended if other code paths need to query costs

**Recommendation**: Either document why hardcoding is intentional (the tasks already do this implicitly), or add the new operations to `getOperationCost`'s union type and use it.

---

### Finding 4: Type Inconsistency — `riskFactors` Format

**Severity**: ℹ️ INFO  
**Phase**: Design vs Tasks  
**Description**:  
- **design.md §3.1** return type: `riskFactors: string[]` (e.g., `["Inactivo 45 días", "Progreso < 20%"]`)  
- **tasks.md Task 0** interface: `riskFactors: Array<{ factor: string; weight: number }>`  
- **DB column**: `risk_factors JSONB NOT NULL DEFAULT '[]'` (supports either format)  

The structured object format (tasks) is richer but the simpler string array (design) matches the heuristic descriptions better. The DB stores JSONB so either works.

**Recommendation**: Align to a single format. The structured format (`{ factor, weight }`) is more useful for frontend rendering and filtering.

---

### Finding 5: HTML Sanitization — Regex Approach Risk

**Severity**: ⚠️ WARNING  
**Phase**: Design  
**Description**:  
**design.md §5.2** proposes a regex-based sanitization for LLM-generated HTML:
```typescript
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    // ...
}
```

Regex-based HTML sanitization is notoriously brittle and can miss edge cases (nested encodings, alternative event handler attributes, SVG `<animate>` based XSS, etc.). The design acknowledges DOMPurify is browser-only but doesn't consider Node.js alternatives such as:
- [`sanitize-html`](https://www.npmjs.com/package/sanitize-html) (6.1k stars, 20M weekly downloads)
- [`xss`](https://www.npmjs.com/package/xss) (5k stars, 5M weekly downloads)
- [`dompurify`](https://www.npmjs.com/package/dompurify) (Node.js compatible via `jsdom`)

**Recommendation**: Use a battle-tested server-side HTML sanitizer library instead of hand-rolled regex. Add the dependency in tasks.md Task 3.

---

## Strict TDD Compliance Review

**Config**: `openspec/config.yaml` has `strict_tdd: true` and `test_command: "pnpm run vitest"`.

| Requirement | Status | Notes |
|-------------|--------|-------|
| Test command specified | ✅ | `pnpm run vitest` in config and tasks.md |
| Test files identified | ✅ | `agents.service.test.ts`, `ai.routes.test.ts`, `ai-boot.test.ts` |
| RED→GREEN→TRIANGULATE pattern | ✅ | Tasks.md Task 5 specifies test groups with happy path + edge cases |
| Unit tests for new methods | ✅ | `predictChurn`, `generateRecoveryEmail`, `compareEntities` |
| Integration tests for new endpoints | ✅ | All 3 endpoints with auth, validation, rate limit scenarios |
| Orchestrator capability tests | ✅ | `skillsRegistry.listCapabilities()` verification |
| Pre-apply TDD Cycle Evidence table | ❌ N/A | Not applicable pre-apply; tasks phase documents test requirements |

**Note**: The tasks.md correctly prepares for TDD by specifying test-first structure. The actual `TDD Cycle Evidence` table will be tracked in `apply-progress.md` during apply.

---

## Review Workload / PR Boundary Findings

| Field | Expected | Actual |
|-------|----------|--------|
| Budget | 400 lines max per PR | ✅ All 6 PRs ≤ 300 lines |
| Chain strategy | stacked-to-main | ✅ Documented |
| Scope creep risk | Low | ✅ 3 capabilities clearly bounded; "Out of Scope" section in proposal |
| Auto-chain forecast | 6 PRs | ✅ Realistic and detailed |

**Scope boundary check**: The assigned slice (SDD documents) does not include implementation, so no scope creep is present.

---

## Blocker Assessment

| # | Description | Blocker? |
|---|-------------|----------|
| 1 | DB init script conflict (new file vs append) | ⚠️ **Resolve before apply** — inconsistent instructions will cause confusion |
| 2 | Test file path mismatch in design.md | ❌ Not a blocker |
| 3 | `getOperationCost` type constraint | ❌ Not a blocker |
| 4 | `riskFactors` type inconsistency | ❌ Not a blocker |
| 5 | Regex HTML sanitization risk | ❌ Not a blocker but should be addressed |

**Blockers**: **1**. Resolve the DB init script approach before apply to avoid wasted work.

---

## Additional Observations

### 8.1 `insights_history` Column Awareness

The existing `insights_history` table DDL (in `05-ai-tables.sql`) has columns:
```
id, user_id, query, sql_generated, results, created_at
```

However, the existing code in `agents.service.ts` saves `is_successful` and `error_message` columns that are **not in the DDL**. The design says to persist compare results to `insights_history`. Verify these columns exist in the actual running database before implementing Task 3's compareEntities persistence.

### 8.2 Prompt Injection Defense Consistency

The design uses `buildPrompt()` across all new methods (consistent with existing patterns). However, the specific prompts in §4.3 and §5.1 don't explicitly mention `[USER_INPUT_START]/[USER_INPUT_END]` delimiters in their templates. The spec requires this. Ensure the actual implementation wraps user-provided data in these delimiters.

### 8.3 Credits Deduction Order

The spec says credits are deducted **after** successful LLM call and persistence. The tasks describe deduction at the end. The existing `chatStream` method deducts credits at the **beginning**. Both approaches have trade-offs (early deduction prevents free LLM calls; late deduction ensures no charge on failure). The tasks should document which approach is taken.

---

## Conclusion

**Overall**: PASS with warnings. The SDD documents are well-structured, technically sound, and consistent with project patterns. Five issues were identified, none of which are implementation blockers except the DB init script location conflict.

### Required Actions Before Apply

1. ❓ Resolve DB init script location: new file (`14-ai-insights-expansion.sql`) vs append to `05-ai-tables.sql`

### Recommended Actions During Apply

1. Update design.md test path to `services/ai/agents.service.test.ts`
2. Align `riskFactors` type format between design and tasks
3. Use `sanitize-html` npm package instead of regex for HTML sanitization
4. Verify `insights_history` actual columns before implementing compare persistence

### Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `docs/project/ai-features/sdd/ai-insights-expansion/proposal.md` | ✅ Pass |
| Spec | `docs/project/ai-features/sdd/ai-insights-expansion/spec.md` | ✅ Pass |
| Design | `docs/project/ai-features/sdd/ai-insights-expansion/design.md` | ⚠️ Pass with warnings |
| Tasks | `docs/project/ai-features/sdd/ai-insights-expansion/tasks.md` | ✅ Pass |
| This report | `docs/project/ai-features/sdd/ai-insights-expansion/verify-report.md` | ✅ Created |

---

## Phase Envelope

```json
{
  "phase": "verify",
  "change": "ai-insights-expansion",
  "status": "pass_with_warnings",
  "executive_summary": "All three PRD-mandated capabilities (churn prediction, A/B comparatives, recovery email) are comprehensively specified with detailed acceptance criteria and consistent design. The chained PR strategy protects the 400-line review budget. 5 non-blocking issues found: DB init script location conflict, test path mismatch in design, getOperationCost type constraint, riskFactors type inconsistency, and regex-based HTML sanitization risk. Recommend resolving the DB init script conflict before apply.",
  "artifacts": {
    "proposal": "verified",
    "spec": "verified",
    "design": "verified_with_warnings",
    "tasks": "verified"
  },
  "next_recommended": "Resolve DB init script location, then proceed to sdd-apply phase",
  "risks": [
    "DB init script location conflict (design vs tasks) must be resolved before apply",
    "Regex-based HTML sanitization is brittle; recommend sanitize-html npm package",
    "getOperationCost type union doesn't include new operations; hardcoded costs bypass centralized lookup",
    "insights_history table DDL may be inconsistent with columns used by existing code"
  ],
  "skill_resolution": "paths-injected"
}
```
