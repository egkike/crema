# Design: SEO Optimizer — Extract Hardcoded Config

**Change**: `seo-optimizer-extract-hardcoded-config` | **Capability**: `seo.optimizer` | **PRD Ref**: §4.12

## Overview

Surgical refactor: replace 4 hardcoded values in `seo-optimizer.service.ts` with reads from the env-driven `config` object. Two new Zod-enforced env keys (`BRAND_NAME`, `OG_IMAGE_DEFAULT`) follow the existing `APP_URL` → `frontendUrl` pattern. No new abstractions, no DB changes, no DI — the service already imports `configService` for runtime knobs; the `config` import sits alongside it. Total diff ~30 lines, single PR.

## Architecture Context

The `seo-optimizer` service has two configuration pathways:
- **DB-backed `configService`**: runtime-tunable knobs (temperature, model, rate limit)
- **Env-driven `config`**: deployment-level constants (frontend URL, brand name, OG fallback)

This change adds the second path to the service. It is the **fifth** AI service to import `config` (after `llm.service.ts`, `embedding.service.ts`, `transcription.service.ts`, `denunciation.service.ts`). The `content/*` services use `aiContentConfig` (a separate `ai-content.config` module) and the rest use `configService` (DB-backed) — neither fits the deployment-level-constant nature of `BRAND_NAME` / `OG_IMAGE_DEFAULT` / `APP_URL`. An 18-file survey confirmed no other AI service emits user-facing SEO/OG/brand output.

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
| `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` | Modify | Add `vi.mock('../../config', ...)` at the top (after the service mock at line 9) as a **safety net** — injects `frontendUrl`, `brandName`, `ogImageDefault`. Does NOT change fixtures (lines 22, 136) and does NOT add new test cases — the service is already mocked at line 9, so the route test verifies pass-through only. The new service-level test in Task 1 step 6 covers config-driven behavior. |
| `backend/.env.example` | Modify | +2 lines after `APP_URL`: `BRAND_NAME` and `OG_IMAGE_DEFAULT` with inline comments. |

## Type Contract

**Confirmed**: `SEOOptimizerResponse.data.ogImageUrl: string` (required, not nullable), where `data: SEOOptimizerOutput`. The empty string `''` is the documented "no OG image available" signal at the API boundary. Consumers SHALL treat `''` as "omit the `og:image` meta tag" — not as an error.

```typescript
// In SEOOptimizerOutput interface (line 43): unchanged
ogImageUrl: string;
```

## Test Strategy

**Approach (split between two test files):**

**1. Route test (sanity-only)** — `backend/src/__tests__/routes/seo-optimizer.routes.test.ts`
- `vi.mock('../../config', ...)` is a **safety net** to fail fast (with a clear module error) if the route ever reads `config` directly without going through the service.
- The service is already mocked at line 9, so the config mock does not influence the response — it only validates that route code does not bypass the service to access config.
- No new assertions — pre-existing assertions (auth, response shape, error handling) are unchanged.
- No fixture changes — `canonicalUrl: 'https://crema.com/product/...'` (lines 22, 136) exactly matches the mocked service response; changing them to reference `${config.frontendUrl}` would cause `ReferenceError: config is not defined` because vitest factory callbacks have isolated module scope (the `config` identifier is not in scope inside the `vi.mock('../../services/ai/seo-optimizer.service', () => ({ ... }))` factory).

**2. Service-level unit test (canonical for config-driven behavior)** — `backend/src/__tests__/services/seo-optimizer.service.test.ts` (new, Task 1 step 6)
- `vi.mock('../../config', ...)` to inject known `brandName`, `frontendUrl`, `ogImageDefault` values.
- Exercises the **real** service (no service-level `vi.mock`) — verifies the actual fallback chain, brand resolution, canonical URL construction, and schema.org `provider.name` emission. 6 test cases cover: (a) LLM `ogImageUrl` wins, (b) fallback to `config.ogImageDefault`, (c) `''` when both LLM and config are empty, (d) `ogSiteName = config.brandName`, (e) `canonicalUrl` uses `config.frontendUrl`, (f) `schemaMarkup.provider.name = config.brandName` for course type.

## Implementation Order

1. **Config** (`config/index.ts`): foundation — nothing compiles without the new keys. Add `BRAND_NAME` and `OG_IMAGE_DEFAULT` to `envSchema` + export on `config` object.
2. **Service** (`seo-optimizer.service.ts`): 1 new import + 4 surgical replacements. Each replacement is a single-line change with no structural impact. The new service-level test file (`seo-optimizer.service.test.ts`) is created in the same step (Task 1 step 6).
3. **Tests** — two files, see Test Strategy:
   - `seo-optimizer.routes.test.ts` (sanity): add `vi.mock('../../config', ...)` as safety net; no fixture changes, no new assertions.
   - `seo-optimizer.service.test.ts` (new, canonical): `vi.mock('../../config', ...)` + real service exercises the fallback chain (6 test cases).
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
