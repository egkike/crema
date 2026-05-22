# SDD Final Judgment: SEO Optimizer

**Change**: `seo-optimizer`  
**Capability**: `seo.optimizer`  
**Date**: 2026-05-22  
**Phase**: Final Judgment  
**Status**: **NEEDS_FIX**

---

## Executive Summary

The SDD contains **critical inconsistencies** in three areas:

1. **Endpoint path contradiction** between AC-1 and the rest of the spec
2. **Response format contradiction** between SPEC.md (snake_case, nested og_tags object) and tasks.md (camelCase, flat og* fields)
3. **English/Spanish mixed error messages** in DESIGN.md

These are not minor formatting issues — they would cause implementation ambiguity and potential API contract violations.

---

## Critical Issues

### C-1: ENDPOINT PATH CONTRADICTION (CRITICAL)

| Location | Endpoint |
|----------|----------|
| SPEC.md AC-1 | `POST /api/ai/seo/optimize` |
| SPEC.md §1 | `POST /api/ai/product/seo` |
| SPEC.md §4.1 | `POST /api/ai/product/seo` |
| SPEC.md §4.2 | `POST /api/ai/product/seo` |
| tasks.md Task 4 | `POST /api/ai/product/seo` |
| DESIGN.md | `POST /api/ai/product/seo` |
| PROPOSAL.md | `POST /api/ai/product/seo/generate` |

**Problem**: AC-1 says `/api/ai/seo/optimize` but everything else says `/api/ai/product/seo`. Only ONE endpoint can exist.

**Resolution required**: Remove or correct AC-1 line 136 to use `/api/ai/product/seo`.

---

### C-2: RESPONSE FORMAT CONTRADICTION (CRITICAL)

**SPEC.md defines (lines 228-247)**:
```typescript
interface SeoOptimizerResponse {
  meta_title: string;           // snake_case
  meta_description: string;      // snake_case
  og_tags: {                    // NESTED object
    og_title: string;
    og_description: string;
    og_image: string;
    og_url: string;
    og_type: 'product';
    og_site_name: string;
  };
  schema_markup: string;         // JSON-LD as string
  sources?: Array<{
    source_type: 'lesson' | 'faq' | 'review';
    source_id: string;
    content: string;
    similarity: number;
  }>;
}
```

**tasks.md defines (lines 159-170)**:
```typescript
export interface SEOOptimizerOutput {
  metaTitle: string;           // camelCase
  metaDescription: string;     // camelCase
  ogTitle: string;              // FLAT fields
  ogDescription: string;
  ogImageUrl?: string;
  schemaMarkup: Record<string, unknown>;  // OBJECT not string
  keywords: string[];
  canonicalUrl?: string;
}
```

**Problems**:
1. Property naming: `meta_title` vs `metaTitle`
2. OG tags: nested `og_tags` object vs flat `ogTitle`, `ogDescription`
3. Schema markup: `string` (JSON-LD) vs `Record<string, unknown>` (parsed object)
4. Missing fields: SPEC has `sources` array, tasks has `keywords` array
5. Missing field: SPEC has no `keywords` in response, tasks.md has no `sources` in response

**Resolution required**: Unify on ONE response format. Recommend:
- Use camelCase (`metaTitle`, `metaDescription`) — consistent with other services
- Flat OG fields (`ogTitle`, `ogDescription`) — simpler client consumption
- `schemaMarkup` as `Record<string, unknown>` — already parsed
- Add `keywords` array to spec
- Document `sources` as optional (RAG context indicator)

---

### C-3: ERROR MESSAGE LANGUAGE MIXED (WARNING)

**Location**: DESIGN.md lines 217-218

**Current**:
```typescript
if (creditError instanceof Error && (creditError.message.includes('insufficient') || creditError.message.includes('insuficientes'))) {
  throw new AppError('Insufficient credits', 402);
}
```

**Issues**:
1. English check `'insufficient'` in condition
2. English error message `'Insufficient credits'`
3. Mixed language pattern

**Required fix**:
```typescript
if (creditError instanceof Error && creditError.message.includes('insuficientes')) {
  throw new AppError('Créditos insuficientes', 402);
}
```

---

### C-4: VERIFY-REPORT NEW-4 NOT FIXED

The Round 4 verify-report explicitly stated this was NOT fixed (line 69 of verify-report.md):

| Issue | Expected | Status |
|-------|----------|--------|
| NEW-4: Credit error EN/ES mix | Fix to Spanish | ❌ **NOT FIXED** |

The DESIGN.md still contains the mixed language code.

---

## Spec Coverage Analysis

| Spec Requirement | Coverage | Consistency |
|-----------------|----------|-------------|
| Endpoint path | ✅ Covered | ❌ **CONFLICT**: AC-1 vs rest of docs |
| JWT + Rate Limiter | ✅ Covered | ✅ Consistent |
| Zod validation | ✅ Covered | ✅ Consistent |
| Product ownership | ✅ Covered | ✅ Consistent |
| RAG context | ✅ Covered | ✅ Consistent |
| SEO metadata (meta_title) | ✅ Covered | ❌ **FORMAT CONFLICT** |
| OG tags | ✅ Covered | ❌ **FORMAT CONFLICT** |
| Schema markup | ✅ Covered | ❌ **FORMAT CONFLICT** |
| Credit AFTER LLM | ✅ Covered | ✅ Consistent |
| Rate limiting | ✅ Covered | ✅ Consistent |

---

## Task Completion Status

All tasks in tasks.md are documented but **cannot be verified as complete** until code is implemented. This is a SDD-only verification.

---

## Required Fixes for Approval

### Fix 1: SPEC.md line 136
**Change from**:
```markdown
- `POST /api/ai/seo/optimize` returns `200`
```
**Change to**:
```markdown
- `POST /api/ai/product/seo` returns `200`
```

### Fix 2: SPEC.md Response Format (lines 226-247)
Unify with tasks.md response format. Replace the SPEC.md interface with one that matches tasks.md:

```typescript
// Success response
interface SeoOptimizerResponse {
  metaTitle: string;           // 30-60 chars
  metaDescription: string;     // 100-155 chars
  ogTitle: string;             // max 60 chars
  ogDescription: string;       // max 100 chars
  ogImageUrl?: string;         // URL
  schemaMarkup: Record<string, unknown>; // JSON-LD as parsed object
  keywords: string[];          // 5-10 keywords
  canonicalUrl?: string;       // canonical URL
  sources?: Array<{            // optional RAG context
    source_type: 'lesson' | 'faq' | 'review';
    source_id: string;
    content: string;
    similarity: number;
  }>;
}
```

### Fix 3: SPEC.md Response Example (lines 253-280)
Update JSON example to match unified format with camelCase and flat OG fields.

### Fix 4: DESIGN.md lines 217-218
**Change from**:
```typescript
if (creditError instanceof Error && (creditError.message.includes('insufficient') || creditError.message.includes('insuficientes'))) {
  throw new AppError('Insufficient credits', 402);
}
```
**Change to**:
```typescript
if (creditError instanceof Error && creditError.message.includes('insuficientes')) {
  throw new AppError('Créditos insuficientes', 402);
}
```

---

## Exact Blockers

| Blocker | Severity | File | Lines |
|---------|----------|------|-------|
| Endpoint conflict | CRITICAL | SPEC.md | 136 |
| Response format mismatch | CRITICAL | SPEC.md | 226-247, 253-280 |
| Error message EN/ES mix | WARNING | DESIGN.md | 217-218 |

---

## Artifacts

| Artifact | Path |
|----------|------|
| SDD directory | `docs/project/ai-features/sdd/seo-optimizer/` |
| SPEC.md | `docs/project/ai-features/sdd/seo-optimizer/SPEC.md` |
| DESIGN.md | `docs/project/ai-features/sdd/seo-optimizer/DESIGN.md` |
| tasks.md | `docs/project/ai-features/sdd/seo-optimizer/tasks.md` |
| PROPOSAL.md | `docs/project/ai-features/sdd/seo-optimizer/PROPOSAL.md` |

---

## Skill Resolution

- **Paths injected**: None
- **Resolution**: `none` — SDD document verification does not require code execution