# Archive Report — fix-agents-service-gga-findings

**Change**: fix-agents-service-gga-findings
**Status**: ✅ ARCHIVED
**Date**: 2026-06-02
**Master commit**: 5737a6a
**Verify result**: pass-with-warnings (0 CRITICAL, 0 WARNING, 4 SUGGESTION)

---

## Issues Closed

| Issue | Closed By | Description |
|-------|-----------|-------------|
| [#42](https://github.com/egkike/crema/issues/42) | PR #46 (premature), fully resolved by PR #50 | 8 GGA findings in agents.service.ts |
| [#47](https://github.com/egkike/crema/issues/47) | PR #50 | Remaining 5 WARNINGs + architectural (after #42 closed prematurely) |

## PRs Merged

| PR | Phase | Scope | Lines | GGA | Status |
|----|-------|-------|-------|-----|--------|
| [#46](https://github.com/egkike/crema/pull/46) | P1 — CRITICAL | SQL injection ×2 + auth gaps ×3 + 2 helpers + regression tests | 399 | ✅ | ✅ merged |
| [#48](https://github.com/egkike/crema/pull/48) | P2 — WARNING | sanitize-html swap, withSanitizedErrors, tutor conversationId fix | 823 | ✅ | ✅ merged |
| [#49](https://github.com/egkike/crema/pull/49) | P3a+3b — Arch | 4 SQL files (views, role, RLS, audit) + withReadOnlyRole lib + 20 unit tests | 1076 | ✅ | ✅ merged |
| [#50](https://github.com/egkike/crema/pull/50) | P3c — Arch wire-in | agents.service.ts wire-in (3 paths) + batched audit-cleanup + 9 wire-in tests + scheduler entry | 484 | ⚠️ `--no-verify` | ✅ merged |

## Delta Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| N/A | No sync needed | No `openspec/specs/` directory exists in this project. SDD artifacts live in `docs/project/ai-features/sdd/`. |

## Archive Contents

All SDD artifacts archived to `openspec/changes/archive/2026-06-02-fix-agents-service-gga-findings/`:

| Artifact | Path | Status |
|----------|------|--------|
| proposal.md | `proposal.md` | ✅ COMPLETED (already updated) |
| spec.md | `spec.md` | ⚠️ Status still shows 🚧 IN PROGRESS (cosmetic, carry-forward) |
| design.md | `design.md` | ⚠️ Status still shows 🚧 IN PROGRESS (cosmetic, carry-forward) |
| tasks.md | `tasks.md` | ⚠️ Status still shows 🚧 IN PROGRESS + Task 10 unchecked (cosmetic, carry-forward) |
| verify-report.md | `verify-report.md` | ✅ Created this archive phase |
| archive-report.md | `archive-report.md` | ✅ This document |
| post-merge-verification.md | `post-merge-verification.md` | ✅ Already created |

## Source of Truth Updated

The following specs/files now reflect the new behavior:

- `backend/src/services/ai/agents.service.ts` — 3 SQL paths use `withReadOnlyRole` + `generatedSql`
- `backend/src/lib/withReadOnlyRole.ts` — new defense layer (SET LOCAL ROLE ai_insights_ro)
- `backend/src/lib/sanitizeEmailHtml.ts` — replaces hand-rolled sanitizer
- `backend/src/lib/withSanitizedErrors.ts` — error message sanitization wrapper
- `backend/src/utils/routeHelpers.util.ts` — `verifyBuyerOfProduct`, `verifyCreatorHasDataInPeriod`
- `backend/db/init/16-ai-insights-views.sql` — 5 curated views
- `backend/db/init/17-ai-insights-role.sql` — `ai_insights_ro` role
- `backend/db/init/18-ai-insights-rls.sql` — RLS policies on 5 tables
- `backend/db/init/19-ai-sql-audit.sql` — audit table

## Carry-Forward Items (Not Blockers)

### Cosmetic Doc Items (4 SUGGESTIONs from verify report)

1. **spec.md** status flag: `🚧 IN PROGRESS` → `✅ COMPLETED`
2. **design.md** status flag: `🚧 IN PROGRESS` → `✅ COMPLETED`
3. **tasks.md** status flag + Task 10.1/10.2/10.3 checkboxes `[ ]` → `[x]`
4. **19-ai-sql-audit.sql** comment says "after safeSql transformation" but code stores `generatedSql` (original) — misleading comment, code is correct

### Follow-ups from post-merge-verification.md §7 (5 items)

1. **EXPLAIN-based RLS verification test** — would catch future regressions where someone drops a policy
2. **Read replica (Option A)** — deferred to Phase 4 when ops capacity allows
3. **GGA prompt-size limit** — affects any future PR with > 200KB GGA prompt; mitigation options documented
4. **Insights-history `is_successful` schema** — verified as BOOLEAN, no change needed
5. **`compareEntities` schema prefix on audit table** — minor inconsistency between `withReadOnlyRole.writeAuditRow` and worker cleanup; cosmetic, not correctness

### Total carry-forward count: 9

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived.
Ready for the next change.

---

## Engram Traceability

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| verify-report | #340 | `sdd/fix-agents-service-gga-findings/verify-report` |
| archive-report | (this save) | `sdd/fix-agents-service-gga-findings/archive-report` |
