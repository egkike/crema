# Verify Report 2 — AI Insights Expansion (Blind Judge)

**Reviewer**: Judge 2 (Parallel Blind Review)  
**Date**: 2026-05-26  
**Change**: `ai-insights-expansion`  

---

## Executive Summary

| Dimension | Verdict | Details |
|-----------|---------|---------|
| **Overall** | **FAIL** | 3 CRITICAL, 6 WARNING, 5 SUGGESTION issues found |
| **Spec Coverage** | PASS | All 3 capabilities covered (churn, compare, recover) |
| **Design Consistency** | FAIL | Schema conflict between tasks & design, DB script location conflict |
| **Workload Budget** | WARNING | ~1225 lines estimated, exceeds 400-line budget; chained PRs recommended but split has issues |
| **Security** | SUGGESTION | HTML sanitization regex is insufficient for production |
| **Test Coverage** | PASS | Adequate test cases outlined, but file paths inconsistent |
| **Strict TDD Check** | WARNING | `strict_tdd: true` in config; tasks reference TDD but some assertion quality concerns |

---

## 1. Spec Coverage (PASS)

All three capabilities from PRD §4.8 are covered:

| Capability | Endpoint | Credits | Rate Limit | Coverage in Spec |
|-----------|----------|---------|------------|------------------|
| `insights.predict` | `POST /api/ai/insights/predict/churn` | 5 | 5 req/min | §Requirement: Churn Prediction |
| `insights.compare` | `POST /api/ai/insights/compare` | 3 | 10 req/min | §Requirement: A/B Comparatives |
| `insights.recover` | `POST /api/ai/insights/recover/email` | 3 | 10 req/min | §Requirement: Recovery Email Generation |

Scenarios adequately cover: success paths, insufficient credits, not-owner, rate limiting, SQL injection, XSS, input validation, and observability. **No missing requirements detected.**

---

## 2. Task Completion Status

All 6 tasks are defined with clear scope, files, actions, and verification checklists. Dependency graph is correct and logical.

---

## 3. CRITICAL Issues

### CRITICAL-1: DB Script Location Conflict — Design vs Tasks

| Source | Location |
|--------|----------|
| **Design** (§2.1) | Creates **new file**: `backend/db/init/14-ai-insights-expansion.sql` |
| **Tasks** (Task 0) | **Appends to**: `backend/db/init/05-ai-tables.sql` after section 7.4 |

These are contradictory. The Design rationale (§15, Decision table) cites _"New init script vs append to existing: New `14-*.sql`; Idempotent `IF NOT EXISTS`; cleaner separation; follows existing naming convention"_, while Tasks say to modify `05-ai-tables.sql`.

**Impact**: During implementation, the developer will not know which approach to follow. If they follow Tasks, they miss the cleaner separation. If they follow Design, they need to update the file-change summary and add a file creation action to Task 0.

**Recommendation**: Resolve the conflict before implementation. Prefer Design's approach (new `14-ai-insights-expansion.sql`) as it follows the init script naming convention and avoids touching a stable Phase 7 file.

---

### CRITICAL-2: `compareSchema` Shape Mismatch — Tasks vs Design/Proposal

| Document | `entityA` / `entityB` type |
|----------|---------------------------|
| **Proposal** (Flujo: A/B Comparatives) | Object with `label` and entity-specific params |
| **Design** (§8.1, §3.3) | `z.object({ label: string, params: z.record(z.unknown()) })` |
| **Tasks** (Task 1 schemas) | `z.string().min(1)` — plain strings |

**Root cause**: The Tasks task-1 defines `compareSchema` as receiving `entityA: z.string()` and `entityB: z.string()`, but the Design's service method `compareEntities` (§3.3) accepts:

```typescript
entityType: 'period' | 'product',
entityA: CompareEntity,  // { label: string; params: Record<string, unknown> }
entityB: CompareEntity,
```

A Zod schema with `entityA: z.string()` will never validate against the `CompareEntity` object that the service expects. If Tasks is followed literally, the route handler receives `entityA = "some string"` and passes it to the service which expects `{ label, params }`. This is a **runtime type error**.

**Impact**: The route will break at runtime as soon as a request hits the compare endpoint, OR the implementation will have to deviate from the tasks spec. Either way, this is a significant defect in the SDD.

**Recommendation**: Fix `compareSchema` in Tasks to match Design's structured object:
```typescript
export const compareSchema = z.object({
  entityType: z.enum(['period', 'product']),
  entityA: z.object({ label: z.string(), params: z.record(z.unknown()) }),
  entityB: z.object({ label: z.string(), params: z.record(z.unknown()) }),
  metrics: z.array(z.enum(['revenue', 'sales', 'conversion', 'engagement', 'reviews'])).min(1).max(5),
});
```

---

### CRITICAL-3: `insights_history` Missing Columns `is_successful` and `error_message`

The existing code in `agents.service.ts` (lines 1193, 1419) already inserts into nonexistent columns:

```typescript
await pool.query(
  `INSERT INTO "...".insights_history (user_id, query, sql_generated, results, is_successful, error_message) VALUES ($1, $2, $3, $4, $5, $6)`,
  [userId, naturalLanguageQuery, null, JSON.stringify([]), false, err.message]
);
```

But the SQL schema in `05-ai-tables.sql` only defines:

```sql
CREATE TABLE IF NOT EXISTS insights_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    sql_generated TEXT,
    results JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**No `is_successful` or `error_message` columns exist.** This is a **pre-existing bug** in the codebase (not introduced by this SDD), but it directly affects this change because:

1. The Design (§6.2) says compare results will be persisted to `insights_history`.
2. If compare follows the existing pattern of writing to `insights_history`, the INSERT will **fail at runtime** with a column-not-found PostgreSQL error.
3. The SDD does not mention adding these missing columns to the schema.

**Recommendation**: Add a DB migration step (either in the new `14-*.sql` or as a migration script) to ALTER `insights_history` and add `is_successful BOOLEAN DEFAULT TRUE` and `error_message TEXT`. Alternatively, use the existing columns only and drop `is_successful`/`error_message` from the INSERT (but that loses error-tracking).

---

## 4. WARNING Issues

### WARNING-1: Churn Heuristic Factor 4 Measures Wrong Thing

Design §4.1 Factor 4: **"Acceso frecuente sin progreso"** (Frequent access without progress) uses:

```
Condition: total_orders >= 3 AND days_since_last_activity <= 7 AND progress < 10%
```

`total_orders` is a **purchase count** (how many times the student bought the product), not a **login/access count**. A student who has purchased a course 3+ times is already an unusual edge case for a digital product (you typically buy once). This factor is essentially unreachable for most students, or worse — it measures the wrong signal entirely.

**Recommendation**: Replace `total_orders` with an actual access/login metric:
- Query `agent_conversations` or add a login/access log table
- Or count distinct visit timestamps from order/activity records
- Or drop this factor in v1 if access-tracking data isn't available (it adds complexity with near-zero detection rate)

---

### WARNING-2: Churn Data Queries Don't Filter by Student Status

Design §3.1 queries `product_questions` without joining on `orders` to identify **actual students** (buyers):

```sql
SELECT pq.user_id, MAX(pq.created_at) as last_question_date, COUNT(pq.id) as total_questions
FROM product_questions pq
WHERE pq.product_id = $1
GROUP BY pq.user_id
```

This will pull **all** users associated with the product, including:
- The **creator** themselves (who may have posted sample Q&As)
- **Affiliates** who asked questions
- **Non-buyers** who accessed the product page

The churn prediction should only analyze **actual enrolled students** (buyers with confirmed orders). The heuristic scores will be inflated with false positives for non-student users.

**Recommendation**: Join on `orders` to filter only confirmed buyers:
```sql
SELECT pq.user_id, ...
FROM product_questions pq
JOIN orders o ON o.buyer_id = pq.user_id AND o.product_id = pq.product_id AND o.status = 'confirmed'
WHERE pq.product_id = $1
GROUP BY pq.user_id
```

---

### WARNING-3: HTML Sanitization Regex Is Insufficient for Production

Design §5.2 proposes a regex-based sanitizer:

```typescript
function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '')
    // ...
}
```

This regex approach misses multiple XSS vectors:

| Vector | Why It Bypasses |
|--------|-----------------|
| `<svg onload=alert(1)>` | Handled by `on\w+` but whitespace variations (`onload=alert(1)` without space) may bypass |
| `&#106;avascript:` | HTML-entity-encoded `javascript:` is not caught by the `javascript:` pattern |
| `<img src=x onerror=eval(atob("..."))>` | Event handler is caught, but `eval(atob(...))` in `src` data URIs isn't |
| `<details open ontoggle=alert(1)>` | `ontoggle` handled, but only if `on\w+` captures all event types |
| `<math><style><!--</style><a>--></a></math>` | MathML-based XSS bypasses script tag removal |
| `<a href="data:text/html;base64,...">click</a>` | `data:` URIs not sanitized |
| `<form action="javascript:alert(1)">` | Only `href` and `src` are sanitized; `form action` not covered |

**Recommendation**: Use a battle-tested server-side HTML sanitizer library:
- `sanitize-html` (npm: `sanitize-html`) — allowlist-based, configurable
- `js-xss` (npm: `xss`) — filter-based, covers more edge cases
- Add to `package.json` dependencies and configure it properly

The comment _"DOMPurify is browser-only"_ is correct, but that doesn't justify shipping a regex-based sanitizer for production. This is a security-sensitive feature (LLM-generated HTML that creators will embed in emails/newsletters).

---

### WARNING-4: `threshold` Default Inconsistency

| Source | Behavior |
|--------|----------|
| **Proposal** (Churn Flow) | `threshold` is optional, no default mentioned |
| **Design** (§3.1) | `threshold` is optional, no default |
| **Tasks** (Task 1) | `threshold: z.number().int().min(0).max(100).default(50).optional()` |

When the client doesn't send `threshold`, if `.default(50)` is set, Zod will assign `50` as the value, and the service will filter at `score >= 50`. If `.default()` is NOT set and the service defaults to `(threshold ?? 50)`, same result. But the inconsistency across documents introduces confusion.

**Impact**: Low — both paths lead to the same default behavior. But the variance indicates a coordination gap between documents.

**Recommendation**: Align all three documents: either always default `threshold` to `50` and remove the `.optional()` (since `.default()` handles absence), or keep it optional without default and use `?? 50` in the service.

---

### WARNING-5: `generateRecoveryEmail` Return Type Missing `recoveryEmailId`

Design §3.2 return type includes:
```typescript
interface RecoveryEmailResult {
  email: RecoveryEmail;
  studentName: string;
  productName: string;
  creditsUsed: number;
  recoveryEmailId: string;  // ← present in design
}
```

But Tasks (Task 3 actions) omits `recoveryEmailId` from the return:
```typescript
Return { email: { subject, bodyHtml, previewText }, studentName, productName }
```

The ID is important for the frontend to reference the generated email for future sending or editing. **Missing it reduces the API's utility.**

**Recommendation**: Include `recoveryEmailId` in the Tasks return spec, matching the Design.

---

### WARNING-6: Test File Path Discrepancies

| File | Design (§11) | Tasks (Task 5) | Actual Existing |
|------|-------------|----------------|-----------------|
| Unit tests | `backend/src/__tests__/services/agents.service.test.ts` | `backend/src/__tests__/services/ai/agents.service.test.ts` | `backend/src/__tests__/services/ai/agents.service.test.ts` |
| Integration tests | `backend/src/__tests__/ai.routes.test.ts` | `backend/src/__tests__/routes/ai.routes.test.ts` | `backend/src/__tests__/ai.routes.test.ts` |

- Design's unit test path is **wrong** (no `ai/` subdirectory)
- Tasks's integration test path is **wrong** (tests are at root `__tests__/ai.routes.test.ts`, not `__tests__/routes/ai.routes.test.ts`)
- Both should reference the actually existing file paths

**Impact**: Template-driven code will fail `pnpm tsc --noEmit` because the import paths will be incorrect.

**Recommendation**: Fix all path references to match actual existing files:
- Unit tests: `backend/src/__tests__/services/ai/agents.service.test.ts`
- Integration tests: `backend/src/__tests__/ai.routes.test.ts`
- Orchestrator tests: `backend/src/__tests__/services/ai/ai-boot.test.ts` (existing file for capability registration tests)

---

### WARNING-7: `insights_history` Persistence for Compare Is a Schema Mismatch

The Design (§6.2) says compare results go to `insights_history`. But `insights_history` has columns:
```
id, user_id, query (TEXT), sql_generated (TEXT), results (JSONB), created_at
```

For a comparative analysis:
- `query` expects a natural language string (there isn't one — the request is structured)
- `sql_generated` expects a single SQL string (there are 2 SQLs, one per entity)
- `results` expects JSONB (works, but contains comparative analysis, not raw SQL results)

**Persistence to `insights_history` is a structural mismatch.** The compare feature should either:
1. Create its own table (`ab_comparatives`), or
2. Store as two separate `insights_history` rows (one per entity SQL), and store the narrative separately

**Recommendation**: Add a dedicated `ab_comparatives` table or store two rows in `insights_history` (one per entity) plus the narrative in a separate field. The current approach of "just write to insights_history" hasn't been thought through.

---

## 5. SUGGESTION Issues

### SUGGESTION-1: `riskFactors` Type Mismatch

| Source | Type |
|--------|------|
| **Design** (§3.1 return type) | `riskFactors: string[]` |
| **Tasks** (Task 0 interfaces) | `riskFactors: Array<{ factor: string; weight: number }>` |

The DB column `risk_factors JSONB` can store either, but the return types should be consistent across specs. The structured format `{ factor, weight }` is more useful for the frontend (can display a breakdown).

**Recommendation**: Use the structured `{ factor: string; weight: number }[]` format everywhere, since it's more informative and aligns with the heuristics table in Design §4.1.

---

### SUGGESTION-2: `tone` Has Both `.default('empathic')` and `.optional()` — Redundant

```typescript
tone: z.enum(['empathic', 'direct', 'motivational']).default('empathic').optional()
```

Zod's `.default()` already makes the field optional (if missing, the default value is used). Adding `.optional()` is redundant but not harmful.

**Recommendation**: Remove `.optional()` when `.default()` is present, for clarity.

---

### SUGGESTION-3: Churn Prediction Has No Confidence Level in Return Type

The Proposal's risk table mentions:
> "Heurísticas marcan 'baja confianza' si < 30 días de datos. Transparencia: el score incluye confidence level"

But neither the Design return type nor the Tasks spec includes a `confidence` field in the `ChurnPrediction` interface. The heuristic confidence level is mentioned in prompt text but never surfaced in the API response.

**Recommendation**: Add `confidence: 'high' | 'medium' | 'low'` to the `ChurnPrediction` interface, calculated from data availability.

---

### SUGGESTION-4: Missing `ab_comparatives` Table

The Design writes compare results to `insights_history`, but as noted in WARNING-7, this is a structural mismatch. A dedicated table would be cleaner:

```sql
CREATE TABLE IF NOT EXISTS ab_comparatives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('period', 'product')),
    entity_a_label VARCHAR(100),
    entity_b_label VARCHAR(100),
    metrics TEXT[] NOT NULL,
    entity_a_data JSONB,
    entity_b_data JSONB,
    narrative TEXT,
    deltas JSONB,
    recommendation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

This would make queries like "show me my last 5 comparisons" efficient, similar to how `churn_predictions` and `recovery_emails` have their own tables.

---

### SUGGESTION-5: Review Workload Budget Analysis

The estimated total is **~1225 lines** across 9 files. The 400-line budget is exceeded by 3x.

The Chained PR split in Tasks suggests:
| PR | Est. Lines | Within 400? |
|----|-----------|-------------|
| 1 (DB + Types) | ~80 | ✅ |
| 2 (Schemas + Limiters) | ~120 | ✅ |
| 3 (predictChurn) | ~200 | ✅ |
| 4 (recoverEmail + compare) | ~150 | ✅ |
| 5 (Orchestrator + Routes) | ~180 | ✅ |
| 6 (Tests + Docs) | ~300 | ✅ |

Each individual PR fits the budget. **However**, Tasks says the tests are **Task 5** with ~300 lines, but the longest single method implementation is `predictChurn` at ~200 lines. The actual code for `predictChurn` in Design §3.1 involves: ownership check, credit check, 3 SQL queries, heuristic calculation, LLM call per student, batch persistence, credit deduction. This is likely **underestimated** — realistic implementation will be closer to 250-300 lines.

**Recommendation**: Split predictChurn from the other two methods to keep PRs under 400 lines:
- PR 3: predictChurn (~250-300 lines, still within budget)
- PR 4: generateRecoveryEmail + compareEntities (~200 lines)
- PR 5: Orchestrator + Routes (~180 lines)
- PR 6: Tests + Docs (~300-350 lines)

---

## 6. Security Findings

| Issue | Severity | Description |
|-------|----------|-------------|
| HTML sanitization regex | **WARNING** | See WARNING-3 — regex is insufficient; needs a proper library |
| SQL injection (compare) | **PASS** | Reuses `validateGeneratedSQL()` — proven protection |
| JWT auth on all routes | **PASS** | `jwtAuthMiddleware` on all three new endpoints |
| Authorization checks | **PASS** | `verifyProductOwnership()` for churn and recovery |
| Rate limiting | **PASS** | Dedicated limiters per endpoint |
| Prompt injection defense | **PASS** | `buildPrompt()` with `[USER_INPUT_START]/[USER_INPUT_END]` delimiters |
| Error message leaking | **PASS** | Generic messages, no stack traces in production |

Overall security posture is **strong**, with the single exception of the HTML sanitization approach which needs upgrading from regex to a proper library.

---

## 7. Strict TDD Compliance

`strict_tdd: true` is active in `openspec/config.yaml`.

### TDD Cycle Evidence

The tasks reference TDD patterns (RED → GREEN → TRIANGULATE) but the evidence is incomplete:

| Check | Status | Finding |
|-------|--------|---------|
| Task 5 mentions RED → GREEN → TRIANGULATE | ✅ | Explicitly listed in actions |
| Test files referenced correctly | ❌ | File paths are inconsistent across Design/Tasks |
| Assertion quality: no tautologies | ✅ | Test cases describe meaningful assertions |
| Assertion quality: ghost loops | N/A | Not applicable (no loop-based tests) |
| Assertion quality: type-only assertions | ✅ | Not observed |
| Assertion quality: smoke-only tests | ⚠️ | Integration tests for "200 with valid input" are thin — should validate response shape |
| Assertion quality: CSS assertions | N/A | Backend only |

**Finding**: The integration test plans are too generic. For example:
> "Returns 200 with valid request (mock service)" — this doesn't verify the response body structure
> "Respects rate limiter (429 after 10 rapid requests)" — good, but should verify `Retry-After` header

**Recommendation**: Add explicit response-shape assertions to integration test scenarios (e.g., "response body contains `data.predictions` array with at least 1 item, each having `userId`, `churnScore`, `riskFactors`").

---

## 8. Review Workload / PR Boundary Findings

| Field | Reported | Actual Assessment |
|-------|----------|-------------------|
| Estimated changed lines | ~1100–1300 | ~1225 (Design §11) |
| 400-line budget risk | High | ✅ Correctly identified |
| Chained PRs recommended | Yes | ✅ Correct, 6 PRs proposed |
| Chain strategy | stacked-to-main | ✅ Correct for parallel merges |
| Scope creep risk | Low | ✅ All changes are within assigned scope |

The tasks correctly identify the need for chained PRs and the high budget risk. No scope creep detected — all changes are within the three defined capabilities.

---

## 9. Exact Blockers

| # | Severity | Blocker | Resolution Needed |
|---|----------|---------|-------------------|
| 1 | **CRITICAL** | DB script location: Design says new `14-*.sql`, Tasks says append to `05-ai-tables.sql` | Pick one before implementation |
| 2 | **CRITICAL** | `compareSchema` shape mismatch: Tasks uses strings, Design uses objects | Fix Tasks schema to match Design |
| 3 | **CRITICAL** | `insights_history` missing `is_successful`/`error_message` columns — both existing code AND new compare persistence will fail | Add ALTER TABLE migration or fix existing code |
| 4 | **WARNING** | Churn factor 4 measures orders, not accesses | Fix heuristic to use actual access metric or drop it |
| 5 | **WARNING** | HTML sanitization regex insufficient | Replace with `sanitize-html` or `js-xss` library |
| 6 | **WARNING** | Churn data queries don't filter by student status (include non-buyers) | Add JOIN on orders to filter confirmed buyers |
| 7 | **WARNING** | Test file paths inconsistent across documents | Fix all paths to match actual files |
| 8 | **WARNING** | Compare persistence to `insights_history` is structural mismatch | Add dedicated `ab_comparatives` table or restructure |

---

## 10. Decision Quality Assessment

The SDD's trade-off decisions are sound:
- **Extend `insightsService` vs new services**: Correct for v1. 700 lines is manageable.
- **Heuristics vs ML**: Correct for v1. Data volume doesn't support ML yet.
- **Generate vs send email**: Correct. Creator should review before sending.
- **Dedicated tables vs JSON**: Correct. Query patterns justify typed columns.

The weak spots are in the **schema definitions** (compareSchema mismatch) and **DB script location** (contradictory instructions), not in the architectural decisions.

---

## 11. Final Verdict

| Category | Verdict |
|----------|---------|
| **Pass/Fail** | **FAIL** — 3 CRITICAL issues must be resolved before apply |
| **Spec Coverage** | PASS |
| **Design Consistency** | FAIL |
| **Security** | SUGGESTION |
| **Test Coverage** | PASS (with caveats) |
| **Workload Budget** | WARNING |
| **Strict TDD** | WARNING |

**Recommended next action**: Resolve the 3 CRITICAL blockers (#1 DB script location, #2 compareSchema shape, #3 insights_history columns), then re-review before proceeding to `sdd-apply`.
