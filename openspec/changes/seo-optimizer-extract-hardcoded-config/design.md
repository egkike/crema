# Design: SEO Optimizer — Extract Hardcoded Config

**Change**: `seo-optimizer-extract-hardcoded-config` | **Capability**: `seo.optimizer` | **PRD Ref**: §4.12

## Overview

Surgical refactor: replace 4 hardcoded values in `seo-optimizer.service.ts` with reads from the env-driven `config` object. Two new Zod-enforced env keys (`BRAND_NAME`, `OG_IMAGE_DEFAULT`) follow the existing `APP_URL` → `frontendUrl` pattern. No new abstractions, no DB changes, no DI — the service already imports `configService` for runtime knobs; the `config` import sits alongside it. Total diff ~30 lines, single PR.

## Architecture Context

The `seo-optimizer` service has two configuration pathways:
- **DB-backed `configService`**: runtime-tunable knobs (temperature, model, rate limit)
- **Env-driven `config`**: deployment-level constants (frontend URL, brand name, OG fallback)

This change adds the second path to the service. It is the **second** AI service to import `config` (after `denunciation.service.ts`). The pattern is local — an 18-file survey confirmed no other AI service emits user-facing SEO/OG/brand output.

## Data Flow

### OG Image Fallback Chain (3-tier)

```
1. parsed.ogImageUrl   (LLM output)   → wins if truthy
         │
         ▼ (falsy: null | undefined)
2. config.ogImageDefault (env)        → operator default
         │
         ▼ (falsy: '' | undefined)
3. ''                    (documented  → "no image available" signal
         "no image")
```

### Brand Resolution Path

```
config.brandName (BRAND_NAME env → Zod default 'Crema')
       │
       ├── ogSiteName (line 356)
       └── provider.name in JSON-LD Course schema (line 475)
```

### Canonical URL Construction

```
config.frontendUrl (APP_URL env → already trimmed of trailing / by line 182)
       │
       └── `${config.frontendUrl}/product/${input.productId}` (line 339)
```

## Module Changes

| File | Action | Details |
|------|--------|---------|
| `backend/src/config/index.ts` | Modify | +2 Zod schema entries after `APP_URL` (line 41): `BRAND_NAME: z.string().default('Crema').transform(s => s.trim())`, `OG_IMAGE_DEFAULT: z.string().default('').transform(s => s.trim())`. +2 exports on the `config` object after `frontendUrl` (line 182): `brandName`, `ogImageDefault`. |
| `backend/src/services/ai/seo-optimizer.service.ts` | Modify | Line 12: add `import { config } from '../../config';` adjacent to existing `configService` import. Line 339: `` `${config.frontendUrl}/product/${input.productId}` ``. Line 354: `parsed.ogImageUrl ?? config.ogImageDefault`. Line 356: `config.brandName`. Line 475: `config.brandName`. |
| `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` | Modify | Line 22 mock: derive `canonicalUrl` from config; add `ogSiteName: config.brandName`. Line 136 mock: same. +2 new assertions per spec: brand from config, OG fallback chain. |
| `backend/.env.example` | Modify | +2 lines after `APP_URL`: `BRAND_NAME` and `OG_IMAGE_DEFAULT` with inline comments. |

## Type Contract

**Confirmed**: `SeoOptimizerResponse.ogImageUrl: string` (required, not nullable). The empty string `''` is the documented "no OG image available" signal at the API boundary. Consumers SHALL treat `''` as "omit the `og:image` meta tag" — not as an error.

```typescript
// In SEOOptimizerOutput interface (line 43): unchanged
ogImageUrl: string;
```

## Test Strategy

**Approach**: `vi.mock` of `../../config` module to inject known values for `brandName`, `frontendUrl`, and `ogImageDefault`. Test directly returns mocked service response — verifies the route integration (where `vi.mock` influences what the service returns), not the service internals (which `sdd-apply` unit tests separately).

| Scenario | Mock Config | Assertion |
|----------|------------|-----------|
| Canonical URL reflects deployment host | `frontendUrl: 'https://staging.crema.com'` | `canonicalUrl` starts with `https://staging.crema.com/product/` |
| `ogSiteName` reflects brand config | `brandName: 'FooCo'` | `ogSiteName === 'FooCo'` |
| Schema.org provider.name reflects brand | `brandName: 'FooCo'` | `schemaMarkup.provider.name === 'FooCo'` |
| OG image falls back to config default | `ogImageDefault: '/img/og-default.png'` | `ogImageUrl === '/img/og-default.png'` |
| OG image honours LLM output | `ogImageDefault: '/img/og-default.png'` | `ogImageUrl === 'https://cdn.example.com/x.jpg'` |
| OG image empty when nothing configured | `ogImageDefault: ''` | `ogImageUrl === ''` |

**Fixture update pattern** (lines 22, 136):

```typescript
// Before:  canonicalUrl: 'https://crema.com/product/test-id',
// After:   canonicalUrl: `${config.frontendUrl}/product/${PRODUCT_ID}`,
```

## Implementation Order

1. **Config** (`config/index.ts`): foundation — nothing compiles without the new keys. Add `BRAND_NAME` and `OG_IMAGE_DEFAULT` to `envSchema` + export on `config` object.
2. **Service** (`seo-optimizer.service.ts`): 1 new import + 4 surgical replacements. Each replacement is a single-line change with no structural impact.
3. **Tests** (`seo-optimizer.routes.test.ts`): update existing fixtures + add new assertions. Tests verify integration; `sdd-apply` may add a small service-level test for the fallback chain.
4. **Docs** (`backend/.env.example`): 2 documented env keys. This goes in the same feature branch PR since the code changes are tightly coupled (< 30 lines, no chained PR needed).

## Verification

| Gate | Command |
|------|---------|
| TypeScript | `pnpm tsc --noEmit` — 0 errors |
| Lint | `pnpm lint` — 0 errors |
| Tests | `pnpm test` — all pass (updated + new) |
| Grep brand | `grep "'Crema'" backend/src/services/ai/seo-optimizer.service.ts` — only doc-comments + prompt-building text |
| Grep URL | `grep "https://crema.com" backend/src/services/ai/seo-optimizer.service.ts` — 0 hits |

## Edge Cases

1. **`APP_URL` with trailing slash** (e.g. `APP_URL=https://staging.crema.com/`): `config.frontendUrl` is already trimmed of trailing `/` by the `.replace(/\/$/, '')` transform at line 182. Result: `https://staging.crema.com/product/{id}` — no double slash. Low risk.

2. **`OG_IMAGE_DEFAULT` with whitespace** (e.g. `OG_IMAGE_DEFAULT=/img/og.png `): Zod `transform(s => s.trim())` strips leading/trailing whitespace. If the result is empty, it's the documented "no image" signal. Low risk.

3. **LLM returns `ogImageUrl: null`** instead of omitting the field: the `??` operator treats `null` and `undefined` identically — both fall through to `config.ogImageDefault`. The JSON parse at line 432 (`ogImageUrl: parsed.ogImageUrl`) would pass `null` through which `??` at line 354 handles correctly. No special handling needed.

## Rollback

Revert the single PR. No DB migration — no schema changes. New env keys have defaults (`'Crema'`, `''`) that produce identical behaviour to the current hardcoded values when unset; revert is harmless. The only visible difference after revert is that the canonical URL goes back to `https://crema.com` (broken in non-prod) and brand strings are hardcoded again.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `frontendUrl` not yet set in `.env.example` / CI for non-prod deployments | Medium | Keys default to `http://localhost:5173` (already present); CI pipelines set `APP_URL` explicitly. Non-issue for prod. |
| Test mocks drift: `vi.mock` of config replaces the entire module, other services may depend on config values | Low | The test already mocks many modules (seo-optimizer service, credits service, rate limit). Adding config mock is consistent. Only `brandName` and `frontendUrl` are injected; other config fields are irrelevant to this test. |
| `config.brandName` accidentally used where `configService` values are expected | Very Low | Two distinct import paths. The service explicitly imports both; they serve different purposes (deployment constants vs runtime knobs). Review catches misuse. |
