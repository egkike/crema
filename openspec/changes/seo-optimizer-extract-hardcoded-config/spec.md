# Delta Spec: SEO Optimizer — Extract Hardcoded Config

**Change**: `seo-optimizer-extract-hardcoded-config`
**PRD Ref**: PRD.md §4.12 (SEO Optimizer capability)
**Type**: DELTA to existing `seo.optimizer` capability
**Refs**: [Proposal](proposal.md) · [Explore](explore.md) · [Issue #53](https://github.com/egkike/crema/issues/53)

---

## Purpose

This change removes three hardcoded values from `backend/src/services/ai/seo-optimizer.service.ts` that surfaced as GGA PREFER findings in PR #52 (`b885772`): the canonical URL host, two `'Crema'` brand literals, and a silent OG-image mask. They are replaced by reads from the env-driven `config` object so the service is correct in every deployment (local, staging, preview, white-label, prod) without code changes. The fix is surgical (single file + 2 new env keys + tests + `.env.example`); an 18-file AI services survey confirmed the anti-pattern is local, not systemic, so no further scope is justified.

The change preserves the public response shape (`SEOOptimizerResponse.data.ogImageUrl: string` — required, not nullable, where `data: SEOOptimizerOutput`). The only behavioural change at the API boundary is that `ogImageUrl` now follows an explicit, documented fallback chain: LLM output → `config.ogImageDefault` → `''` (documented "no image available" signal). Operators can inject a default OG image at deploy time via `OG_IMAGE_DEFAULT`; the empty-string is no longer a silent fallback but a documented contract for "no image configured".

---

## Requirements

### Domain: `config`

#### REQ-CON-001: Export `config.brandName` from env

The config module (`backend/src/config/index.ts`) MUST export a top-level `config.brandName: string` derived from a new `BRAND_NAME` env var. `BRAND_NAME` MUST default to the literal `'Crema'` to preserve backward compatibility. The value MUST be non-empty and trimmed of leading/trailing whitespace. Test override strategy: `vi.mock('../../config', () => ({ config: { brandName: 'FooCo', /* … */ } }))`.

#### REQ-CON-002: Export `config.ogImageDefault` from env

The config module MUST export a top-level `config.ogImageDefault: string` derived from a new `OG_IMAGE_DEFAULT` env var. `OG_IMAGE_DEFAULT` MUST default to the empty string `''` (i.e. "no fallback image configured"). The value MUST be trimmed of leading/trailing whitespace; an empty string MUST be allowed and MUST be distinguishable from `undefined` in the Zod schema (use `z.string().default('').transform(s => s.trim())`, not `.optional()`).

#### REQ-CON-003: Reuse `config.frontendUrl` for canonical URLs — no new env var

The canonical URL fix MUST reuse the already-existing `config.frontendUrl` (sourced from `APP_URL`). MUST NOT introduce a new env var (e.g. `CANONICAL_URL_HOST`) for this purpose. `config.frontendUrl` is already trimmed of trailing slashes (line 182 of `config/index.ts`).

#### Scenario: Config validates `BRAND_NAME` default

- **GIVEN** `.env` does not set `BRAND_NAME`
- **WHEN** the config module is imported
- **THEN** `config.brandName` MUST equal `'Crema'`

#### Scenario: Config honours an explicit `BRAND_NAME`

- **GIVEN** `.env` sets `BRAND_NAME=FooCo`
- **WHEN** the config module is imported
- **THEN** `config.brandName` MUST equal `'FooCo'`

#### Scenario: Config returns empty string for unset `OG_IMAGE_DEFAULT`

- **GIVEN** `.env` does not set `OG_IMAGE_DEFAULT`
- **WHEN** the config module is imported
- **THEN** `config.ogImageDefault` MUST equal `''` (not `undefined`, not `null`)

#### Scenario: `.env.example` documents both new keys

- **GIVEN** a fresh checkout of `backend/.env.example`
- **WHEN** a developer reads the file
- **THEN** both `BRAND_NAME` and `OG_IMAGE_DEFAULT` MUST be present with example values and a one-line inline comment

---

### Domain: `seo-optimizer`

#### REQ-SEO-001: Canonical URL is derived from `config.frontendUrl`

The service MUST build the `canonicalUrl` as `` `${config.frontendUrl}/product/${input.productId}` ``. The hardcoded host `https://crema.com` MUST NOT appear anywhere in `seo-optimizer.service.ts`. The result MUST NOT contain a double slash (`//`) after the host — `config.frontendUrl` is already trimmed of trailing `/`.

#### REQ-SEO-002: Brand name is derived from `config.brandName`

The service MUST emit `ogSiteName = config.brandName` in the OG output and MUST emit `provider.name = config.brandName` in the JSON-LD `Course` schema (`buildSchemaMarkup`). The literal string `'Crema'` MUST NOT appear anywhere in `seo-optimizer.service.ts` as a brand identifier. Doc-comments and prompt-building text that reference "Crema" (e.g. function descriptions) are exempt.

#### REQ-SEO-003: OG image follows an explicit fallback chain

The service MUST compute `ogImageUrl` as `parsed.ogImageUrl ?? config.ogImageDefault`. The field type in `SEOOptimizerOutput` (nested under `SEOOptimizerResponse.data`) MUST remain `string` (required, not `string | null`, not `string | undefined`). The empty string `''` is the explicit, documented "no OG image available" signal at the API boundary — consumers SHALL treat `''` as "omit the `og:image` meta tag" rather than as an error. The fallback chain MUST be applied exactly once; no further `?? ''` mask downstream.

#### REQ-SEO-004: `config` import is added to the service

`backend/src/services/ai/seo-optimizer.service.ts` MUST import `config` from `../../config` to read the env-driven values required by REQ-SEO-001, REQ-SEO-002, and REQ-SEO-003. The import MUST follow the project's universal convention: `import { config } from '../../config';` (no alias — over 50 occurrences of this plain form across the backend, zero occurrences of any aliased form like `import { config as appConfig }`). The import MUST be placed adjacent to the existing `configService` import (line 12) so both configuration sources are visible in one place. This will make `seo-optimizer.service.ts` the **fifth** AI service to import the env-driven `config` (predecessors: `llm.service.ts`, `embedding.service.ts`, `transcription.service.ts`, `denunciation.service.ts`); the `content/*` services use `aiContentConfig` (a separate `ai-content.config` module) and the rest use `configService` (DB-backed) — neither fits the deployment-level-constant nature of `BRAND_NAME` / `OG_IMAGE_DEFAULT` / `APP_URL`.

#### Scenario: Canonical URL reflects deployment host

- **GIVEN** `config.frontendUrl = 'https://staging.crema.com'`
- **AND** `input.productId = '00000000-0000-0000-0000-000000000001'`
- **WHEN** the service generates SEO metadata
- **THEN** `canonicalUrl` MUST equal `'https://staging.crema.com/product/00000000-0000-0000-0000-000000000001'`
- **AND** the string MUST NOT contain `crema.com` host unless the deployment host is `crema.com`

#### Scenario: `ogSiteName` reflects brand config

- **GIVEN** `config.brandName = 'FooCo'`
- **WHEN** the service generates SEO metadata
- **THEN** `ogSiteName` MUST equal `'FooCo'`

#### Scenario: Schema.org provider name reflects brand config

- **GIVEN** `config.brandName = 'FooCo'`
- **AND** `input.productType = 'course'`
- **WHEN** the service builds JSON-LD
- **THEN** `schemaMarkup.provider.name` MUST equal `'FooCo'`

#### Scenario: OG image falls back to config default

- **GIVEN** `config.ogImageDefault = '/img/og-default.png'`
- **AND** the LLM response does not include `ogImageUrl`
- **WHEN** the service generates SEO metadata
- **THEN** `ogImageUrl` MUST equal `'/img/og-default.png'`

#### Scenario: OG image honours LLM output over config default

- **GIVEN** `config.ogImageDefault = '/img/og-default.png'`
- **AND** the LLM response includes `ogImageUrl = 'https://cdn.example.com/x.jpg'`
- **WHEN** the service generates SEO metadata
- **THEN** `ogImageUrl` MUST equal `'https://cdn.example.com/x.jpg'`

#### Scenario: OG image is empty string when nothing is configured

- **GIVEN** `config.ogImageDefault = ''` (unset)
- **AND** the LLM response does not include `ogImageUrl`
- **WHEN** the service generates SEO metadata
- **THEN** `ogImageUrl` MUST equal `''` (documented "no image" signal — not `null`, not `undefined`)

#### Scenario: Service returns config-driven brand and canonical (verified at service level)

- **GIVEN** a `vi.mock` of the config module that sets `config.brandName = 'TestBrand'` and `config.frontendUrl = 'https://test.crema.com'`
- **AND** the **real** `seo-optimizer` service is invoked (no service-level `vi.mock`)
- **WHEN** the service generates SEO metadata
- **THEN** the result `ogSiteName` MUST equal `'TestBrand'`
- **AND** the result `canonicalUrl` MUST start with `'https://test.crema.com/product/'`
- **AND** the result `schemaMarkup.provider.name` (for course type) MUST equal `'TestBrand'`
- **Note**: the route test (`seo-optimizer.routes.test.ts`) mocks the service, so it cannot verify config-driven values directly. The route test's job is to verify route plumbing (auth, response shape, error handling); the service-level test (created in `tasks.md` Task 1 step 6) is the canonical place to verify that the service reads from config. The route test's only added element is a `vi.mock('../../config', ...)` safety net at the top of the file — no fixture changes, no new assertions.

---

## Out of Scope

The following items are explicitly excluded from this change. They share the same anti-pattern category but are deferred to separate change requests:

1. **`parseLLMResponse` internal `?? ''` masks at lines 428-429** (`metaTitle`, `metaDescription` parse fallbacks). **Risk: LOW** — the outer generator throws `AppError` at line 316 when `metaTitle.length < 30`, so the masks are unreachable on the happy path. They are internal parse-defensive code, not user-facing fields. Aligns with [issue #53](https://github.com/egkike/crema/issues/53) acceptance exclusion.
2. **Concierge system-prompt brand strings** (`concierge.service.ts` lines 37, 45). Different problem domain (LLM behaviour shaping, not user-facing output). The DB-backed `configService.support.system_prompt` already provides admin override.
3. **TOTP issuer** (`twoFactor.service.ts:18`, `issuer: 'Crema'`). Specced value that authenticator apps display — changing it would break user TOTP setups.
4. **SMTP display name** (`email.service.ts:39`, `"Crema" <${config.smtp.from}>`). The `config.smtp.from` is already configurable; the display name is acceptable per project convention.
5. **Email body brand mentions** (`email.service.ts` lines 85, 166, 188, 197, 223, 240, 257, 339, 416, 436). Spanish UI copy — requires i18n / templating (much larger change).
6. **Payout admin email** (`payout.service.ts` lines 466, 488, `to: 'admin@crema.com'`). Already commented in source as a known anti-pattern; deferred to a separate ticket.
7. **DB-config allowlist** (`ALLOWED_CONFIG_KEYS` in `config.service.ts`). New keys are env-driven per the project's `APP_URL` / `EMAIL_FROM` convention; adding to the allowlist would create admin-UI surface area without a clear use case.
8. **Subscription / export / commission services** — their `'Crema'` mentions are internal labels or business-logic comments, not user-facing SEO/OG output.
9. **`config/index.ts` DB allowlist for new keys** — see item 7.
10. **Type contract change to `string | null` or `string | undefined`** — see glossary entry for the chosen `string` (required, `''` as documented "no image" signal) decision and its justification.

---

## Glossary

| Term | Definition |
|------|------------|
| **`ogImageUrl` type contract** | Chosen: `SEOOptimizerResponse.data.ogImageUrl: string` (required, not nullable), where `data: SEOOptimizerOutput`. The empty string `''` is the explicit, documented "no OG image available" signal at the API boundary — consumers SHALL treat `''` as "omit the `og:image` meta tag". Justification: preserves the existing public contract (no breaking change for current consumers), lifts the silent-mask anti-pattern by making the empty case a documented contract, and gives operators a deploy-time injection point (`OG_IMAGE_DEFAULT`) without forcing a type-system rewrite. Rejected alternatives: `string \| null` (inconsistent with sibling required string fields), `string \| undefined` (same downstream burden as `''` with worse ergonomics). |
| **Fallback chain** | Three-tier resolution for `ogImageUrl`: (1) `parsed.ogImageUrl` from LLM, (2) `config.ogImageDefault` from `OG_IMAGE_DEFAULT` env, (3) `''` literal. Tier 1 wins when present; tier 2 is the operator default; tier 3 is the documented "nothing configured" signal. |
| **Config-driven value** | A value read at request time from the env-validated `config` object (`backend/src/config/index.ts`) — not a hardcoded literal, not the DB-backed `configService`. |
| **GGA PREFER finding** | A non-blocking style/consistency observation from GGA (Gentleman Guardian Angel) review. Distinct from `REJECT` (blocks merge). PREFER items are encouraged to be addressed when the diff is small. |

---

## Acceptance Criteria

- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` (vitest) passes — including the updated `seo-optimizer.routes.test.ts` and any new unit tests
- [ ] Grep for the literal string `'Crema'` in `backend/src/services/ai/seo-optimizer.service.ts` returns no production-code hits (doc-comments and prompt-building text exempt)
- [ ] Grep for the literal string `https://crema.com` in `backend/src/services/ai/seo-optimizer.service.ts` returns no hits
- [ ] `config.brandName` and `config.ogImageDefault` are exported from `backend/src/config/index.ts` with Zod validation
- [ ] `backend/.env.example` documents `BRAND_NAME` and `OG_IMAGE_DEFAULT`
- [ ] `ogImageUrl` type contract remains `string` (required, not nullable); the empty string `''` is the documented "no image" signal
