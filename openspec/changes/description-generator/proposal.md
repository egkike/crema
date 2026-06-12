# Proposal: Description Generator

**Change**: description-generator
**Type**: New feature (AI capability)
**Phase**: B (week 7-8)
**Date**: 2026-06-12
**PRD Ref**: PRD.md §4.11
**Author**: sdd-propose
**Status**: 🚧 IN PROPOSAL

## 1. Intent

Crema's SEO Optimizer (shipped) handles technical SEO — OG tags, schema markup, canonical URLs. But creators still struggle with the **content layer**: what title converts best, how to write a compelling description, which keywords to target. Description Generator fills that gap.

The LLM generates title alternatives, a conversion-optimized description, SEO tags, learning objectives, and a meta description — grounded in the creator's actual product description AND market-validated keywords from RAG over lessons/FAQs/reviews.

## 2. Scope

### In Scope
- New `descriptionGeneratorService` in `services/ai/description-generator.service.ts`
- New shared lib `lib/ai-product-optimizer.lib.ts` (RAG fetch, LLM wrapper, parse, credits — reusable by future SEO Optimizer refactor)
- `POST /api/ai/product/description` endpoint (JWT + product ownership + Zod validation)
- Redis cache by content hash (7-day TTL, no new Postgres table)
- Auto-detect input language; generate output in same language (es/en/pt)
- Rate limiting: `descriptionGeneratorLimiter` (10 req/min)
- Credit cost: `description_generation` = 1 credit (pre-check, deduct on success)
- Output: titles[], description, objectives[], tags[], metaDescription, detectedLanguage, sources[], cached

### Out of Scope
- Frontend UI for editing/accepting generated descriptions (separate SDD)
- Forced language override parameter (MVP: auto-detect only)
- A/B testing of generated descriptions
- Batch generation for multiple products

## 3. Capabilities

### New Capabilities
- `description.generator`: Generate title, description, tags, and learning objectives for product pages from product content + RAG context

### Modified Capabilities
None — new capability, no existing specs modified.

## 4. Approach

**Architecture**: Separate `descriptionGeneratorService` (writes to products table → creator UI) + shared `ai-product-optimizer.lib.ts` (DRY helpers). SEO Optimizer stays independent (feeds landing page renders); both share the lib. No DI container, no decorators — singleton service pattern.

**Cache**: Redis key = `hash(productId + description_normalized + productType + schema_version)`. Cache hit = 0 credits, 0ms LLM. Cache miss = generate, deduct credit, store with 7-day TTL. Hash changes automatically invalidate.

**RAG**: Same pattern as SEO Optimizer — `memoryService.searchSimilar(userId, query, 10, ['lesson', 'faq', 'review'])`.

**TDD**: `strict_tdd: true` in `openspec/config.yaml`. sdd-tasks phase must structure tasks for RED-GREEN-REFACTOR. Enforcement happens in sdd-apply.

## 5. Affected Areas

| Area | Impact | Lines |
|------|--------|-------|
| `lib/ai-product-optimizer.lib.ts` | New | ~150 |
| `services/ai/description-generator.service.ts` | New | ~350 |
| `services/ai/index.ts` | Modified (+capability) | +40 |
| `routes/ai.routes.ts` | Modified (+endpoint) | +30 |
| `schemas/ai.schema.ts` | Modified (+Zod) | +20 |
| `middlewares/rateLimit/rateLimit.ts` | Modified (+limiter) | +20 |
| `services/ai/credits.service.ts` | Modified (+op cost) | +5 |
| `__tests__/services/ai/description-generator.service.test.ts` | New | ~250 |
| `__tests__/routes/description-generator.routes.test.ts` | New | ~200 |

**Total**: ~1,065 lines (may need chained PRs for D3=600 budget)

## 6. Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cache key collisions for similar products | Low | Hash includes productId (unique) + normalized description |
| LLM returns wrong-language output | Medium | System prompt enforces output language = detected input language |
| Description too long for database column | Low | Truncate with schema limit enforcement post-generation |
| Shared lib over-engineering for single consumer | Low | Extracted helpers (RAG, parse, credits) already have 2 consumers planned |

## 7. Rollback Plan

1. Comment out capability registration in `services/ai/index.ts` (id: `description-generator`)
2. Comment out `POST /api/ai/product/description` route in `routes/ai.routes.ts`
3. Redis keys expire naturally in 7 days — no cleanup needed
4. No database changes to roll back
5. Revert commit if needed

## 8. Dependencies

- `seo-optimizer` shipped and stable (RAG pattern, credit pattern, rate limiter pattern all proven)
- `memoryService.searchSimilar` available for RAG (`['lesson', 'faq', 'review']`)
- `aiCreditService.getOperationCost()` needs `description_generation` entry
- `llmService.chat()` and `configService` available (same as SEO Optimizer)

## 9. Success Criteria

- [ ] `POST /api/ai/product/description` returns 200 with valid output schema
- [ ] `description.generator` registered in Orchestrator skills registry
- [ ] Cache hit (repeat request) returns `cached: true` in < 50ms
- [ ] Cache miss deducts 1 credit and returns `cached: false`
- [ ] Insufficient credits returns 402 before LLM call
- [ ] Invalid/non-owned productId returns 403
- [ ] Rate limit hit (11th request in 1 min) returns 429
- [ ] `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` all pass
