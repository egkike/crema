# Proposal: SEO Optimizer — Extract Hardcoded Config

**Change**: seo-optimizer-extract-hardcoded-config
**Date**: 2026-06-04
**Status**: proposed

**Refs**: [Explore](openspec/changes/seo-optimizer-extract-hardcoded-config/explore.md) · [Issue #53](https://github.com/egkike/crema/issues/53) · [PR #52](https://github.com/egkike/crema/pull/52) (`b885772`)

## Intent

Three GGA PREFER findings from PR #52 in `seo-optimizer.service.ts`: hardcoded canonical URL (`https://crema.com/product/...`), two `'Crema'` brand strings (lines 356, 475), and silent OG-image mask (`parsed.ogImageUrl ?? ''`). The canonical URL breaks all non-prod deployments. An 18-file AI services survey confirmed this anti-pattern is local — single-PR fix.

## Scope

**In:** `config/index.ts` (+2 env keys), `seo-optimizer.service.ts` (4 value replacements + `config` import), route test (update mocks + brand test via `vi.mock`), `.env.example` (2 lines).

**Out:** Concierge system-prompt, TOTP issuer, email display name, `payout.service.ts` admin email, DB allowlist, other `?? ''` patterns.

## Capabilities

**New:** None. **Modified:** `seo-optimizer` — canonical URL, brand name, OG fallback become config-driven.

## Approach

Branch `fix/seo-optimizer-extract-hardcoded-config` from `master`. Order: config → service → tests → `.env.example`. ~25–35 lines diff. Gates: `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test`. No chained PRs.

## Decisions (from explore)

1. OG fallback: `config.ogImageDefault`  
2. Line 475 `provider.name`: include  
3. Concierge system-prompt: out of scope  
4. DB allowlist: env-only  
5. Test strategy: `vi.mock` of config module  

## Affected Areas

`config/index.ts` (+2 keys) · `seo-optimizer.service.ts` (4 edits) · route test (update + add) · `.env.example` (2 lines)

## Risks

- **`frontendUrl` trailing slash**: Low — already trimmed in config  
- **`ogImageUrl` type change**: Low — per spec decision  
- **Test mock**: Low — proven `vi.mock` pattern  
- **Crawler cache**: Very Low — re-indexes naturally  

## Rollback

Revert PR. No DB migration. New keys have defaults — harmless after revert.

## Success Criteria

- [ ] `pnpm tsc --noEmit` passes  
- [ ] `pnpm lint` passes  
- [ ] `pnpm test` passes  
- [ ] Non-prod canonical uses `APP_URL`  
- [ ] Brand strings match `BRAND_NAME`  
- [ ] OG image falls back to `OG_IMAGE_DEFAULT`
