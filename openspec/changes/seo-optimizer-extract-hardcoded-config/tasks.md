# Tasks: SEO Optimizer — Extract Hardcoded Config

**Change**: `seo-optimizer-extract-hardcoded-config` | **Date**: 2026-06-04 | **Status**: proposed
**Refs**: [Proposal](proposal.md) · [Spec](spec.md) · [Design](design.md) · [Explore](explore.md) · [Issue #53](https://github.com/egkike/crema/issues/53) · [PR #52 `b885772`](https://github.com/egkike/crema/pull/52)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~25-35 lines (4 source files + 1 docs file + 1 test file) |
| 600-line budget risk | Low (≈5% of budget) |
| Chained PRs recommended | No |
| Suggested split | Single PR (`fix/seo-optimizer-extract-hardcoded-config`) |
| Delivery strategy | single-pr |
| Chain strategy | pending (no chain — single PR is well under budget) |

**Decision needed before apply**: No
**Chained PRs recommended**: No
**Chain strategy**: pending
**600-line budget risk**: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Config-driven brand + URL + OG fallback in seo-optimizer | PR 1 | Single PR from `master`. Code + tests + `.env.example` together (tightly coupled, < 30 lines of production code). Docs commit pushed direct to `master` per AGENTS.md. |

---

## Task Summary

| # | Task | Files | Lines (est.) | Status |
|---|------|-------|--------------|--------|
| 0 | Add config keys | `backend/src/config/index.ts` | +4 | [ ] |
| 1 | Update service (canonical/brand/OG) | `backend/src/services/ai/seo-optimizer.service.ts` | +2 / -4 | [ ] |
| 2 | Add config mock safety net to route test (config-driven values verified at service level) | `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` | +6 / -0 | [ ] |
| 3 | Document new env keys | `backend/.env.example` | +4 | [ ] |
| 4 | Full verification + grep checks | (gates only) | n/a | [ ] |
| 5 | Update project documentation | `docs/project/reusable-resources.md` + `docs/project/ai-features/PRD.md` | +6 | [ ] |

## Implementation Order

**Locked** (per design.md §Implementation Order): config → service → tests → docs → verification → project-docs.
**TDD strategy**: All test work lives inside Task 1 (the RED → GREEN cycle: write the new service-level test cases first, run them (fail), then apply the service changes (pass)). Task 2 is a separate, independent sanity-only safety-net task that adds `vi.mock('../../config', ...)` to the route test — it does NOT form a red-green cycle with Task 1, and its commit does not block or follow Task 1's commit. Commit order follows task numbering.

---

## Task 0: Add BRAND_NAME and OG_IMAGE_DEFAULT env keys

**Work Unit**: config
**Files**:
- `backend/src/config/index.ts` (modify — 2 Zod entries + 2 exports)

**Implementation Steps**:
1. In `envSchema` (after `APP_URL` at line 41), add:
   ```typescript
   BRAND_NAME: z.string().default('Crema').transform(s => s.trim()),
   OG_IMAGE_DEFAULT: z.string().default('').transform(s => s.trim()),
   ```
2. In the `config` object export (after `frontendUrl` at line 182), add:
   ```typescript
   brandName: env.BRAND_NAME,
   ogImageDefault: env.OG_IMAGE_DEFAULT,
   ```

**Test Strategy (TDD)**: Foundation task — no failing test yet. Spec scenarios for `BRAND_NAME` default and `OG_IMAGE_DEFAULT = ''` are verified in Task 4 via `pnpm tsc --noEmit` (the Zod schema compiles only if the entries are valid).

**Acceptance**: REQ-CON-001, REQ-CON-002
**Verification Gates**: `pnpm tsc --noEmit`, `pnpm lint`
**Commit Message**: `chore(config): add BRAND_NAME and OG_IMAGE_DEFAULT env keys`
**Rollback**: Revert this commit; nothing else depends on the keys until Task 1.

---

## Task 1: Update service to read from `config` + add service-level unit test

**Work Unit**: service
**Files**:
- `backend/src/services/ai/seo-optimizer.service.ts` (modify — 1 import + 4 surgical replacements)
- `backend/src/__tests__/services/seo-optimizer.service.test.ts` (new — service-level unit test for the fallback chain)

**Implementation Steps**:
1. **Line 12 — import** (adjacent to `configService` import): add `import { config } from '../../config';` (unaliased — over 50 occurrences of this plain form across the backend, 0 aliased).
2. **Line 339 — canonical URL**: replace `` `https://crema.com/product/${input.productId}` `` with `` `${config.frontendUrl}/product/${input.productId}` ``.
3. **Line 354 — OG image fallback**: replace `parsed.ogImageUrl ?? ''` with `parsed.ogImageUrl ?? config.ogImageDefault`.
4. **Line 356 — OG site name**: replace `ogSiteName: 'Crema'` with `ogSiteName: config.brandName`.
5. **Line 475 — schema.org provider.name**: replace `name: 'Crema'` with `name: config.brandName`.
6. **Create `backend/src/__tests__/services/seo-optimizer.service.test.ts`** (new file) — service-level unit test that exercises the **real** service with `vi.mock('../../config', ...)` to inject known `config.brandName`, `config.frontendUrl`, and `config.ogImageDefault` values. Test cases (each runs the actual fallback chain — no service-level `vi.mock`):
   - `ogImageUrl` returns the LLM-provided value when present (asserts LLM path wins — first tier of fallback chain).
   - `ogImageUrl` falls back to `config.ogImageDefault` when LLM omits it (asserts second tier).
   - `ogImageUrl` returns `''` (documented "no image" signal) when both LLM and `config.ogImageDefault` are empty (asserts third tier — `config.ogImageDefault` defaults to `''`).
   - `ogSiteName` returns `config.brandName`.
   - `canonicalUrl` returns `` `${config.frontendUrl}/product/${input.productId}` ``.
   - `schemaMarkup.provider.name` returns `config.brandName` (for course type).

**Test Strategy (TDD)**: This is the **RED → GREEN** step. Cycle within this task (NOT paired with Task 2 anymore — see Task 2 for why):
   1. Write the new test cases in the new service-level test file (step 6) FIRST, run them — they FAIL (red) because the service still returns hardcoded values.
   2. Apply this task's service changes (steps 2-5), run them — they PASS (green).
   3. Refactor if needed.
   The contract change is `ogImageUrl: string` (required) — no `string | null` rewrite (rejected by spec glossary).

**Acceptance**: REQ-SEO-001, REQ-SEO-002, REQ-SEO-003, REQ-SEO-004, plus the renamed spec scenario "Service returns config-driven brand and canonical (verified at service level)".
**Verification Gates**: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm vitest run seo-optimizer.service` (new test file passes in isolation)
**Commit Message**: `fix(seo-optimizer): extract hardcoded brand, canonical URL, and OG image to config`
**Rollback**: Revert this commit; service returns to hardcoded values and the new test file is removed; no DB or contract changes.

---

## Task 2: Add config mock safety net to route test (no fallback chain assertions)

**Work Unit**: route-integration
**Files**:
- `backend/src/__tests__/routes/seo-optimizer.routes.test.ts` (modify — add 1 `vi.mock`; do NOT change fixtures or add new test cases)

**Implementation Steps**:
1. **Add `vi.mock('../../config', ...)`** at the top of the file (after the existing `seo-optimizer.service` mock at line 9): inject `frontendUrl: 'https://test.crema.com'`, `brandName: 'TestBrand'`, `ogImageDefault: '/img/og-default.png'`. This mock is a **safety net** — since the service is mocked at line 9, the config mock does not influence the response. However, it ensures the test fails fast (with a clear `ReferenceError` or missing-module error) if the route ever reads `config` directly without going through the service.
2. **Do NOT change the existing fixtures** at lines 22 and 136. They are hardcoded `https://crema.com/product/...` values that exactly match the mocked service response. Changing them to reference `${config.frontendUrl}` (or similar) would cause a `ReferenceError: config is not defined` because vitest factory callbacks have isolated module scope — `config` is not in scope inside the `vi.mock('../../services/ai/seo-optimizer.service', () => ({ ... }))` factory.
3. **Do NOT add new test cases** in the route test. The OG fallback chain, brand-from-config, canonical-from-config, and provider.name-from-config behaviors are all verified by the new service-level test created in Task 1 step 6. Adding them to the route test would either (a) require un-mocking the service (a major rewrite of the existing route test setup) or (b) produce a false-pass scenario where the assertion passes because the service mock returns hardcoded values aligned with the assertion, not because the actual config-driven logic works.

**Test Strategy (TDD)**: This is a **sanity-only** task — it ensures the route test setup compiles after adding the config mock and that the pre-existing assertions (auth, response shape, error handling) continue to pass. The actual config-driven behavior is tested at the service level in Task 1 step 6. TDD cycle lives in Task 1, not here.

**Acceptance**: REQ-SEO-001, REQ-SEO-002, REQ-SEO-003 (interpreted as: the service returns config-driven values, which the route then passes through; the route test verifies the pass-through, the service test verifies the config-driven values)
**Verification Gates**: `pnpm test` (all existing tests still pass — no regressions; specifically `pnpm vitest run seo-optimizer.routes`)
**Commit Message**: `test(seo-optimizer): add config mock safety net to route test (config-driven values verified at service level)`
**Rollback**: Revert this commit; the route test returns to the pre-change state (no config mock). The service-level test from Task 1 step 6 still covers the fallback chain independently.

---

## Task 3: Document new env keys in `.env.example`

**Work Unit**: docs
**Files**:
- `backend/.env.example` (modify — add 2 documented env keys with inline comments)

**Implementation Steps**:
1. After `APP_URL=http://localhost:5173` (line 5), add:
   ```
   # Brand name emitted in OG site name + Schema.org provider.name (default: Crema)
   BRAND_NAME=Crema

   # Default OG image URL when the LLM omits ogImageUrl (empty = no fallback, documented "no image" signal)
   OG_IMAGE_DEFAULT=
   ```

**Test Strategy**: No test — documentation only.

**Acceptance**: Spec scenario "`.env.example` documents both new keys" (under REQ-CON section)
**Verification Gates**: `grep -E '^(BRAND_NAME|OG_IMAGE_DEFAULT)=' backend/.env.example` returns both keys
**Commit Message**: `docs(env): document BRAND_NAME and OG_IMAGE_DEFAULT in .env.example`
**Rollback**: Revert this commit; no runtime impact (env keys still default to `'Crema'` and `''`).

---

## Task 4: Full verification + grep regression checks

**Work Unit**: verification
**Files**: (gates only — no file changes)

**Implementation Steps**:
1. `pnpm tsc --noEmit` → 0 errors
2. `pnpm lint` → 0 errors
3. `pnpm test` → all pass (existing + new service-level assertions from Task 1)
4. `grep "'Crema'" backend/src/services/ai/seo-optimizer.service.ts` → only doc-comments and prompt-building text remain (acceptable per spec §Out of Scope)
5. `grep "https://crema.com" backend/src/services/ai/seo-optimizer.service.ts` → 0 hits
6. `grep -E "brandName|ogImageDefault" backend/src/config/index.ts` → both keys exported
7. `pnpm vitest run seo-optimizer.routes` → specific suite passes in isolation

**Test Strategy**: This task IS the verification. Per-task gates listed above; this is the consolidated run that closes the change.

**Acceptance**: All spec acceptance criteria pass.
**Verification Gates**: tsc / lint / test / grep — all green.
**Commit Message**: (none — verification only. If a fix is needed, amend the offending task's commit.)
**Rollback**: N/A

---

## Task 5: Update Project Documentation

**Work Unit**: project-docs
**Files**:
- `docs/project/reusable-resources.md` (modify — add 2 new config keys to §1)
- `docs/project/ai-features/PRD.md` (modify — update §4.12 status block)

**Implementation Steps**:
1. **`docs/project/reusable-resources.md` §1 (Configuration)**: in the `config` key-exports list, add a row for `brandName` (env: `BRAND_NAME`, default `'Crema'`) and `ogImageDefault` (env: `OG_IMAGE_DEFAULT`, default `''`). Note their role: deployment-level brand/OG defaults.
2. **`docs/project/ai-features/PRD.md` §4.12 (line 933+)**: in the "Estado" block, append to the implementation notes: `> - Env keys: \`BRAND_NAME\` (default: Crema), \`OG_IMAGE_DEFAULT\` (default: empty)`. Update the header line at top of PRD.md (line 16) — keep `✅ SEO Optimizer: COMPLETO` but bump the linked SDD reference to the new change folder.
3. **Verify** `docs/project/SDD-WORKFLOW.md` does not need updates (it shouldn't — the change does not alter the SDD workflow itself).

**Test Strategy**: N/A — documentation only.

**Acceptance**: Project docs reflect the new env keys; `grep` confirms both keys mentioned in both target files.
**Verification Gates**: `grep -c "BRAND_NAME\|OG_IMAGE_DEFAULT" docs/project/reusable-resources.md docs/project/ai-features/PRD.md` returns ≥ 2 per file.
**Commit Message**: `docs(seo-optimizer): document new BRAND_NAME and OG_IMAGE_DEFAULT env keys`
**Rollback**: Revert this commit; docs revert to pre-change state.

---

## Execution Notes

- **Branch**: `fix/seo-optimizer-extract-hardcoded-config` from `master`. Per AGENTS.md, code changes require a feature branch + PR. No chained PRs — single PR is the strategy (well under 600-line budget).
- **Pre-flight gates** (per AGENTS.md): before each commit, run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`.
- **TDD strategy**: All test work lives inside Task 1 (the RED → GREEN cycle: write the new service-level test cases first, run them (fail), then apply the service changes (pass)). Task 2 is a separate, independent sanity-only safety-net task that adds `vi.mock('../../config', ...)` to the route test — it does NOT form a red-green cycle with Task 1, and its commit does not block or follow Task 1's commit. The route test's pre-existing fixtures (`canonicalUrl: 'https://crema.com/product/...'`) and assertions (auth, response shape, error handling) are unchanged. Commit order follows task numbering.
- **Test command**: `pnpm test` (vitest). In CI, may need `pnpm test -- --run` to disable watch mode.
- **`APP_URL` in CI**: ensure CI pipelines set `APP_URL` explicitly. The default `http://localhost:5173` works locally but staging/CI should override.
- **No GGA exception needed**: diff is ≈ 5% of the 600-line budget; no `size:exception` required.
- **Out of scope** (do NOT add as tasks): `parseLLMResponse` lines 428-429 `?? ''` masks, concierge system-prompt brand strings, TOTP issuer, email display name, payout admin email, DB allowlist, type contract change to `string | null` / `string | undefined`.
