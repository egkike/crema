# Judge Verification Report: SEO Optimizer SDD

**Change**: `seo-optimizer` | **Capability**: `seo.optimizer`  
**Date**: 2026-05-23  
**Phase**: Judgment Day (SDD Review — docs only, no code)  
**Previous verify-report**: `verify-report.md` (2026-05-22)  
**Status**: **NEEDS_FIX**

---

## Executive Summary

The SDD is structurally sound and well-organized, with clear phase transitions from Proposal → Spec → Design → Tasks. Most architectural decisions are justified, and the dependency ordering of tasks is coherent.

However, this review found **2 CRITICAL** inconsistencies (character-limit contradictions across documents, and an endpoint path mismatch between Proposal and all other documents), plus **4 WARNING-level** issues (including a previous verify-report that inaccurately describes the current file state). The previous verify-report (2026-05-22) claimed three CRITICAL issues (C-1, C-2, C-3) that the current files **do not have** — meaning either the files were silently corrected between 2026-05-22 and today, or the verify-report was inaccurate. Either way, a fresh, accurate baseline is needed.

**Bottom line**: Fix the real inconsistencies, then update/replace the previous verify-report. Do NOT re-open C-1/C-2/C-3 from the old report; they are no longer present in current files.

---

## What's Good

| Aspect | Assessment |
|--------|-----------|
| Phase completeness | ✅ Full chain: Proposal → Spec → Design → Tasks |
| RFC 2119 keywords | ✅ Used appropriately (MUST, SHALL, SHOULD) in SPEC.md |
| Acceptance criteria | ✅ Well-structured AC-1 through AC-7 |
| Scenarios (13 total) | ✅ GIVEN/WHEN/THEN format, covers happy/error/edge paths |
| Design decisions table | ✅ 5 decisions with options A/B, choice + rationale |
| Tasks dependency graph | ✅ Clear, correct ordering Task 0→7 |
| Task verification checklists | ✅ Each task has specific "Verified" items |
| Credit timing (after LLM) | ✅ Consistent across all documents — fail-safe pattern |
| Rate limiter dedicated | ✅ `seoOptimizerLimiter` consistent in SPEC/DESIGN/tasks |
| Product ownership check | ✅ Consistent across all documents |

---

## Critical Issues

### C-1: Character Limit Contradictions — `og_description` (CRITICAL)

The `og_description` (or `ogDescription`) maximum length **contradicts across four documents**. This directly impacts LLM prompt instructions, response validation, and the DB schema.

| Document | Location | Limit |
|----------|----------|-------|
| **SPEC.md** §1 requirement table | "Description for social posts" | max **100** chars |
| **SPEC.md** §4.3 response type | `ogDescription: string; // max 100 chars` | max **100** chars |
| **tasks.md** Task 2 system prompt | `og_description: Máximo 40 caracteres` | max **40** chars |
| **tasks.md** Task 2 truncation rules | `og_title ≤60, og_description ≤40` | max **40** chars |
| **DESIGN.md** system prompt | `"ogDescription": "string (max 160 chars)"` | max **160** chars |
| **DESIGN.md** DB schema | `og_description VARCHAR(160)` | max **160** chars |

**Impact**: The LLM prompt will be told to generate `og_description` at ≤40 chars (tasks.md), but the response validation expects ≤100 chars (SPEC.md), the DB stores up to 160 chars (DESIGN.md), and the DESIGN system prompt says 160. The generated output could pass task validation but fail SPEC acceptance criteria, or vice versa.

**Resolution required**: Pick ONE consistent limit across all documents. Recommend **100 chars** (SPEC.md value — best balance for social sharing).

### C-2: Endpoint Path: PROPOSAL.md vs Every Other Document (CRITICAL)

| Document | Endpoint |
|----------|----------|
| **PROPOSAL.md** (3 occurrences: lines 24, 61, 129, 183) | `POST /api/ai/product/seo/generate` |
| **SPEC.md** (§1, AC-1, §4.1, §4.2) | `POST /api/ai/product/seo` |
| **DESIGN.md** (4 occurrences) | `POST /api/ai/product/seo` |
| **tasks.md** (Task 4) | `POST /api/ai/product/seo` |

**Previous verify-report claimed** SPEC.md AC-1 had `/api/ai/seo/optimize` — **this is NOT present in the current file**. The actual AC-1 correctly reads `/api/ai/product/seo`. The real mismatch is PROPOSAL.md vs all others.

**Impact**: A developer implementing from PROPOSAL.md alone would build the wrong endpoint. Code review would catch it, but it's wasted effort.

**Resolution required**: Change all PROPOSAL.md occurrences from `/api/ai/product/seo/generate` to `/api/ai/product/seo`.

---

### C-3: `ogType` and `ogSiteName` Required but Missing from Response Interface (CRITICAL)

**SPEC.md** §1 (Open Graph Tags requirement table) defines 6 OG fields:

| Field | Description |
|-------|-------------|
| `ogTitle` | ✅ Present in response |
| `ogDescription` | ✅ Present in response |
| `ogImageUrl` | ✅ Present in response |
| `canonicalUrl` | ✅ Present in response |
| **`ogType`** | **❌ Missing from response interface** (value: `"product"`) |
| **`ogSiteName`** | **❌ Missing from response interface** (value: `"Crema"`) |

The response interface in SPEC.md §4.3 and the 200 success example in §4.4 both lack `ogType` and `ogSiteName`.

Meanwhile, DESIGN.md, tasks.md, and PROPOSAL.md never mention `ogType` or `ogSiteName` at all.

**Impact**: If a client expects these fields (as the SPEC requirement says they SHALL be provided), they won't be there. The requirement is contradictory.

**Resolution required**: Either (a) add `ogType` and `ogSiteName` to the response interface across ALL docs, or (b) remove them from the SPEC §1 requirement table. Given that these are standard OG tags, option (a) is recommended.

---

## Warnings

### W-1: Previous verify-report Describes Outdated/Incorrect File State (WARNING)

The existing `verify-report.md` (2026-05-22) claims three CRITICAL issues that **do not exist in the current files**:

| Claim by verify-report | Actual current file state |
|------------------------|--------------------------|
| C-1: SPEC.md AC-1 says `/api/ai/seo/optimize` | Current SPEC.md AC-1 says `/api/ai/product/seo` ✅ |
| C-2: SPEC.md response uses snake_case, nested `og_tags` | Current SPEC.md uses camelCase, flat `ogTitle`/`ogDescription` ✅ |
| C-3/C-4: DESIGN.md has mixed EN/ES `'insufficient'`/`'insuficientes'` | Current DESIGN.md uses only Spanish `'insuficientes'`/`'Créditos insuficientes'` ✅ |

Three possible explanations: (a) files were silently corrected between 2026-05-22 and 2026-05-23, (b) the verify-report was written against a different version/branch, (c) the verify-report simply got the line numbers wrong. Either way, the current file state contradicts the verify-report's CRITICAL claims.

**Impact**: Anyone reading `verify-report.md` as if it reflects current state will be misled. The report needs to be updated or replaced.

**Resolution required**: Replace or update `verify-report.md` to accurately reflect current file state. The new findings (C-1 through C-3 above, W-1 through W-4 here) should replace the old ones.

### W-2: meta_title Minimum Length Gap (WARNING)

**SPEC.md** AC-4 requires `metaTitle` to be between **30-60 characters**. However:
- **tasks.md** Task 2 system prompt: `meta_title: Máximo 60 caracteres` (no minimum enforcement)
- **tasks.md** Task 2 truncation rules: `meta_title ≤60` (no minimum enforcement)
- **DESIGN.md**: no minimum mentioned
- **PROPOSAL.md**: no minimum mentioned

If the LLM generates a 25-character title, the service would accept it (passes tasks.md verification) but would **fail AC-4** (which requires ≥30 chars).

**Resolution required**: Add minimum-length enforcement (≥30 chars) to `seoOptimizerService.generate()` and document it in tasks.md truncation rules. Update the system prompt to say "30-60 characters" instead of "Máximo 60".

### W-3: Scenario productId `"prod-abc"` Fails UUID Validation (WARNING)

SPEC.md scenario 7.1 and 7.2 use `productId = "prod-abc"` as test data. However, the Zod schema requires `productId` to be a **valid UUID** (`z.string().uuid()`). The string `"prod-abc"` is not a valid UUID and would always result in a 400 validation error.

This means **the happy-path scenario as written is impossible to execute**. It describes an impossible flow.

**Affected scenarios**:
- 7.1 "Creator generates SEO metadata for product" — uses `"prod-abc"`
- 7.1 "Creator regenerates SEO metadata" — uses `"prod-abc"`
- 7.2 "Non-owner user" — uses `"prod-abc"`
- 7.2 "Buyer (not owner) attempts SEO optimization" — uses `"prod-abc"`

**Resolution required**: Replace all `"prod-abc"` references with a valid UUID (e.g., `"550e8400-e29b-41d4-a716-446655440000"`).

### W-4: PROPOSAL.md Rate Limiter Name Differs from All Others (WARNING)

| Document | Rate Limiter |
|----------|-------------|
| **PROPOSAL.md** | `aiContentLimiter` (reutilizado) |
| **SPEC.md** | `seoOptimizerLimiter` (dedicated) |
| **DESIGN.md** | `seoOptimizerLimiter` (dedicated) |
| **tasks.md** | `seoOptimizerLimiter` (dedicated) |

PROPOSAL.md suggests reusing the shared `aiContentLimiter`, while all other docs define a dedicated `seoOptimizerLimiter` (10 req/min). If PROPOSAL.md were followed, SEO traffic would share rate limits with other AI content features, defeating the isolation rationale in DESIGN.

**Resolution required**: Update PROPOSAL.md to reference `seoOptimizerLimiter` (dedicated).

---

## Info / Suggestions

### S-1: `sources` Field Orphaned from Response Interface

SPEC.md scenario 7.3 ("No RAG results found") states `sources` is an empty array. But neither the SPEC §4.3 response interface nor the tasks.md output interface includes a `sources` field. The scenario describes behavior for a field that doesn't exist in the API contract.

**Suggestion**: Either add `sources` to the response interface (documenting RAG provenance is useful for debugging), or remove the `sources` mention from the scenario.

### S-2: `saved` Field Only in DESIGN.md

DESIGN.md API response includes `saved: boolean` (whether persisted to DB). But SPEC.md and tasks.md response interfaces don't include this field.

**Suggestion**: Either add `saved` to SPEC.md and tasks.md response interfaces, or remove it from DESIGN.md. If the field is useful for clients to know whether persistence succeeded, add it everywhere.

### S-3: `verifyProductOwnership` — Function or Inline SQL?

- **SPEC.md** note says "inline SQL pattern instead of a dedicated `verifyProductOwnership` function"
- **DESIGN.md** dependencies table lists `verifyProductOwnership` as a module dependency
- **tasks.md** Task 4 uses inline SQL with `pool.query(...)`

If `verifyProductOwnership` is a real existing function in the codebase, the SPEC note is misleading. If it doesn't exist, the DESIGN dependencies table is wrong.

**Suggestion**: Check whether `verifyProductOwnership` exists in the codebase. If yes, use it in tasks.md instead of inline SQL. If no, remove it from DESIGN.md dependencies and keep the inline SQL pattern consistent.

### S-4: PROPOSAL Success Criteria Overlap with AC but Less Precise

PROPOSAL.md success criteria are less specific than SPEC.md AC-4:
- PROPOSAL: "Meta title generado tiene máximo 60 caracteres" (no minimum)
- PROPOSAL: "Meta description generada tiene máximo 160 caracteres" (differs from SPEC's 155)
- PROPOSAL: missing `canonicalUrl` mention entirely

**Suggestion**: Align PROPOSAL success criteria with SPEC acceptance criteria for consistency.

### S-5: Response Example Keywords Count

SPEC.md §4.4 success example shows only **4 keywords** (`["marketing digital", "SEO", "redes sociales", "email marketing"]`), but the interface says "5-10 keywords". The example doesn't meet the spec's own constraint.

**Suggestion**: Add more keywords to the example, or reduce the minimum to 3-5.

### S-6: Mixed RFC 2119 Keywords (MUST vs SHALL)

SPEC.md §1 uses both MUST and SHALL interchangeably:
- "The system MUST expose an HTTP endpoint..."
- "The endpoint SHALL accept a JSON body..."
- "the system MUST verify..."
- "the service SHALL generate..."
- "The SEO Optimizer feature SHALL consume AI credits..."

Per RFC 2119, both are absolute requirements, but mixing them without reason is inconsistent style. Since most of the codebase services are Spanish-documented, consider using MUST everywhere for simplicity.

**Suggestion**: Unify on MUST throughout SPEC.md.

---

## Verify-Report Cross-Reference

| Previous Claim | Current State | Verdict |
|---------------|---------------|---------|
| C-1: SPEC AC-1 wrong endpoint | SPEC AC-1 is correct (`/api/ai/product/seo`) | ❌ **Outdated** — real issue is PROPOSAL vs all others (see C-2 above) |
| C-2: SPEC response snake_case/nested | SPEC response is camelCase/flat | ❌ **Outdated** — already aligned with tasks.md |
| C-3: DESIGN mixed EN/ES | DESIGN is clean Spanish only | ❌ **Outdated** — already fixed |
| C-4: "NOT FIXED" | Already fixed | ❌ **Outdated** — claim is inaccurate for current state |
| Required Fixes 1-4 | None needed for claimed issues, but new issues exist | ❌ **Needs replacement** |

---

## Review Workload Forecast Assessment

| Forecast Field | Reported | Assessment |
|----------------|----------|------------|
| Estimated lines | ~280-360 | ✅ Reasonable for 5 new files + 3 modified files |
| 400-line budget risk | Low | ✅ Agreed |
| Chained PRs recommended | No | ✅ Correct — feature is self-contained |
| Suggested split | Single PR | ✅ Correct |
| Chain strategy | stacked-to-main | ⚠️ Contradicts "No chained PRs" — if no chaining, strategy should be "single-pr" or "none" |
| Delivery strategy | ask-on-risk | ✅ Fine |

The Review Workload Forecast is present and reasonable, but the "Chain strategy: stacked-to-main" field is contradictory when Chained PRs are "No". Minor cleanup needed.

---

## Summary of Findings

| ID | Severity | Area | Summary |
|----|----------|------|---------|
| C-1 | **CRITICAL** | All docs | `og_description` max length: 40 (tasks) vs 100 (SPEC) vs 160 (DESIGN) |
| C-2 | **CRITICAL** | PROPOSAL.md | Endpoint path: `POST /api/ai/product/seo/generate` ≠ all other docs (`/api/ai/product/seo`) |
| C-3 | **CRITICAL** | SPEC.md §1 vs §4.3 | `ogType` and `ogSiteName` required in requirements but missing from response interface |
| W-1 | **WARNING** | verify-report.md | Claims 3 CRITICAL issues that don't exist in current files — needs replacement |
| W-2 | **WARNING** | SPEC AC-4 vs tasks | meta_title ≥30 char minimum in AC-4, but no enforcement in tasks.md service logic |
| W-3 | **WARNING** | SPEC.md scenarios | `"prod-abc"` is not a valid UUID — scenarios describe impossible flow |
| W-4 | **WARNING** | PROPOSAL.md | Rate limiter `aiContentLimiter` (shared) vs `seoOptimizerLimiter` (dedicated) |
| S-1 | **INFO** | SPEC.md scenarios | `sources` field referenced in scenario but absent from response interface |
| S-2 | **INFO** | DESIGN.md | `saved` field only in DESIGN response, absent from SPEC/tasks |
| S-3 | **INFO** | SPEC/DESIGN/tasks | `verifyProductOwnership` function vs inline SQL — contradictory references |
| S-4 | **INFO** | PROPOSAL.md | Success criteria less precise than AC; missing canonicalUrl |
| S-5 | **INFO** | SPEC.md §4.4 | Response example has 4 keywords but spec says 5-10 |
| S-6 | **INFO** | SPEC.md | Mixed MUST/SHALL RFC 2119 usage |

---

## Next Recommended

1. **Fix CRITICAL issues first**: Resolve character-limit inconsistency (C-1), PROPOSAL endpoint path (C-2), and add `ogType`/`ogSiteName` to response interface (C-3).
2. **Replace verify-report.md**: The existing report is outdated and describes issues not present in current files. Replace with this judgment or a corrected version.
3. **Fix WARNING issues**: Add meta_title minimum enforcement (W-2), fix scenario UUIDs (W-3), align PROPOSAL rate limiter name (W-4).
4. **Address INFO items**: Align `sources`/`saved` fields, unify `verifyProductOwnership` approach, fix example keyword count, unify RFC 2119 style.
5. **After fixes**: Re-run this judgment to confirm all issues resolved. Then proceed to SDD-apply phase.

---

## Artifacts

| Artifact | Path |
|----------|------|
| This judgment | `docs/project/ai-features/sdd/seo-optimizer/judge-verify-report.md` |
| Previous report (outdated) | `docs/project/ai-features/sdd/seo-optimizer/verify-report.md` |
| PROPOSAL | `docs/project/ai-features/sdd/seo-optimizer/PROPOSAL.md` |
| SPEC | `docs/project/ai-features/sdd/seo-optimizer/SPEC.md` |
| DESIGN | `docs/project/ai-features/sdd/seo-optimizer/DESIGN.md` |
| Tasks | `docs/project/ai-features/sdd/seo-optimizer/tasks.md` |
