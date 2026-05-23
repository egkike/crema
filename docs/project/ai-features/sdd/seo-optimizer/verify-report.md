# SDD Final Judgment: SEO Optimizer

**Change**: `seo-optimizer`  
**Capability**: `seo.optimizer`  
**Date**: 2026-05-23  
**Phase**: Final Blind Judgment  
**Status**: **NEEDS_FIX**

---

## Executive Summary

Fresh cross-document audit of all four SDD docs. Previous judge reports dated 2026-05-22 and 2026-05-23 contain claims (endpoint mismatch, mixed EN/ES errors, og_description 40-char limit, aiContentLimiter) that **do not match current file state** — those issues have been fixed. This report supersedes both.

After re-auditing against the checklist, **5 items FAIL**:

### Checklist Verdict

| # | Item | Verdict |
|---|------|---------|
| 1 | Endpoint & Naming (`POST /api/ai/product/seo`, camelCase) | ✅ **PASS** |
| 2 | Character Limits (30-60, 100-155, max 60, max 100) | ❌ **FAIL** — metaDescription min=100 missing from PROPOSAL.md and tasks.md |
| 3 | Response Interface (ogType, ogSiteName, sources?, canonicalUrl, ogImageUrl) | ❌ **FAIL** — tasks.md `SEOOptimizerOutput` missing ogType, ogSiteName, sources |
| 4 | Rate Limiter (`seoOptimizerLimiter`) | ✅ **PASS** |
| 5 | Cacheable (`cacheable: false`) | ✅ **PASS** |
| 6 | Error Messages ("You do not have ownership of this product") | ✅ **PASS** |
| 7 | Domain (`crema.com`) | ✅ **PASS** |
| 8 | Ownership Check (inline SQL pattern) | ✅ **PASS** |
| 9 | System Prompt (camelCase + schemaMarkup object) | ⚠️ **PASS with note** — system prompt is correct; truncation rules use snake_case |
| 10 | DB Filename (`13-seo-optimizer-tables.sql`) | ❌ **FAIL** — only DESIGN.md and tasks.md reference it; SPEC.md contradicts by saying no new tables needed |

---

## Detailed Findings

### Item 1: Endpoint & Naming — ✅ PASS

All four documents consistently use `POST /api/ai/product/seo` and camelCase for response fields (`metaTitle`, `metaDescription`, `ogTitle`, `ogDescription`).

### Item 2: Character Limits — ❌ FAIL

**metaTitle 30-60**: ✅ Consistent across all docs.

**metaDescription 100-155**: ❌ **INCONSISTENT**

| Document | Stated Limit | Min 100? |
|----------|-------------|----------|
| PROPOSAL.md Outputs table | `155 caracteres` | ❌ No minimum stated |
| SPEC.md AC-4 | `100-155 characters` | ✅ Yes |
| SPEC.md §4.3 | `metaDescription: string; // 100-155 chars` | ✅ Yes |
| DESIGN.md API response | `metaDescription: string; // 100-155 chars` | ✅ Yes |
| tasks.md system prompt | `metaDescription: Máximo 155 caracteres` | ❌ No minimum stated |
| tasks.md truncation rules | `meta_description ≤155` | ❌ No minimum stated |

**Impact**: An LLM generating a 50-character description would pass tasks.md validation but fail SPEC.md AC-4 (which requires ≥100).

**ogTitle max 60**: ✅ Consistent across all docs.

**ogDescription max 100**: ✅ Consistent across all docs. (Note: previous judge report incorrectly claimed 40 — current tasks.md says `≤100`.)

### Item 3: Response Interface — ❌ FAIL

| Field | PROPOSAL.md | SPEC.md §4.3 | DESIGN.md API | tasks.md `SEOOptimizerOutput` |
|-------|-------------|-------------|---------------|------------------------------|
| `metaTitle` | ✅ (in `Retornar {...}`) | ✅ | ✅ | ✅ |
| `metaDescription` | ✅ | ✅ | ✅ | ✅ |
| `ogTitle` | ❌ (`ogTags` grouped) | ✅ | ✅ | ✅ |
| `ogDescription` | ❌ (`ogTags` grouped) | ✅ | ✅ | ✅ |
| `ogImageUrl` | ❌ (not in `Retornar {...}`) | ✅ | ✅ | ✅ |
| **`ogType`** | ❌ | ✅ | ✅ | **❌ MISSING** |
| **`ogSiteName`** | ❌ | ✅ | ✅ | **❌ MISSING** |
| `canonicalUrl` | ❌ (not in `Retornar {...}`) | ✅ | ✅ | ✅ |
| `schemaMarkup` | ✅ | ✅ | ✅ | ✅ |
| `keywords` | ✅ | ✅ | ✅ | ✅ |
| **`sources`** | ❌ | ✅ (`sources?`) | ✅ (`sources?`) | **❌ MISSING** |

**Critical gap**: `tasks.md` `SEOOptimizerOutput` (Task 2, line ~207) is missing `ogType`, `ogSiteName`, and `sources`. These are present in SPEC.md §4.3 and DESIGN.md API Contracts. The Task 7 integration test mock also omits them.

**Secondary gap**: `PROPOSAL.md` uses a grouped `ogTags` response shape instead of flat individual fields. The `Retornar {...}` shape also omits `canonicalUrl`, `ogImageUrl`, `ogType`, `ogSiteName`, and `sources` — though the Outputs table does list Canonical URL and OG Image URL separately.

**SPEC.md response example** (§4.4) also omits `ogType` and `ogSiteName` from the JSON example, even though the type definition (§4.3) includes them.

### Item 4: Rate Limiter — ✅ PASS

All documents use `seoOptimizerLimiter`. (Note: previous judge report incorrectly claimed PROPOSAL.md used `aiContentLimiter` — current files show `seoOptimizerLimiter` at all four occurrences.)

### Item 5: Cacheable — ✅ PASS

All documents with skill registration use `cacheable: false`:
- PROPOSAL.md: `options: { timeout: 30000, retries: 2, cacheable: false }`
- DESIGN.md: same
- tasks.md: same

### Item 6: Error Messages — ✅ PASS

All documents that specify the 403 error message use: `"You do not have ownership of this product"`
- SPEC.md: error handling table + response example
- DESIGN.md: route handler code
- tasks.md: Task 4 route handler

### Item 7: Domain — ✅ PASS

All documents use `crema.com` for URLs. No `crema.io` references found.

### Item 8: Ownership Check — ✅ PASS

All documents use the inline SQL pattern:
```sql
SELECT id, creator_id FROM "products" WHERE id = $1
```
Verified in SPEC.md (note), DESIGN.md (route handler), tasks.md (Task 4 route handler).

### Item 9: System Prompt — ⚠️ PASS with note

**System prompt** in tasks.md uses camelCase (`metaTitle`, `metaDescription`, `ogTitle`, `ogDescription`) and `schemaMarkup` as an object — ✅ meets the checklist criterion.

However, the **truncation rules** immediately after (line 287) use **snake_case**: `meta_title 30-60 chars, meta_description ≤155, og_title ≤60, og_description ≤100`. This creates a naming inconsistency within tasks.md between the system prompt (camelCase) and implementation notes (snake_case).

Also, the system prompt says only `"Máximo 155 caracteres"` for metaDescription without the minimum of 100 (see Item 2).

### Item 10: DB Filename — ❌ FAIL

| Document | References `13-seo-optimizer-tables.sql`? |
|----------|------------------------------------------|
| PROPOSAL.md | ❌ — just "db/init/" generically |
| SPEC.md | ❌ — says "No new database tables are required for v1" (§5) |
| DESIGN.md | ✅ — explicitly in File Changes table + Rollout |
| tasks.md | ✅ — Task 0 explicitly creates it |

**Critical contradiction**: **SPEC.md §5 explicitly states "No new database tables are required for v1"** and lists only reused tables (`products`, `ai_embeddings`, `ai_credits`, `ai_credit_transactions`). Meanwhile, **DESIGN.md creates `db/init/13-seo-optimizer-tables.sql`** for `product_seo_configs`, and **tasks.md Task 0** creates the same migration. PROPOSAL.md says the table is "ya definida en PRD §8.3.1" — suggesting it already exists.

If the table already exists (per PRD), then tasks.md Task 0 is redundant. If it doesn't exist, SPEC.md §5 is wrong. Either way, the documents contradict each other on whether a new database table is needed.

---

## Previous Judge Report Cross-Reference

The `judge-verify-report.md` claims these issues — **verified against current files**:

| Claim | Current File State | Accurate? |
|-------|-------------------|-----------|
| C-1: og_description limits contradict (40 vs 100 vs 160) | tasks.md says `≤100`, DESIGN system prompt says 100, DB schema VARCHAR(160) | ❌ **Wrong** — tasks.md says 100, not 40; DB column width ≠ app limit |
| C-2: PROPOSAL endpoint `/api/ai/product/seo/generate` | PROPOSAL uses `POST /api/ai/product/seo` at all 4 occurrences | ❌ **Wrong** — already fixed |
| C-3: ogType/ogSiteName missing from SPEC response interface | SPEC §4.3 HAS `ogType` and `ogSiteName` | ❌ **Wrong** — issue is tasks.md missing them, not SPEC |
| W-1: verify-report outdated | Verified — superseded by this report | ✅ Accurate assessment |
| W-2: metaTitle minimum missing from tasks | tasks.md system prompt says "mínimo 30 caracteres" | ❌ **Wrong** — already has minimum |
| W-3: scenarios use "prod-abc" (not UUID) | Scenarios use `"00000000-..."` proper UUIDs | ❌ **Wrong** — already fixed |
| W-4: PROPOSAL rate limiter `aiContentLimiter` | No `aiContentLimiter` found in PROPOSAL | ❌ **Wrong** — already fixed |

**Verdict**: The judge-verify-report describes a file state that no longer exists. Most of its issues have been fixed. However, it missed several issues that **still exist** (see Detailed Findings above).

---

## Remaining Issues Summary

### Need Fix

| ID | Severity | Area | Issue |
|----|----------|------|-------|
| F-1 | **CRITICAL** | tasks.md | `SEOOptimizerOutput` (Task 2) missing `ogType`, `ogSiteName`, `sources` — present in SPEC §4.3 and DESIGN API Contracts |
| F-2 | **CRITICAL** | SPEC.md §5 vs DESIGN/tasks | SPEC says "No new database tables required"; DESIGN and tasks create `13-seo-optimizer-tables.sql`. Resolve whether `product_seo_configs` already exists or needs migration |
| F-3 | **HIGH** | PROPOSAL.md + tasks.md | `metaDescription` minimum of 100 chars not enforced: PROPOSAL Outputs table says "155 caracteres" (no min); tasks.md system prompt says "Máximo 155" (no min); tasks.md truncation says "≤155" (no min). SPEC and DESIGN say 100-155 |
| F-4 | **MODERATE** | tasks.md | Truncation rules (line 287) use snake_case (`meta_title`, `meta_description`, `og_title`, `og_description`) — inconsistent with camelCase used everywhere else in tasks.md |
| F-5 | **MODERATE** | tasks.md | Task 7 integration test mock missing `ogImageUrl`, `ogType`, `ogSiteName` from the mock data |
| F-6 | **MINOR** | PROPOSAL.md | Response shape `Retornar { metaTitle, metaDescription, ogTags, schemaMarkup, keywords }` uses grouped `ogTags` instead of flat fields; omits `ogImageUrl`, `ogType`, `ogSiteName`, `canonicalUrl`, `sources` |
| F-7 | **MINOR** | SPEC.md §4.4 | Success response JSON example omits `ogType` and `ogSiteName` even though §4.3 interface includes them |

### Already Fixed (from previous reports)

| Previous Issue | Status |
|----------------|--------|
| PROPOSAL endpoint path (`/generate` suffix) | ✅ Fixed — all occurrences use `/api/ai/product/seo` |
| SPEC AC-1 wrong endpoint | ✅ Fixed — AC-1 uses `/api/ai/product/seo` |
| DESIGN mixed EN/ES credit error | ✅ Fixed — Spanish only (`'insuficientes'`) |
| SPEC response snake_case / nested og_tags | ✅ Fixed — camelCase, flat fields |
| tasks.md og_description = 40 | ✅ Fixed — now `≤100` (line 287) |
| tasks.md metaTitle no minimum | ✅ Fixed — system prompt says "mínimo 30" |
| Scenarios using "prod-abc" | ✅ Fixed — proper UUIDs |
| PROPOSAL aiContentLimiter | ✅ Fixed — uses seoOptimizerLimiter |

---

## Spec Coverage

| Spec Requirement | Coverage | Consistent? |
|-----------------|----------|-------------|
| Endpoint `POST /api/ai/product/seo` | ✅ All | ✅ Yes |
| JWT auth | ✅ All | ✅ Yes |
| Zod validation | ✅ All | ✅ Yes |
| Product ownership (403) | ✅ All | ✅ Yes |
| RAG context | ✅ All | ✅ Yes |
| metaTitle 30-60 | ✅ All | ✅ Yes |
| metaDescription 100-155 | ✅ All | ❌ No — PROPOSAL+tasks missing min 100 |
| OG tags (ogTitle, ogDescription, ogImageUrl) | ✅ All | ✅ Yes |
| ogType + ogSiteName in response | ⚠️ SPEC+DESIGN | ❌ No — tasks.md missing |
| sources in response | ⚠️ SPEC+DESIGN | ❌ No — tasks.md missing |
| canonicalUrl in response | ⚠️ SPEC+DESIGN+tasks | ⚠️ PROPOSAL omits from response shape |
| schemaMarkup | ✅ All | ✅ Yes |
| Credit after LLM | ✅ All | ✅ Yes |
| Rate limiting (seoOptimizerLimiter) | ✅ All | ✅ Yes |
| Error messages | ✅ All | ✅ Yes |
| DB persistence | ⚠️ Contradiction | ❌ No — SPEC says no new tables, DESIGN+tasks create migration |

## Task Completion Status

SDD phase only — no code implementation to verify. Tasks are well-structured with clear dependency ordering (Task 0→7). The `SEOOptimizerOutput` type (Task 2) needs ogType, ogSiteName, and sources fields added before code implementation begins.

## Strict TDD

Not applicable — this is SDD document verification, not code verification.

## Review Workload / PR Boundary

| Forecast Field | Reported | Assessment |
|----------------|----------|------------|
| Estimated changed lines | ~280-360 | ✅ Reasonable |
| 400-line budget | Low risk | ✅ OK |
| Chained PRs recommended | No | ✅ Correct |
| Chain strategy | stacked-to-main | ⚠️ Minor: contradicts "No chained PRs" — should be "single-pr" |
| Delivery strategy | ask-on-risk | ✅ OK |
| Scope creep | None detected | ✅ Within scope |

## Artifacts

| Artifact | Path |
|----------|------|
| This report | `docs/project/ai-features/sdd/seo-optimizer/verify-report.md` |
| PROPOSAL | `docs/project/ai-features/sdd/seo-optimizer/PROPOSAL.md` |
| SPEC | `docs/project/ai-features/sdd/seo-optimizer/SPEC.md` |
| DESIGN | `docs/project/ai-features/sdd/seo-optimizer/DESIGN.md` |
| Tasks | `docs/project/ai-features/sdd/seo-optimizer/tasks.md` |
| Previous judge report (superseded) | `docs/project/ai-features/sdd/seo-optimizer/judge-verify-report.md` |

---

## Skill Resolution

- **Resolution**: `none` — SDD document verification; no code execution required
