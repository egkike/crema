# Fix Agents Service Auth + Sanitization Gaps (Reuse) — Specification

**Change**: `fix-agents-service-auth-sanitization-reuse` · **Issue**: [#55](https://github.com/egkike/crema/issues/55)  
**Date**: 2026-06-07 · **Status**: 🚧 IN PROGRESS · **Author**: `sdd-spec`  
**Files**: `agents.service.ts`, `affiliate-chat.service.ts`, `concierge.service.ts`  
**Updated**: 2026-06-07 (after judgment day final round: no content changes required — all fixes applied to design.md and tasks.md)

**MUST** = absolute, **SHOULD** = recommended, **MAY** = optional. Scenarios: GIVEN → WHEN → THEN.

---

## Finding 1 — CRITICAL: Dashboard Ownership Bypass

`updateDashboard`, `deleteDashboard`, and `getDashboardById` in `agents.service.ts` MUST verify the requesting user owns the dashboard before any read or write operation.

> **⚠️ Prerequisite**: `verifyDashboardOwnership` (`routeHelpers.util.ts:87`) queries the wrong table (`insight_dashboards` — does not exist). It MUST be fixed to query `creator_dashboards` before wiring into these methods.

- **Mutation by owner**: GIVEN dashboard D owned by user U WHEN U calls `updateDashboard` or `deleteDashboard` THEN operation proceeds normally.
- **Mutation by non-owner**: GIVEN dashboard D owned by user A WHEN user B calls `updateDashboard` or `deleteDashboard` THEN the system MUST reject with HTTP 403 and MUST NOT mutate D.
- **Read by non-owner (info disclosure)**: GIVEN dashboard D owned by user A WHEN user B calls `getDashboardById` THEN the system MUST reject with HTTP 403 and MUST NOT return D's data.
- **Missing dashboard**: GIVEN a non-existent dashboard ID WHEN any user calls `getDashboardById` THEN the system MUST reject with HTTP 404. The current implementation returns `null` — this behavior MUST be changed to throw 404.

## Finding 2 — WARNING: Raw `pool.query` Error Leaks

All `pool.query` calls in the four dashboard methods (`createDashboard`, `updateDashboard`, `getDashboardById`, `deleteDashboard`) MUST be wrapped with `withSanitizedErrors` so database constraint names, column names, or schema details never reach the client.

- **Constraint leak prevented**: GIVEN a DB constraint failure (e.g., unique violation) WHEN `createDashboard` executes THEN the client receives a generic 500 error message and the server logs the full error detail with operation context.
- **Schema leak prevented**: GIVEN a missing table or column error WHEN `getDashboardById` executes THEN the client receives a generic 500 error message and the server logs the full error detail.
- **Normal success unchanged**: GIVEN valid inputs and healthy DB WHEN any dashboard method executes THEN it returns the expected successful response.

## Finding 3 — MEDIUM: Missing Product Access Check in Affiliate Chat

`affiliate-chat.service.ts` `chat()` MUST call `verifyProductAccess(pool, productId, userId)` before sanitization, framing, and RAG search.

> **⚠️ Note**: `verifyProductAccess` returns HTTP 403 for both "product does not exist" and "user has no access". The spec requires HTTP 404 for non-existent products. An existence pre-check (SELECT id FROM products WHERE id = $1) MUST be added before calling `verifyProductAccess` so that missing products return 404 and only-no-access returns 403.

- **Authorized chat**: GIVEN user U has access to product P WHEN U sends a chat message for P THEN RAG search and response generation proceed normally.
- **Unauthorized chat blocked**: GIVEN user U does NOT have access to product P WHEN U sends a chat message for P THEN the system MUST reject with HTTP 403 before performing RAG search or LLM inference.
- **Non-existent product**: GIVEN a non-existent product ID WHEN any user calls `chat()` THEN the system MUST reject with HTTP 404.

## Finding 4 — INFO: `interactive-agent.repository.ts` Isolation

No action required. `SET LOCAL` isolation in `interactive-agent.repository.ts` is verified correct and sufficient for the current execution model.

## Finding 5 — LOW: Defense-in-Depth Error Sanitization in Concierge

The `userContextRepository` calls in the try block of `concierge.service.ts` MUST be wrapped with `withSanitizedErrors` as defense-in-depth.

> **⚠️ Note**: `concierge.service.ts` has no direct `pool.query` calls — it uses `userContextRepository` abstraction. The defense-in-depth applies `withSanitizedErrors` to the repository calls inside the try block (lines 144–159), on top of the existing catch-block sanitization at line 165.

- **Repository error sanitized**: GIVEN a DB error from `userContextRepository.findByUserAndProduct` WHEN the repository call throws THEN `withSanitizedErrors` logs the error with operation context; the fire-and-forget `.catch` then logs a warning and the error is non-fatal (the HTTP response succeeds regardless).
- **Normal path unchanged**: GIVEN healthy DB and valid inputs WHEN concierge flow executes THEN no error is triggered and the response succeeds.

---

## Reuse Helpers (All Findings)

All fixes reuse existing utilities — no new abstractions:

| Helper | Location | Status | Used By |
|--------|----------|--------|---------|
| `verifyDashboardOwnership` | `backend/src/utils/routeHelpers.util.ts:87` | ⚠️ **NEEDS FIX** — queries `insight_dashboards` (non-existent); change to `creator_dashboards` | Finding 1 |
| `verifyProductAccess` | `backend/src/utils/routeHelpers.util.ts:40` | ✅ Ready — add existence pre-check for 404 on missing product | Finding 3 |
| `withSanitizedErrors` | `backend/src/lib/withSanitizedErrors.ts:28` | ✅ Ready | Findings 2, 5 |
