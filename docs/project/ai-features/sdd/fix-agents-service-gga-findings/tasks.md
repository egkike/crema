# Tasks: Fix Agents Service GGA Findings

**Change**: fix-agents-service-gga-findings
**Issue Ref**: [#42](https://github.com/egkike/crema/issues/42) (CRITICALs fixed in PR #46) | [#47](https://github.com/egkike/crema/issues/47) (remaining WARNINGs)
**Date**: Junio 2026
**Status**: 🚧 IN PROGRESS
**Author**: sdd-tasks

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~550–700 (all phases) |
| 600-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Chain strategy | stacked-to-main |
| Delivery strategy | ask-on-risk |
| Issue closure | PR #3 (docs) closes #42 on merge |

Decision needed before apply: Yes
600-line budget risk: Medium
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
Issue #42 closes: PR #3 (docs) merge closes the issue

### Work Units

| PR | Base | Tasks | Scope | Líneas est. |
|----|------|-------|-------|-------------|
| **PR 1** | master | 1.1–1.8 | SQL injection ×2 + auth gaps ×3 + 2 helpers + regression tests | ~350 |
| **PR 2** | master | 2.1–2.10 | Sanitizer swap + error wrapper + tutor chat persistence | ~350 |
| **PR 3a** | master | 3.1–3.5 | SQL files 16-19 + `withReadOnlyRole` lib + tests | ~300 |
| **PR 3b** | master | 3.1–3.5 | (merged with 3a) | — |
| **PR 3c** | master | 3.6–3.9 | Wire `withReadOnlyRole` into agents.service.ts + audit-cleanup scheduler/worker + wire-in tests | ~200 |
| **Docs** | master (direct push) | 10.1–10.3 | reusable-resources.md §3 + §10 + post-merge verification | ~100 |

**PR #49 merged**: PR 3a + 3b (SQL files 16-19 + `withReadOnlyRole` lib + its 20 isolated tests) shipped to master.
**PR 3c (this)**: wires the lib into the 3 LLM-SQL execution paths in `agents.service.ts`, adds the audit-cleanup job to the scheduler/worker, and adds the wire-in tests.

**Post-merge (PRs #1–#3 merged)**: Task 10 — push docs directo a master (no PR, no review).

## Phase 1: CRITICAL Security — SQL Injection + Auth Gaps (PR 1)

- [x] 1.1 Fix SQL injection in `qaService.updateConfig` (line ~178): replace `${params.slice(1).join(', ')}` with counter-based `$N` placeholder builder; add column/placeholder count assertion
- [x] 1.2 Fix SQL injection in `tutorService.updateConfig` (line ~716): same parameterized pattern as 1.1
- [x] 1.3 Add `verifyBuyerOfProduct(pool, productId, buyerId)` to `backend/src/utils/routeHelpers.util.ts` — throws 404 if not a confirmed buyer
- [x] 1.4 Add `verifyCreatorHasDataInPeriod(pool, creatorId, period)` to `backend/src/utils/routeHelpers.util.ts` — throws 403 if zero orders in period
- [x] 1.5 Enforce auth in `predictChurn`: replace inline ownership check (lines ~1635–1643) with `verifyProductOwnership(pool, productId, userId)`
- [x] 1.6 Enforce auth in `generateRecoveryEmail`: add `verifyBuyerOfProduct` call before student data fetch; return 404 for non-buyers
- [x] 1.7 Enforce auth in `compareEntities`: add global-orders check (200 + empty if zero) + `verifyCreatorHasDataInPeriod` for `entityType === 'period'` path
- [x] 1.8 Write regression tests: SQL injection payload treated as literal string; cross-creator productId returns 403; period with zero orders returns 200 empty for new creator

## Phase 2: WARNING Hardening — Sanitizer + Error Wrapper + Conversation Contract (PR 2a + PR 2b)

- [x] 2.1 Create `backend/src/lib/sanitizeEmailHtml.ts`: configure `sanitize-html` with email-friendly allowlist (`<a>`, `<b>`, `<i>`, `<p>`, `<ul>`, `<li>`, `<h1>`–`<h3>`, `https`/`mailto` schemes only)
- [x] 2.2 Create `backend/src/lib/withSanitizedErrors.ts`: wrapper that catches non-AppError DB errors, logs detail server-side with `{ op, userId }`, throws generic `AppError('Error executing query', 500)`
- [x] 2.3 Replace hand-rolled `sanitizeHtml()` in `agents.service.ts` (lines ~1045–1075) with `sanitizeEmailHtml`; update call site at line ~2114
- [x] 2.4 Apply `withSanitizedErrors` wrapper to DB query paths: `insightsService.query`, `chatStream`, `compareEntities`, `predictChurn` student query, `generateRecoveryEmail` student query
- [x] 2.5 Write tests: `sanitizeEmailHtml` strips 4 XSS vectors (Unicode escapes, SVG, attribute-based XSS, tab/newline splitting); preserves legitimate markup (`<a>`, `<b>`, `<ul>`, `<h1>`)
- [x] 2.6 Write tests: `withSanitizedErrors` passes through AppError/4xx; replaces raw Error with generic 500; server log contains full detail
- [x] 2.7 Fix `tutorService.chat` (line ~762): call `createConversation('tutor', productId, userId)` and `addMessage`; return `conversationId: conv.id` (real UUID, not productId)
- [x] 2.8 Fix `tutorService.chatStream` (line ~849): persist conversation + messages using existing `createConversation`/`addMessage` helpers
- [x] 2.9 Create `backend/db/init/15-tutor-conversations.sql`: no-op doc-only migration noting `agent_type='tutor'` already supported
- [x] 2.10 Write tests: `tutorService.chat` returns real UUID v4 `conversationId`; `chatStream` persists to `agent_conversations` + `agent_conversation_messages`

## Phase 3: Architectural — Views + RLS + Audit on Primary DB (PR 3.1 + PR 3.2)

- [x] 3.1 Create `backend/db/init/16-ai-insights-views.sql`: 5 curated views (`ai_insights_safe_orders`, `_products`, `_users`, `_commissions`, `_reviews`) with safe columns only, no PII, `creator_id` embedded via JOINs
- [x] 3.2 Create `backend/db/init/17-ai-insights-role.sql`: `ai_insights_ro` role (NOLOGIN), SELECT only on views, explicit REVOKE on underlying tables
- [x] 3.3 Create `backend/db/init/18-ai-insights-rls.sql`: RLS policies on 5 underlying tables using `current_setting('app.current_creator_id')::uuid`; `ENABLE` + `FORCE ROW LEVEL SECURITY`
- [x] 3.4 Create `backend/db/init/19-ai-sql-audit.sql`: `ai_sql_audit` table (id, creator_id, sql_text, sql_hash, result_count, success, error_message, duration_ms, created_at) + index
- [x] 3.5 Create `backend/src/lib/withReadOnlyRole.ts`: helper that acquires pool client, runs `BEGIN` + `SET LOCAL ROLE ai_insights_ro` + `SET LOCAL app.current_creator_id`, executes fn, writes audit row, commits/rollbacks
- [x] 3.6 Wire `withReadOnlyRole` into `validateGeneratedSQL` execution path in `agents.service.ts`: replace direct `pool.query` with `withReadOnlyRole(userId, fn)` for LLM-SQL queries
- [x] 3.7 Add `audit-cleanup` job to `backend/src/queues/scheduler.ts`: daily pattern `'0 0 * * *'`
- [x] 3.8 Add `audit-cleanup` case to `backend/src/queues/main.worker.ts`: parameterized `DELETE FROM ai_sql_audit WHERE created_at < NOW() - INTERVAL '90 days'`
- [x] 3.9 Write tests: `withReadOnlyRole` captures SET LOCAL calls; RLS filters cross-creator rows; audit row written on success and failure; `EXPLAIN` shows RLS predicate

## Task 10: Update SDD Folder Artifacts

- [ ] 10.1 Update `proposal.md` status to `✅ COMPLETED` after all phases merged
- [ ] 10.2 Append init scripts 16–19 and new lib helpers to `docs/project/reusable-resources.md` (§10 init-script inventory, §3 lib helpers)
- [ ] 10.3 Create `post-merge-verification.md` with global regression results (tsc, lint, full test suite, GGA pass)
