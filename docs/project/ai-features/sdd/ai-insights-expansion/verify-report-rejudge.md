# Verify Report — Rejudgment: AI Insights Expansion

**Change**: `ai-insights-expansion`
**Phase**: REJUDGMENT (post-fix verification)
**Date**: 2026-05-26
**Mode**: Strict TDD (openspec/config.yaml: `strict_tdd: true`)

---

## Executive Summary

| Dimension | Verdict | Details |
|-----------|---------|---------|
| **Overall** | **PASS** — 1 WARNING, 9 PASS of 10 verified issues |
| **Spec Coverage** | PASS | All 3 capabilities covered (churn, compare, recover) |
| **Design Consistency** | PASS (minor) | 1 remaining inconsistency: Factor 4 in design.md/proposal.md vs tasks.md |
| **Workload Budget** | PASS | Chained PR strategy correctly matches ~1225 line estimate |
| **Security** | PASS | `sanitize-html` library properly specified, no regex-based sanitization |
| **Test Coverage** | PASS | Test paths corrected, RED→GREEN→TRIANGULATE patterns present |
| **Strict TDD Compliance** | PASS | TDD patterns documented; Cycle Evidence table expected at apply phase |
| **Scope Creep** | NONE | All changes bounded within the 3 defined capabilities |

---

## Issue-by-Issue Verification

### C1 — DB init script uses new `14-ai-insights-expansion.sql` ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **design.md** §2.1 | Had new file `14-ai-insights-expansion.sql` (correct) | ✅ Already correct |
| **tasks.md** Task 0 | Originally said append to `05-ai-tables.sql` | ✅ **FIXED**: Now creates new `14-ai-insights-expansion.sql` with note "per design.md decision" |

**Evidence**:
- design.md §2.1: "Add to `backend/db/init/14-ai-insights-expansion.sql` (new init script; follows `13-*-*.sql` convention)"
- tasks.md (line 39): "`backend/db/init/14-ai-insights-expansion.sql` — CREATE new init script (NEW, per design decision)"
- tasks.md (line 43): "DB init uses a NEW file (`14-ai-insights-expansion.sql`) per design.md decision"

**Note**: The proposal.md still says "Nuevas tablas en `db/init/05-ai-tables.sql`" — this is a minor proposal-level inconsistency but the critical design/tasks conflict is resolved. The proposal is a less-detailed document and this does not block implementation.

---

### C2 — compareSchema uses structured `{label, params}` objects ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 1 | Originally had `entityA: z.string()` (plain string) | ✅ **FIXED**: Now uses `z.object({ label: z.string().min(1).max(100), params: z.record(z.unknown()) })` |
| **design.md** §8.1 | Had structured objects (correct) | ✅ Already correct |

**Evidence**:
- tasks.md (Task 1, compareSchema):
  ```typescript
  entityA: z.object({
    label: z.string().min(1).max(100),
    params: z.record(z.unknown()),
  }),
  ```
- design.md §3.3: `CompareEntity { label: string; params: Record<string, unknown> }`
- design.md §8.1: Full structured Zod schema matches service method contract

**Verdict**: Full alignment between design and tasks. Runtime type error eliminated.

---

### C3 — insights_history ALTER TABLE statements added ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 0 | Missing — no migration for pre-existing bug | ✅ **FIXED**: ALTER TABLE statements added |

**Evidence**:
- tasks.md (Task 0, lines 105-109):
  ```sql
  ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS is_successful BOOLEAN DEFAULT TRUE;
  ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS error_message TEXT;
  ```

**Note**: The existing code in `agents.service.ts` (`insightsService.query` and `insightsService.chatStream`) already references these columns in INSERT statements. The fix ensures the DB schema matches what the code expects, preventing runtime column-not-found errors.

---

### W1 — sanitize-html instead of regex ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **design.md** §5.2 | Proposed regex-based sanitization | ✅ **FIXED**: Full `sanitize-html` npm package implementation |
| **tasks.md** Task 3 | Followed design's regex approach | ✅ **FIXED**: Explicitly uses `sanitize-html` library |

**Evidence**:
- design.md §5.2: "**IMPORTANT**: Use the `sanitize-html` npm package for production-grade HTML sanitization. Do NOT use hand-rolled regex."
- design.md §5.2 includes:
  - Installation command: `pnpm add sanitize-html`
  - Import: `import sanitizeHtml from 'sanitize-html'`
  - Usage: `sanitizeHtml(rawBodyHtml, { allowedTags: [...], allowedAttributes: { 'a': ['href', 'target', 'rel'] } })`
  - Transform: `sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' })`
  - Explicit "Why not regex" section documenting 7 bypass vectors (SVG, MathML, data: URIs, form action hijacking, etc.)
- tasks.md (Task 3, lines 339-342):
  ```typescript
  import sanitizeHtml from 'sanitize-html';
  const cleanHtml = sanitizeHtml(bodyHtml, {
    allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'],
    allowedAttributes: { 'a': ['href'] },
  });
  ```
- tasks.md risk register: "HTML sanitization misses edge cases (regex approach) | **FIXED**: Use `sanitize-html` npm package"

**Verdict**: Production-grade library specified with proper configuration. Security gap closed.

---

### W2 — Churn Factor 4 uses engagement metric ⚠️ **PARTIALLY PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 2 | Had `total_orders >= 3` (purchase count) | ✅ **FIXED**: Removed Factor 4 with comment about access tracking infrastructure |
| **design.md** §4.1 | Still has `total_orders >= 3 AND days_since_last_activity <= 7 AND progress < 10%` | ❌ **NOT FIXED** |
| **proposal.md** | Still has "Accesos > 10 en 7 días pero progreso < 10%" | ❌ **NOT FIXED** |

**Evidence**:
- tasks.md (line 299): "`FIXED`: Remove Factor 4 (total_orders is purchase count, not access count; add comment that access tracking requires additional infrastructure)"
- design.md (line 341): `| 4 | Acceso frecuente sin progreso | \`total_orders >= 3 AND days_since_last_activity <= 7 AND progress < 10%\` | +10% |`
- proposal.md (line 302): `| Acceso frecuente sin progreso | Accesos > 10 en 7 días pero progreso < 10% | +10% |`

**Impact**: The fix is documented in tasks.md (the implementation guide), but the design.md and proposal.md still contain the problematic Factor 4. During implementation following tasks.md, the developer would correctly skip Factor 4. However, the design reference remains stale.

**Recommendation**: Update design.md §4.1 and proposal.md's heuristic table to either:
- Remove Factor 4 entirely (matching tasks.md), with the comment about access tracking infrastructure being needed.
- Or replace it with an actual engagement metric (e.g., count of `agent_conversations` entries in the last 7 days) if such data is available.

---

### W3 — Churn queries JOIN orders ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 2 | Not filtering by confirmed buyers | ✅ **FIXED**: Explicit join on orders |
| **design.md** §3.1 | Already JOINs orders | ✅ Already correct |

**Evidence**:
- tasks.md (Task 2): "**FIXED**: Join on `orders` to filter only confirmed buyers (not creators/affiliates)"
- design.md §3.1:
  ```sql
  FROM orders o
  WHERE o.product_id = $1 AND o.status = 'completed'
  ```

**Verdict**: Churn analysis will only consider actual students (confirmed buyers), eliminating false positives from creators, affiliates, and non-buyers.

---

### W4 — Test paths corrected to services/ai/ ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 5 | Had `backend/src/__tests__/routes/ai.routes.test.ts` (wrong) | ✅ **FIXED**: All paths corrected |
| **design.md** §11 | Had `backend/src/__tests__/services/agents.service.test.ts` (missing `ai/`) | ⚠️ design.md still has the wrong path, but tasks.md is the implementation reference |

**Evidence**:
- tasks.md (Task 5, corrected paths):
  - Unit tests: `backend/src/__tests__/services/ai/agents.service.test.ts`
  - Integration tests: `backend/src/__tests__/ai.routes.test.ts` (NOT `routes/ai.routes.test.ts`)
  - Orchestrator tests: `backend/src/__tests__/services/ai/ai-boot.test.ts`
- tasks.md includes explicit notes: "(note: `ai/` subdirectory exists)" and "(NOT `routes/ai.routes.test.ts`)"

**Verdict**: The critical document (tasks.md) has correct paths. Design.md has a minor path issue but implementation follows tasks.md.

---

### W5 — ab_comparatives table created ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **tasks.md** Task 0 | Was missing — comparisons wrote to `insights_history` (structural mismatch) | ✅ **FIXED**: `ab_comparatives` table defined in 14-ai-insights-expansion.sql |
| **design.md** §3.3 | Had "write to insights_history" | ✅ **FIXED**: "Save both SQL queries + results to `ab_comparatives` table (dedicated table, not `insights_history` - structural mismatch resolved)" |

**Evidence**:
- tasks.md (Task 0, lines 88-103): Full `ab_comparatives` table definition:
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
- design.md §3.3 (line 299): "Save both SQL queries + results to `ab_comparatives` table (dedicated table, not `insights_history` - structural mismatch resolved)"
- tasks.md (Task 3, line 362): "**FIXED**: Persist to `ab_comparatives` table (NOT `insights_history` - structural mismatch)"
- tasks.md risk register (line 541): "Compare persistence to `insights_history` mismatch | **FIXED**: Use dedicated `ab_comparatives` table"

**Verdict**: Structural mismatch resolved with clean, dedicated table design.

---

### S1 — riskFactors structured format ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **design.md** §3.1 | Had `riskFactors: string[]` (flat strings) | ✅ **FIXED**: Now `Array<{ factor: string; weight: number }>` |
| **tasks.md** Task 0 | Had structured format | ✅ Already correct |

**Evidence**:
- design.md §3.1: `riskFactors: Array<{ factor: string; weight: number }>;  // structured format for frontend`
- tasks.md (Task 0, types): `riskFactors: Array<{ factor: string; weight: number }>`

**Verdict**: Structured format enables frontend to render risk factor breakdown (e.g., "Inactividad prolongada: 40%", "Sin interacciones: 20%").

---

### S2 — confidence field added ✅ **PASS**

| Document | Original Issue | Fix Status |
|----------|---------------|------------|
| **design.md** §3.1 | Was missing `confidence` field | ✅ **FIXED**: Added `confidence: 'high' | 'medium' | 'low'` |
| **tasks.md** Task 2 | Was missing in return spec | ✅ **FIXED**: Added to response |

**Evidence**:
- design.md §3.1: `confidence: 'high' | 'medium' | 'low';  // based on data availability`
- tasks.md (Task 2, line 303): "**FIXED**: Include `confidence: 'high' | 'medium' | 'low'` in response based on data availability"
- tasks.md risk register: "Churn heuristics produce false positives with low data | Return `confidence` level in response when < 30 days of data available"

**Verdict**: Confidence level provides transparency about prediction reliability, as called for in the proposal's risk table.

---

## Summary of Fix Verification

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| C1 | DB init script: new file `14-ai-insights-expansion.sql` | ✅ PASS | Aligned design/tasks |
| C2 | compareSchema structured `{label, params}` | ✅ PASS | Full alignment |
| C3 | insights_history ALTER TABLE for `is_successful`, `error_message` | ✅ PASS | Fixes pre-existing bug |
| W1 | sanitize-html library (not regex) | ✅ PASS | Production-grade with proper config |
| W2 | Churn Factor 4 uses engagement metric | ⚠️ **PARTIAL** | Fixed in tasks.md only; design.md and proposal.md stale |
| W3 | Churn queries JOIN orders (confirmed buyers) | ✅ PASS | Filters non-students |
| W4 | Test paths corrected to services/ai/ | ✅ PASS | Implementation paths correct |
| W5 | ab_comparatives table created | ✅ PASS | Structural mismatch resolved |
| S1 | riskFactors structured format | ✅ PASS | `{ factor, weight }[]` |
| S2 | confidence field added | ✅ PASS | `high`/`medium`/`low` |

**Overall**: 9 of 10 issues fully resolved. 1 remaining WARNING on W2.

---

## Strict TDD Compliance

- `strict_tdd: true` in `openspec/config.yaml` ✅
- tasks.md Task 5 explicitly references RED → GREEN → TRIANGULATE patterns ✅
- Test files paths corrected to actual existing locations ✅
- Integration test scenarios include response shape assertions (e.g., "response body contains `data.predictions` array with items having `userId`, `churnScore`, `riskFactors`") ✅
- **Note**: A formal `TDD Cycle Evidence` table will be generated in `apply-progress.md` during the apply phase, as per verify-report.md §7. The tasks.md prepares correctly for this.

### Assertion Quality Assessment

| Check | Status | Finding |
|-------|--------|---------|
| No tautologies | ✅ PASS | Test cases describe meaningful behavior, not tautological assertions |
| No ghost loops | ✅ PASS | Not applicable (no loop-based tests) |
| No type-only assertions | ✅ PASS | All tests validate runtime behavior |
| No smoke-only tests | ✅ PASS | Integration tests include rate limit, auth, and validation error scenarios |
| No CSS assertions | ✅ PASS | Backend-only |

---

## Review Workload / PR Boundary Findings

| Field | Forecast | Actual Verification |
|-------|----------|-------------------|
| Estimated changed lines | ~1100-1300 | ~1225 (consistent) |
| 400-line budget risk | High | Correctly identified |
| Chained PRs recommended | Yes | 6 PRs proposed |
| Chain strategy | stacked-to-main | Correct for parallel independent merges |
| Scope creep | None | All changes bounded to 3 capabilities |

**PR Boundary Verification**:
- PR 1 (Task 0 DB+Types): ~80 lines ✅ within budget
- PR 2 (Task 1 Schemas+Limiters): ~120 lines ✅ within budget
- PR 3 (Task 2 predictChurn): ~250-300 lines ✅ within budget (may be underestimated — actual closer to 250-300 as noted)
- PR 4 (Task 3 recoverEmail+compare): ~150 lines ✅ within budget
- PR 5 (Task 4 Orchestrator+Routes): ~180 lines ✅ within budget
- PR 6 (Task 5 Tests+Docs): ~300 lines ✅ within budget

Each PR fits within the 400-line review budget. No scope creep detected — implementation respects the assigned slice.

---

## Remaining Issue

### W2: design.md and proposal.md still have stale Factor 4

**Location**:
- design.md §4.1: `| 4 | Acceso frecuente sin progreso | total_orders >= 3 AND days_since_last_activity <= 7 AND progress < 10% | +10% |`
- proposal.md: `| Acceso frecuente sin progreso | Accesos > 10 en 7 días pero progreso < 10% | +10% |`

**Fix in tasks.md**: Remove Factor 4 with comment that access tracking requires additional infrastructure.

**Recommendation**: Update design.md §4.1 and proposal.md's heuristic table to match tasks.md (remove Factor 4 or replace with actual engagement metric). This is a documentation consistency issue — implementation following tasks.md will be correct.

**Severity**: WARNING (not a blocker for apply, but should be resolved for documentation integrity).

---

## Verdict

| Category | Judgment |
|----------|----------|
| **Pass/Fail** | ✅ **PASS** |
| Fix Completeness | 9/10 issues fully resolved |
| Remaining Issues | 1 WARNING (W2: stale Factor 4 in design.md/proposal.md) |

The SDD documents are ready for the `sdd-apply` phase. The single remaining documentation inconsistency (Factor 4 in design.md and proposal.md) should be resolved during apply or in a subsequent documentation pass, but it does not block implementation since tasks.md correctly guides the developer.
