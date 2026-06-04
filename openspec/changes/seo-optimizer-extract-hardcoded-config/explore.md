# Explore: Extract hardcoded brand/URL/OG-image from AI services

**Change**: seo-optimizer-extract-hardcoded-config
**Date**: 2026-06-03
**Investigator**: sdd-explore

## Problem Statement

A pre-commit GGA review on PR #52 (`b885772` — `fix(seo-optimizer): enforce metaTitle minimum 30 chars per SPEC §1`) flagged three PREFER-level suggestions inside `backend/src/services/ai/seo-optimizer.service.ts` that the author fixed the minimum-length bug for but did not address:

1. **Line 339** — `canonicalUrl` is hardcoded to `https://crema.com/product/${input.productId}`. There is no env hook, so the canonical URL is wrong in every non-production environment (local, staging, preview deploys, white-label installs) and cannot be customised per deployment.
2. **Line 356** — `ogSiteName: 'Crema'` is a brand string baked into the service. Any future rebrand or multi-tenant deployment has to ship a code change.
3. **Line 354** — `ogImageUrl: parsed.ogImageUrl ?? ''` silently masks a missing OG image. If the LLM fails to return `ogImageUrl`, the consumer of the API gets an empty string with no signal that the field is absent, which then propagates as a blank preview card in social shares.

These were classified as PREFER (not REJECT) because the service still works in production, but they violate the project's "no hardcoded config, no silent failure" principles. The decision to address them was formalised in [issue #53](https://github.com/egkike/crema/issues/53) (label: `enhancement`); the scope agreed in that issue is the source of truth for this explore.

The core question this explore must answer: **is this anti-pattern local to `seo-optimizer`, or systemic across AI services?** If systemic, a larger refactor is justified. If local, a one-PR fix is enough. This dictates scope, effort, and whether a chained-PR strategy is needed.

## Investigation

### 1. Hardcoded `crema.com` instances (production code, case-insensitive)

Searched `backend/src/` excluding test files, env defaults, and admin emails. Production hits only:

| File | Line | Code | Context (lines) | Notes |
|------|------|------|-----------------|-------|
| `backend/src/services/ai/seo-optimizer.service.ts` | 339 | `` const canonicalUrl = `https://crema.com/product/${input.productId}`; `` | 338–339 — comment `// 11. Build canonical URL` then the assignment | The anti-pattern: hardcoded canonical URL with no config hook |
| `backend/src/services/payout.service.ts` | 466, 488 | `to: 'admin@crema.com'` | Surrounding admin payout notification | Comment on line 466 already notes "Esto también podrías traerlo de system_settings ('admin_email')" — known anti-pattern, not in scope of this change |
| `backend/src/config/index.ts` | 47 | `EMAIL_FROM: z.string().default('"Crema" <noreply@crema.com>')` | env schema default | Acceptable: env default that the user can override; not the anti-pattern we are fixing |
| `backend/src/__tests__/setup.ts` | 253 | `smtp: { ... from: 'test@crema.com' }` | Test setup | Acceptable: test fixture |
| `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` | 22, 136 | `canonicalUrl: 'https://crema.com/product/...'` | Mocked service response in route test | **In scope** — these test fixtures will need to match the new config-driven value |
| `backend/src/__tests__/services/email.service.test.ts` | 20, 22 | `from: 'noreply@crema.com'`, `frontendUrl: 'https://crema.com'` | Email service test | Acceptable: test fixture |

**Verdict**: Only one production hit (`seo-optimizer.service.ts:339`). Two test hits in `seo-optimizer.routes.test.ts` will need updating alongside the fix.

### 2. Hardcoded `'Crema'` brand instances (in `backend/src/services/`)

| File | Line | Code | Category | Notes |
|------|------|------|----------|-------|
| `backend/src/services/ai/seo-optimizer.service.ts` | 356 | `ogSiteName: 'Crema',` | **User-facing (anti-pattern)** | OG site name in social-share metadata — must be config-driven |
| `backend/src/services/ai/seo-optimizer.service.ts` | 475 | `name: 'Crema',` | **User-facing (anti-pattern)** | Schema.org `Course.provider.name` in JSON-LD emitted to crawlers — same root cause as line 356 |
| `backend/src/services/ai/memory.service.ts` | 4 | `* Manages vector embeddings for semantic search across Crema content` | Acceptable (comment) | Doc comment, not runtime |
| `backend/src/services/ai/concierge.service.ts` | 37, 45 | `You are Crema's support assistant...` / `Use ONLY information from the Crema platform` | **Borderline** | Sent to the LLM as a system prompt — influences model behaviour but is not directly visible to end users. Note: GGA did not flag this, and changing it requires a config key (e.g. `support.brand_name`). Mentioned in Open Questions. |
| `backend/src/services/twoFactor.service.ts` | 18 | `issuer: 'Crema',` | **Acceptable** | TOTP `issuer` field — this is the standard specced value that authenticator apps display. Changing it would break user TOTP setups. |
| `backend/src/services/email.service.ts` | 39 | `from: `"Crema" <${config.smtp.from}>`` | **Acceptable** | Display name in SMTP From header is hardcoded but `config.smtp.from` is itself configurable; acceptable per project convention. Other `'Crema'` mentions in `email.service.ts` lines 85, 166, 188, 197, 223, 240, 257, 339, 416, 436 are user-facing email body copy — these are out of scope (would require i18n / templating, a much larger change). |
| `backend/src/services/commission.service.ts` | 90, 97 | `// ...que Crema debe pagar...` | Acceptable (comment) | Internal business-logic comments |
| `backend/src/services/subscription.service.ts` | 62, 121 | `` `Plan ${plan.name} - Crema` `` | **Acceptable for now** | Plan naming suffix — not SEO/OG-visible, not in scope |
| `backend/src/services/export.service.ts` | 41–43, 69 | CSV column labels like `'Comisión Crema (Bruta)'` | **Acceptable for now** | Spanish UI label in admin exports — not SEO/OG-visible |

**Verdict**: The user-facing anti-patterns are concentrated in `seo-optimizer.service.ts` (lines 356, 475). Other `'Crema'` mentions are either comments, internal labels, or TOTP/SMTP boilerplate. Concierge's system prompt is the only borderline case and is **out of scope** for this change (would require `support.brand_name` config + a spec delta).

### 3. Silent-mask `?? ''` / `?? null` patterns in `backend/src/services/ai/`

| File | Line | Code | Risk |
|------|------|------|------|
| `backend/src/services/ai/seo-optimizer.service.ts` | 354 | `ogImageUrl: parsed.ogImageUrl ?? '',` | **HIGH** — user-facing OG image. Empty string renders as a broken share card. |
| `backend/src/services/ai/seo-optimizer.service.ts` | 428 | `metaTitle: parsed.metaTitle ?? '',` | **LOW** — internal `parseLLMResponse` failure path. The outer generator already throws `AppError` at line 316 if the truncated `metaTitle.length < 30`, so the mask is unreachable on the happy path and the empty string is the documented "LLM gave nothing" signal that triggers the throw. |
| `backend/src/services/ai/seo-optimizer.service.ts` | 429 | `metaDescription: parsed.metaDescription ?? '',` | **LOW** — same context as 428. The mask is internal parse-defensive code, not a user-facing field. |
| `backend/src/services/ai/agents.service.ts` | 1967, 1968 | `narrative: llmResult?.narrative ?? null`, `recommendedAction: llmResult?.recommendedAction ?? null` | **LOW** — internal agent-state fields. Caller knows `null` means absent. |
| `backend/src/services/ai/interactive-agent.service.ts` | 231, 232, 234 | `fieldPlaceholder ?? null`, `fieldOptions ?? null`, `fieldValidation ?? null` | **LOW** — internal form-builder state. `null` is the explicit "field omitted" signal. |
| `backend/src/services/ai/denunciation.service.ts` | 80 | `policies.map(p => \`Política: ${(p.metadata?.title || p.content?.substring(0, 80)) ?? ''}\`...\`)` | **LOW** — internal prompt-building. The `?? ''` guards an unsafe `||` chain, no downstream contract depends on the empty-string signal. |

**Verdict**: Only `ogImageUrl: parsed.ogImageUrl ?? ''` is a user-facing field with a real silent-failure risk. The other masks are either internal parse fallbacks (covered by outer validation) or prompt-building glue. **Do not over-reach** — fixing all `?? ''` patterns would create scope creep and is not what the user asked for.

### 4. Existing config patterns

**Two parallel config systems exist:**

#### 4.1. Env-driven `config` object (`backend/src/config/index.ts`)

- Validated with `zod` against `envSchema`.
- **Convention**: `SCREAMING_SNAKE_CASE` env vars → `camelCase` config keys.
- **Already has**:
  - `APP_URL` → `config.frontendUrl` (line 41, 182)
  - `API_BASE_URL` → `config.apiBaseUrl` (line 40, 181)
  - `EMAIL_FROM` → `config.smtp.from` (line 47, 163)
- **`.env.example` lists** `APP_URL=http://localhost:5173` and `API_BASE_URL=http://localhost:3000` (lines 4–5).
- **No `BRAND_NAME`, `SITE_NAME`, or `OG_IMAGE_DEFAULT` exists** in env or config.

#### 4.2. DB-backed `configService` (`backend/src/services/config.service.ts`)

- Reads from `app_config` table via `configRepository`, with Redis cache (5 min TTL) and `.env` fallback.
- **Allowlist-driven**: keys must be in `ALLOWED_CONFIG_KEYS` (lines 17–67). Adding a new key requires editing this allowlist.
- **Naming convention**: `category.subkey` (e.g. `ai.embedding_dimensions`, `support.system_prompt`).
- The `seo-optimizer` service already uses this pattern for `seo_optimizer.temperature` / `seo_optimizer.max_tokens` / `seo_optimizer.model` (lines 67–69), and it does **not** add `seo_optimizer.*` to the allowlist — those are duplicates of existing `ai.*` keys read as overrides. Worth confirming in spec, but not a blocker.

**Recommended convention for the new keys**: env-driven `config` (since the values are deployment-level constants, not user-tunable knobs that benefit from a DB admin UI). Mirror the existing `APP_URL` → `config.frontendUrl` pattern. Suggested keys:

- `BRAND_NAME` → `config.brandName` (default `'Crema'`)
- `OG_IMAGE_DEFAULT` → `config.ogImageDefault` (optional, used as fallback when LLM omits the field)
- **Reuse** `config.frontendUrl` for canonical URL — no new env var needed (already maps from `APP_URL`).

### 5. Survey of AI services

`backend/src/services/ai/` contains 14 service files (one is `index.ts` barrel) plus `content/` subdirectory with 4 service files (3 paired with `.test.ts`). For each: does it produce user-facing SEO/OG/canonical/brand content?

| File | Purpose | Produces SEO/OG/canonical/brand? |
|------|---------|-----------------------------------|
| `seo-optimizer.service.ts` | Generate SEO meta tags + JSON-LD for product pages | **YES** — the only one |
| `llm.service.ts` | LLM provider abstraction (OpenAI / Anthropic / Gemini / Ollama / simulator) | No — provider wrapper. Hardcoded URLs at lines 245, 394, 470, 557, 750, 846 are external API endpoints, not user-facing. |
| `embedding.service.ts` | OpenAI embeddings for vector search | No — line 34 is `https://api.openai.com/v1` (external API) |
| `memory.service.ts` | Vector DB + semantic search over user content | No — search/RAG only. "Crema" in line 4 is a doc comment. |
| `concierge.service.ts` | LLM-powered support chatbot | **Borderline** — uses `'Crema'` in system prompt (lines 37, 45) but does not emit structured user-facing SEO/OG/canonical. Different problem domain. |
| `agents.service.ts` | Multi-step agent orchestration | No — agent reasoning state |
| `interactive-agent.service.ts` | Dynamic form/interactive agent | No — form schema generation |
| `affiliate-chat.service.ts` | Affiliate-program LLM chat | No — chat text |
| `denunciation.service.ts` | Moderation / report flow | No — moderation text |
| `qa.service.ts` | LLM Q&A over content | No — chat text |
| `review.service.ts` | LLM review summarization | No — summary text |
| `credits.service.ts` | AI credit balance / consumption | No — quota accounting |
| `content/content-assistant.service.ts` | Content generation helper | No — text generation |
| `content/content-reader.service.ts` | Content ingestion / parsing | No — text extraction |
| `content/quiz-generator.service.ts` | Quiz generation | No — quiz schema |
| `content/transcription.service.ts` | Audio transcription (Whisper) | No — line 333 is OpenAI Whisper endpoint |

**Verdict**: `seo-optimizer.service.ts` is the **only** AI service that emits user-facing SEO/OG/canonical/brand output. The pattern is **local, not systemic**.

## Findings

- **The anti-pattern is LOCAL to `seo-optimizer.service.ts`, not systemic.** Of 18 AI service files surveyed, only this one generates OG / canonical / Schema.org / brand-visible content. Other AI services are text-generation or RAG plumbing; their hardcoded URLs are external API endpoints, not user-facing.
- **The `?? ''` anti-pattern is also localized.** The user-facing silent mask is exactly one line (`:354 ogImageUrl`). The other six `?? ''` / `?? null` hits in AI services are either internal parse fallbacks covered by outer validation, or internal prompt-building glue where the empty/null signal is meaningful. Chasing them would be scope creep.
- **Config plumbing is already in place for the URL fix.** `config.frontendUrl` is read from `APP_URL` and is available without any new env var. The brand name and OG image fallback need two new env-driven config keys (`BRAND_NAME`, `OG_IMAGE_DEFAULT`) that follow the existing convention. The `seo-optimizer` already uses both `config` and `configService` for runtime knobs.
- **Two brand hits in `seo-optimizer.service.ts` are not in the original GGA report (line 475, `schema.org provider.name`) but are the same anti-pattern.** The user only mentioned 339/354/356, but line 475 is a third user-facing brand string that should be fixed in the same PR — leaving it would create an obvious inconsistency (ogSiteName config-driven, provider.name hardcoded).
- **Test fixtures will need updating.** `seo-optimizer.routes.test.ts` lines 22 and 136 hardcode `https://crema.com/product/...` in the mocked service response. They will need to match the new config-driven value (likely using `vi.mock` of the config or a test env override).
- **No pre-existing brand/OG config keys.** Searched for `BRAND_NAME`, `SITE_NAME`, `OG_IMAGE` — zero hits. This is a net-new capability, not a unification.
- **Scope estimate**: 1 production file (`seo-optimizer.service.ts`) + 1 test file (`seo-optimizer.routes.test.ts`) + `config/index.ts` (2 new env keys) + `config.service.ts` is **not** required (the env-driven path is sufficient). Estimated diff: **20–35 lines including tests**, well under the 600-line PR review budget. **Chained PRs are NOT recommended.**

## Options

### Option A — Single PR, localized to seo-optimizer + config

**Scope**:
- `backend/src/config/index.ts`: add `BRAND_NAME` and `OG_IMAGE_DEFAULT` env keys with sensible defaults.
- `backend/src/services/ai/seo-optimizer.service.ts`: replace hardcoded `https://crema.com` with `config.frontendUrl`; replace `'Crema'` (lines 356, 475) with `config.brandName`; replace `parsed.ogImageUrl ?? ''` with `parsed.ogImageUrl ?? config.ogImageDefault` (per Resolved Decision §1).
- `backend/src/__tests__/routes/seo-optimizer.routes.test.ts`: update mocked responses to derive `canonicalUrl` from `config.frontendUrl`; add a new test case that verifies the brand name comes from config.
- `backend/.env.example`: document the two new env keys.

- **Effort**: Low (1–2 hours of code + tests).
- **Pros**: Smallest blast radius, fastest path to clean, single review, well under 600-line budget.
- **Cons**: Does not preempt the same anti-pattern appearing in future services (e.g. a future "white-label product page" service). But that is a YAGNI risk — there is no second case today.
- **Risk to address**: The line 475 `schema.org provider.name` is not in the user's GGA list. The change should still include it because it is the same anti-pattern in the same file; leaving it would look like a deliberate inconsistency.

### Option B — Single PR with a generic `brand` config module

Extract brand/URL/OG-image config to a dedicated `backend/src/config/brand.ts` module that exports a typed `brandConfig` object, with the seo-optimizer consuming it. Same scope as A but with an indirection layer.

- **Effort**: Low–Medium.
- **Pros**: Pre-paved path for future services that need the same constants.
- **Cons**: Premature abstraction. The project uses direct `config` imports everywhere (no DI, no DI container — see `AGENTS.md`). Adding a new abstraction layer for one consumer is a YAGNI violation against the existing convention.
- **Verdict**: Reject. Option A is more consistent with the project's "small components, no premature abstractions" rule.

### Option C — Skip / defer

Mark the GGA findings as accepted (PREFER level, not REJECT) and close them.

- **Pros**: Zero work.
- **Cons**: The canonical URL is genuinely broken in non-prod environments today (a developer running locally will produce canonicals pointing to `crema.com`). That is more than a style issue — it is a real SEO bug for any non-prod deployment or preview environment. Deferring costs a future ticket when the bug actually breaks something visible.

## Recommendation

**Option A — single PR, localized.** The pattern is local (confirmed by surveying 18 AI service files), the config plumbing already exists (`config.frontendUrl` from `APP_URL`), the diff is ~25 lines, and it is well under the 600-line budget. Include line 475 (`schema.org provider.name`) in the same fix since it is the same anti-pattern in the same file — splitting it out would create an obvious inconsistency.

The fix should:
1. Add `BRAND_NAME` (default `'Crema'`) and `OG_IMAGE_DEFAULT` (optional) to `config/index.ts`.
2. Replace `https://crema.com` with `config.frontendUrl` in `seo-optimizer.service.ts:339`.
3. Replace both `'Crema'` literals (lines 356, 475) with `config.brandName`.
4. Replace `parsed.ogImageUrl ?? ''` with explicit fallback to `config.ogImageDefault` (per Resolved Decision §1).
5. Update `seo-optimizer.routes.test.ts` mocked responses to use the same config-driven values.
6. Add a small unit test that verifies the brand and canonical URL come from config, not from hardcoded literals.
7. Document the two new env keys in `.env.example`.

**Do not** include concierge.service.ts system-prompt brand strings in this change — they are a different problem (LLM behaviour) and out of scope.

## Next Steps

If the user approves this exploration and wants to formalize it:

1. **Open a GH issue** (use the `issue-creation` skill): title `fix(seo-optimizer): extract hardcoded brand/canonical/og-image to config`, body summarising this explore's Findings section.
2. **Run `sdd-propose`** with change name `seo-optimizer-extract-hardcoded-config`. The proposal should:
   - Reference this explore artifact
   - Confirm the four GGA PREFER findings + the line 475 bonus finding
   - Propose Option A as the chosen approach
   - List the rollback plan (revert the PR; no DB migration, no env migration since new keys have defaults)
3. **Run `sdd-spec`** to write delta specs under `openspec/changes/seo-optimizer-extract-hardcoded-config/specs/`. Likely domains: `seo-optimizer` (delta) and possibly `config` (delta for new keys).
4. **Run `sdd-design`** — should be short; the design is "read from `config` object, mirror the existing `APP_URL` → `config.frontendUrl` pattern."
5. **Run `sdd-tasks`** — forecast should show well under 600 lines, no chained PRs needed.
6. **Run `sdd-apply`** on a single feature branch `feat/seo-optimizer-extract-hardcoded-config`. The PR should:
   - CODE: `config/index.ts` + `seo-optimizer.service.ts` (under 50 lines changed)
   - TESTS: `seo-optimizer.routes.test.ts` + a new unit test file (under 100 lines)
   - DOCS: `backend/.env.example` (push direct to master)
7. **`sdd-verify` + `sdd-archive`**.

## Resolved Decisions (from issue #53 scope + 2026-06-03 sync)

All 5 questions below were resolved through the conversation that produced [issue #53](https://github.com/egkike/crema/issues/53). The resolutions here are binding input for `sdd-propose`.

1. ✅ **OG image fallback behaviour** (line 354): **(a) fall back to `config.ogImageDefault`**. Most user-friendly (always have a share card) and mirrors the existing `APP_URL` pattern. The DB-backed `configService` is not used (see decision 4 below).

2. ✅ **Line 475 (`schema.org provider.name`)**: **YES, include**. Same anti-pattern, same file, same fix. Splitting it out would create an obvious inconsistency between `ogSiteName` (config-driven) and `provider.name` (hardcoded).

3. ✅ **Concierge system-prompt brand strings** (`concierge.service.ts` lines 37, 45): **OUT OF SCOPE**. Different problem domain (LLM system-prompt templating, not user-facing output). The DB-backed `configService` already provides `support.system_prompt` as a runtime override, which covers the admin use case without further work.

4. ✅ **DB-config allowlist (`ALLOWED_CONFIG_KEYS` in `config.service.ts`)**: **ENV-ONLY**. The new keys are deployment-level constants, not user-tunable knobs. Adding them to the allowlist would add admin-UI surface area without a clear use case. Mirrors the convention used by `APP_URL` and `EMAIL_FROM`.

5. ✅ **Test strategy for `seo-optimizer.routes.test.ts`**: **`vi.mock` of the `config` module** to inject a known value. Cleaner than depending on env, matches the project's existing test conventions. Implementation detail for `sdd-tasks`.
