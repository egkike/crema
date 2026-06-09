# Tasks: Fix Agents Service Auth + Sanitization Gaps (Reuse)

**Change**: fix-agents-service-auth-sanitization-reuse
**Issue**: [#55](https://github.com/egkike/crema/issues/55)
**Date**: 2026-06-07
**Status**: ✅ COMPLETED
**Author**: sdd-tasks
**Updated**: 2026-06-09 (all tasks complete; PR #56 merged; docs updated)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~280–350 (all phases) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (code + tests) + docs direct push |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Auth fixes + error sanitization + tests | PR 1 | feature branch; ~250-300 lines |
| 2 | Project documentation update | Direct push to master | ~30 lines; after PR 1 merge |

## Phase 1: Foundation

- [x] 1.1 Fix `verifyDashboardOwnership` table reference in `backend/src/utils/routeHelpers.util.ts:87`: change `insight_dashboards` → `creator_dashboards`

## Phase 2: Core Implementation

- [x] 2.1 In `backend/src/services/ai/agents.service.ts`: add `verifyDashboardOwnership` to import (line 13); wrap `createDashboard` pool.query (line 1200) with `withSanitizedErrors('insightsService.createDashboard', userId, ...)`
- [x] 2.2 In `agents.service.ts`: add `userId` as first param to `updateDashboard` (line 1207); add `await verifyDashboardOwnership(pool, dashboardId, userId)` at entry; wrap pool.query (line 1233) with `withSanitizedErrors`
- [x] 2.3 In `agents.service.ts`: add `userId` as first param to `deleteDashboard` (line 1277); add `await verifyDashboardOwnership(pool, dashboardId, userId)` at entry; wrap pool.query (line 1279) with `withSanitizedErrors`
- [x] 2.4 In `agents.service.ts`: add `userId` as first param to `getDashboardById` (line 1239); add existence pre-check (`SELECT 1 FROM creator_dashboards WHERE id = $1`) wrapped with `withSanitizedErrors` → throw `AppError(404)` if missing; add `verifyDashboardOwnership` → throws 403; wrap main SELECT with `withSanitizedErrors`; remove `null` from return type (404 replaces null return)
- [x] 2.5 In `backend/src/routes/ai.routes.ts`: simplify PUT route (lines 1983–2016) — remove manual `getDashboardById` + `creator_id` check (lines 1994–2001); pass `userId` to `insightsService.updateDashboard(userId, dashboardId, data)`. Simplify DELETE route (lines 2022–2053) — same pattern: remove lines 2031–2038; pass `userId` to `insightsService.deleteDashboard(userId, dashboardId)`
- [x] 2.6 In `backend/src/services/ai/affiliate-chat.service.ts`: add imports for `pool`, `getValidatedSchema`, `verifyProductAccess`, `AppError`, `withSanitizedErrors`. In `chat()` (line 121), after destructuring input, add product existence check wrapped with `withSanitizedErrors` → throw 404 if missing, then `await verifyProductAccess(pool, productId, userId)` → throws 403
- [x] 2.6b In `backend/src/routes/ai.routes.ts`: remove `await verifyProductAccess(pool, productId, userId)` from the affiliate-chat route (line 2302) — service now provides the complete check (existence 404 + access 403). Do NOT keep a duplicate route-level check.
- [x] 2.7 In `backend/src/services/ai/concierge.service.ts`: add `import { withSanitizedErrors }` from `../../lib/withSanitizedErrors`. Wrap `userContextRepository.findByUserAndProduct` (line 144) and `.upsert` (line 150) calls with `withSanitizedErrors('concierge.contextFind', userId, ...)` and `withSanitizedErrors('concierge.contextUpsert', userId, ...)` — fire-and-forget `.catch` remains non-fatal

## Phase 3: Testing

> **Note (JD final):** Two test files exist for agents.service. The canonical file for this SDD is `backend/src/__tests__/services/ai/agents.service.test.ts`. The old `services/agents.service.test.ts` has 8+ tests that will break due to signature changes and behavior changes — Task 3.4 addresses ALL of them. Future SDD should consider consolidating.

- [x] 3.1 Add tests to `backend/src/__tests__/services/ai/agents.service.test.ts`: non-owner → 403 on `updateDashboard`/`deleteDashboard`/`getDashboardById`; missing dashboard → 404 on `getDashboardById`; DB constraint error → generic 500 via `withSanitizedErrors` on all 4 dashboard methods
- [x] 3.2 Add tests to `backend/src/__tests__/services/ai/affiliate-chat.service.test.ts`: non-existent product → 404; unauthorized user → 403 before RAG search
- [x] 3.3 Create `backend/src/__tests__/services/ai/concierge.service.test.ts`: mock `userContextRepository.findByUserAndProduct` to throw → assert chat response succeeds (fire-and-forget) and `logger.warn` called with sanitized context
- [x] 3.4 Update or remove ALL broken tests in old `backend/src/__tests__/services/agents.service.test.ts` (non-ai/ version):
  - `updateDashboard`: 3 tests — signature changes from `updateDashboard(dashboardId, data)` to `updateDashboard(userId, dashboardId, data)`; `verifyDashboardOwnership` called at entry (receives wrong userId as dashboardId); mock returning `[]` causes 403 on ownership check. Update mocks to return `[{ creator_id: userId }]` for owner case.
  - `deleteDashboard`: 1 test — signature changes from `deleteDashboard(dashboardId)` to `deleteDashboard(userId, dashboardId)`; same ownership mock issue.
  - `getDashboardById`: 2 tests — `expect(result).toBeNull()` → `await expect(...).rejects.toThrow(AppError('Dashboard no encontrado', 404))`
  - `createDashboard`: 2 tests — `withSanitizedErrors` wrapping changes mock call pattern; verify tests still pass or update mocks.
- [x] 3.5 Add test: `getDashboardById(userId, nonExistentDashboardId)` → asserts `AppError('Dashboard no encontrado', 404)` thrown. Validates existence pre-check fires before ownership check (404 not 403).

## Task 9: Update Project Documentation

- [x] 9.1 Update `docs/project/reusable-resources.md` if new patterns or helpers are documented; update status in proposal.md to ✅ COMPLETED after merge; verify `pnpm tsc --noEmit`, `pnpm lint`, `pnpm test` all pass globally

---

## Post-Implementation SDD Phases

After all tasks above are completed and the PR is merged, the following phases execute in order:

| Phase | Artifact | Trigger |
|-------|----------|---------|
| **apply** | `apply-progress.md` | Created by `sdd-apply`; tracks implementation progress with checkmarks per task + TDD evidence |
| **verify** | `verify-report.md` | Run after apply completes; verification against spec + judgment day before commit |
| **sync** | `sync-report.md` | Sync delta specs to `openspec/specs/` (if new capabilities were added) |
| **archive** | `archive-report.md` | Move change to `openspec/changes/archive/YYYY-MM-DD-<change>/` |

**Trigger**: After user confirms "Ya hice el merge" → next phase activates.
