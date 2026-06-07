# Proposal: Fix Agents Service Auth + Sanitization Gaps (Reuse)

**Change**: fix-agents-service-auth-sanitization-reuse
**Type**: Bug fix (security/auth gaps)
**Issue**: [#55](https://github.com/egkike/crema/issues/55)
**Date**: 2026-06-07
**Reference SDD**: 2026-06-02-fix-agents-service-gga-findings (same pattern on same file)
**Updated**: 2026-06-07 (after judgment day final round: documented out-of-scope verifyProductAccess routes for consistency awareness)

---

## Problem Statement

An audit of `agents.service.ts`, `affiliate-chat.service.ts`, and `concierge.service.ts` identified 5 security gaps. Four require fixes; one (INFO) is verified correct and needs no action. The gaps follow the same pattern resolved in PR #46 (#42): unused ownership helpers + missing error wrappers.

> **⚠️ Discovery during design: `verifyDashboardOwnership` is broken.** The helper at `routeHelpers.util.ts:87` queries table `insight_dashboards` — a table that does NOT exist in the DB (zero init scripts, zero references). The actual table is `creator_dashboards`. This helper was dead code. Finding 1 must first fix the helper before wiring it in.

> **⚠️ Discovery: route layer redundancy.** `ai.routes.ts:1994-2001` already does manual ownership checks (`getDashboardById` + `creator_id` comparison). Moving ownership to the service layer (Finding 1) unifies the check in one place and removes route-layer duplication.

> **⚠️ Discovery: `verifyProductAccess` returns 403 for both missing product and no-access.** Finding 3 spec requires HTTP 404 for non-existent products. An existence pre-check must be added before calling the helper.

> **⚠️ Discovery: `concierge.service.ts` has no direct `pool.query`.** It uses `userContextRepository` abstraction. Finding 5 wraps repository calls with `withSanitizedErrors` as belt-and-suspenders on top of the existing catch-block sanitization.

## Intent

Close 4 security/auth gaps: (1) dashboard ownership bypass in `updateDashboard`/`deleteDashboard`/`getDashboardById`, (2) unsanitized `pool.query` errors in 4 dashboard methods, (3) missing product access check in `affiliate-chat.service.ts` before RAG search, (4) defense-in-depth on `concierge.service.ts` catch block.

## Scope

### In Scope

| # | Severity | File | Fix |
|---|----------|------|-----|
| 1 | CRITICAL | `agents.service.ts` lines 1207–1281 | Add `verifyDashboardOwnership(pool, dashboardId, userId)` to `updateDashboard`, `deleteDashboard`, `getDashboardById` |
| 2 | WARNING | `agents.service.ts` lines 1200, 1233, 1252, 1279 | Wrap `pool.query` calls with `withSanitizedErrors` in `createDashboard`, `updateDashboard`, `getDashboardById`, `deleteDashboard` |
| 3 | MEDIUM | `affiliate-chat.service.ts` line 121 | Add `verifyProductAccess(pool, productId, userId)` before RAG search |
| 4 | INFO | `interactive-agent.repository.ts` | No action — verified correct, `SET LOCAL` isolation is proper |
| 5 | LOW | `concierge.service.ts` lines 144–159 | Add `withSanitizedErrors` on `userContextRepository` calls in try block as defense-in-depth |

### Out of Scope
- New features or dashboard functionality changes
- Frontend changes
- DB schema changes
- Other services or routes beyond the 3 files listed
- Routes at `ai.routes.ts:1464` (qa/chat) and `ai.routes.ts:1815` (tutor/chat) — these also call `verifyProductAccess` and return 403 for missing products (same inconsistency as affiliate-chat had). Documented for awareness; future SDDs should address consistency if 404 behavior is needed for those endpoints.

## Capabilities

### New Capabilities
None — this is a hardening pass on existing service methods.

### Modified Capabilities
None — no existing `openspec/specs/` to delta. Behavior changes (auth enforcement, error sanitization) are at the service implementation level, not spec level.

## Approach

Reuse pattern from `2026-06-02-fix-agents-service-gga-findings`: call existing helpers (`verifyDashboardOwnership`, `verifyProductAccess`) + wrap `pool.query` with `withSanitizedErrors`. No new abstractions, no DI, no decorators.

1. **Auth (Finding #1)**: Add `userId` parameter to `updateDashboard` and `deleteDashboard`. Call `verifyDashboardOwnership(pool, dashboardId, userId)` at method entry (NOTE: entity before userId). Add same check to `getDashboardById` (info-disclosure risk). Routes already receive `userId` from JWT — wire it through.
2. **Error sanitization (Findings #2, #5)**: Replace 4 direct `pool.query(...)` calls with `await withSanitizedErrors('Operation name', userId, () => pool.query(...))`. For `concierge.service.ts`, wrap the `userContextRepository` calls inside the try block (defense-in-depth).
3. **Product access (Finding #3)**: Call `await verifyProductAccess(pool, productId, userId)` at the top of `chat()` in `affiliate-chat.service.ts` — before sanitization, framing, and RAG search.
4. **Tests**: Add regression tests (Vitest + Supertest) for each fix: wrong-owner 403 on dashboard mutations, wrong-owner 403 on dashboard get, wrong-product 403 on affiliate chat, sanitized error message on DB failure injection.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/src/services/ai/agents.service.ts` | Modified | Add `verifyDashboardOwnership` + `withSanitizedErrors` to 4 dashboard methods |
| `backend/src/services/ai/affiliate-chat.service.ts` | Modified | Add `verifyProductAccess` before RAG search |
| `backend/src/services/ai/concierge.service.ts` | Modified | Wrap `userContextRepository` calls with `withSanitizedErrors` in try block |
| `backend/src/__tests__/` | New/Modified | Auth bypass + error sanitization regression tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `verifyDashboardOwnership` helper fix affects other callers | Low | Zero other callers found in codebase; `pnpm test` after change will verify |
| Dashboard routes don't pass `userId` → ownership check breaks existing functionality | Low | Verify route layer passes `userId` from JWT; if missing, add parameter to route handler |
| `verifyProductAccess` returns 403 for missing product (spec requires 404) | Low | Add existence pre-check for product before calling helper; design documents this |
| `concierge.service.ts` has no direct `pool.query` — repository abstraction used | N/A | Finding 5 wraps repository calls with `withSanitizedErrors` as defense-in-depth |
| Line budget exceeds 400-line PR limit | Medium | Single-file scope (~150 lines changed); can split into 2 PRs if needed (auth + sanitization) |

## Rollback Plan

Revert the commit. Each change is isolated per method — no DB migrations to roll back. `git revert` restores prior behavior.

## Dependencies

**Helpers that need correction first:**
- `verifyDashboardOwnership` — `backend/src/utils/routeHelpers.util.ts:87` — **BROKEN**: queries `insight_dashboards` (non-existent); must be fixed to query `creator_dashboards`

**Helpers ready to use:**
- `verifyProductAccess` — `backend/src/utils/routeHelpers.util.ts:40` — needs existence pre-check for 404 on missing product
- `withSanitizedErrors` — `backend/src/lib/withSanitizedErrors.ts:28`

No external deps, no new packages.

## Success Criteria

- [ ] `updateDashboard` and `deleteDashboard` reject requests from non-owner with HTTP 403
- [ ] Service-level `getDashboardById(userId, dashboardId)` throws 403 for non-owner (defensive hardening; no current route exposes this directly)
- [ ] All 4 dashboard `pool.query` calls wrapped with `withSanitizedErrors` — DB constraint names never reach client
- [ ] `affiliate-chat.service.ts` `chat()` calls `verifyProductAccess` before RAG search; wrong product → HTTP 403
- [ ] `concierge.service.ts` try block wraps `userContextRepository` calls with `withSanitizedErrors` for future-proofing
- [ ] Regression tests for all fixes pass
- [ ] `pnpm tsc --noEmit` passes (no type errors)
- [ ] `pnpm lint` passes (no warnings)
- [ ] `pnpm test` passes (no regressions)