# Post-Merge Verification — fix-agents-service-gga-findings

**Change**: fix-agents-service-gga-findings
**Date**: Junio 2026
**Status**: ✅ All phases merged, global regression clean
**Issues closed**: [#42](https://github.com/egkike/crema/issues/42) (PR #46), [#47](https://github.com/egkike/crema/issues/47) (PR #50)

---

## 1. PR Chain Summary

| PR | Phase | Scope | Lines | GGA | CI | Merged |
|----|-------|-------|-------|-----|----|----|
| [#46](https://github.com/egkike/crema/pull/46) | P1 — CRITICAL | SQL injection ×2 + auth gaps ×3 + 2 helpers + regression tests | 399 | ✅ pass | ✅ green | ✅ |
| [#48](https://github.com/egkike/crema/pull/48) | P2 — WARNING | sanitize-html swap, withSanitizedErrors, tutor conversationId fix | 823 | ✅ pass | ✅ green | ✅ |
| [#49](https://github.com/egkike/crema/pull/49) | P3a+3b — Arch | 4 SQL files (views, role, RLS, audit) + withReadOnlyRole lib + 20 unit tests | 1076 | ✅ pass | ✅ green | ✅ |
| [#50](https://github.com/egkike/crema/pull/50) | P3c — Arch wire-in | agents.service.ts wire-in (3 paths) + batched audit-cleanup + 9 wire-in tests + scheduler entry | 484 | ⚠️ `--no-verify` (E2BIG) | ✅ green | ✅ |

**Total**: 4 PRs, ~2782 lines (including chained-PR overlap), 5 issues closed.

---

## 2. GGA History (Honest Record)

The project rule was "no `--no-verify` in this cycle." Reality:

| PR | GGA result | Reason |
|----|-----------|--------|
| #46 | ✅ passed | 399 lines, all under 600 budget; GGA prompt < 200KB |
| #48 | ✅ passed | 823 lines total but in well-formed hunks; GGA prompt < 200KB |
| #49 | ✅ passed | 1076 lines total but most was SQL (ignored by GGA) + tests (excluded); GGA reviewed only `withReadOnlyRole.ts` (206 lines) |
| #50 | ⚠️ bypassed with `--no-verify` (user authorized) | GGA prompt exceeded the opencode CLI's effective ~200KB execve limit; root cause is GGA's hard prompt-size cap, not bad code |

### Why GGA #50 failed

- **Diff size**: 484 lines total, 176 lines of TS additions
- **GGA prompt construction** (from `providers.sh`): constructs a single string with the diff + AGENTS.md content + GGA rules + system context, then passes it as one CLI arg to `opencode run`
- **OS limit**: `execve()` fails with `E2BIG` (errno 7) when argv+envp > ARG_MAX (2 MB theoretical, but opencode CLI effective limit is ~200 KB based on empirical testing)
- **The 600-line budget is for human reviewer ergonomics**; GGA's hard limit is prompt size, not line count

### Mitigation options for the future

1. **Split the commit** (what we did NOT do for #50 because the user preferred one commit) — each commit passes GGA individually
2. **Reduce GGA's context** — investigate GGA flags for `--no-context` or `--unified=0` to shrink the prompt
3. **Increase the opencode CLI's effective limit** — out of scope for this SDD
4. **Pre-commit hook that estimates GGA prompt size** — could be a follow-up to fail-fast before GGA's own failure

---

## 3. Global Regression Results (post all-merge)

Run from `backend/`:

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `pnpm tsc --noEmit` | ✅ 0 errors |
| Lint | `pnpm lint` | ✅ 0 errors, 0 warnings |
| Tests | `pnpm vitest run` | ✅ **1476 passed**, 7 skipped, 96 suites |
| Backend QA CI | GitHub Actions | ✅ green (PR #50) |
| Frontend-admin QA CI | GitHub Actions | ✅ green (PR #50) |

**No regressions** in the 1414 baseline tests. New tests added across PRs:
- PR #46: ~8 tests (SQL injection + cross-creator 403)
- PR #48: ~25 tests (sanitizeEmailHtml XSS vectors + withSanitizedErrors + tutor conversationId UUID)
- PR #49: 20 tests (withReadOnlyRole unit)
- PR #50: 9 tests (wire-in — withReadOnlyRole called with right args, callback uses client, no direct pool.query)

---

## 4. Issue Closure

### Issue #42 (8 GGA findings)

- **Closed by**: PR #46 merge (premature — the PR was scoped to the 3 CRITICAL items only, leaving 5 WARNINGs/architectural open)
- **Lesson learned**: don't use "Closes #N" on intermediate PRs that don't fully resolve the issue. Use "Closes" only on the last chained PR or a docs commit.

### Issue #47 (remaining 5 from #42)

- **Created**: in response to PR #46 closing #42 prematurely
- **Closed by**: PR #50 merge (the final wire-in completes the architectural fix for the LLM-SQL pattern)

### Final state

- 7 of 8 findings resolved by this SDD
- 1 (item #6, misleading SQL comment) was already resolved in PR #41 (pre-SDD)

---

## 5. Defense-in-Depth Validation (Phase 3)

The Phase 3 architectural fix layers 4 defenses for LLM-generated SQL:

1. **`validateGeneratedSQL` (pre-existing)** — regex allowlist + blocklist + LIMIT cap. First line of defense.
2. **`safeSql` regex transformations (pre-existing, lines 1391-1398 in `agents.service.ts`)** — strips null bytes, trailing semicolons, forces `LIMIT 100`. Second line of defense.
3. **`withReadOnlyRole` wrapper (PR #49, wired in PR #50)** — runs the SQL as a `NOLOGIN` role with `SELECT` only on curated views, plus `SET LOCAL app.current_creator_id` to enforce RLS. Third line of defense.
4. **RLS policies on the 5 underlying tables (PR #49, `18-ai-insights-rls.sql`)** — `FOR SELECT TO ai_insights_ro` using `current_setting('app.current_creator_id', true)::uuid`. Fourth line of defense.

**Verification**: RLS policies were verified manually during PR #49 review (no automated EXPLAIN test was added — the design assumes the policies are correct based on standard `current_setting()` + RLS pattern). Follow-up: an integration test that runs `EXPLAIN` against each view could harden the guarantee, but it requires a live DB which is out of scope for the unit test suite.

---

## 6. Audit Trail (Phase 3)

Every LLM-SQL execution is recorded in `ai_sql_audit`:

- **On success**: row with `success = true`, `result_count`, `duration_ms`
- **On failure**: row with `success = false`, `error_message` (sanitized — no stack trace, no schema/column names)
- **Audit-write failure**: best-effort; logged at `error` level but never propagated to the caller (the user already got their result or error)
- **Forensic value**: `sql_text` is the **original LLM output** (not the post-sanitization `safeSql`), so attack payloads survive for incident response. SHA-256 `sql_hash` enables dedup / frequency analysis.
- **Retention**: 90 days rolling, purged by the `audit-cleanup` BullMQ job (PR #50) at midnight UTC, batched with composite cursor to avoid long `ACCESS EXCLUSIVE` locks.

---

## 7. Outstanding Items / Follow-ups (not in scope for this SDD)

1. **EXPLAIN-based RLS verification test** — would catch future regressions where someone drops a policy. Tracked in follow-up.
2. **Read replica (Option A from the proposal)** — deferred to Phase 4 when ops capacity allows. The single-DB design is security-complete but not operationally isolated.
3. **GGA prompt-size limit** — affects any future PR with > 200KB of GGA-constructed prompt. Mitigation options documented in §2 above.
4. **Insights-history `is_successful` schema** — verified as `BOOLEAN` (not text) during PR #50 implementation; no change needed but worth noting.
5. **`compareEntities` schema prefix on audit table** — minor inconsistency between `withReadOnlyRole.writeAuditRow` (relies on `search_path`) and the worker's cleanup (explicit `"${schema}".ai_sql_audit`). Cosmetic, not a correctness issue. Tracked for follow-up.

---

## 8. Files Touched Across All 4 PRs

```
backend/db/init/15-tutor-conversations.sql       (PR #48)
backend/db/init/16-ai-insights-views.sql         (PR #49)
backend/db/init/17-ai-insights-role.sql          (PR #49)
backend/db/init/18-ai-insights-rls.sql           (PR #49)
backend/db/init/19-ai-sql-audit.sql              (PR #49)
backend/src/lib/withReadOnlyRole.ts              (PR #49)
backend/src/lib/sanitizeEmailHtml.ts             (PR #48)
backend/src/lib/withSanitizedErrors.ts           (PR #48)
backend/src/utils/routeHelpers.util.ts           (PR #46)
backend/src/services/ai/agents.service.ts        (PRs #46, #48, #50)
backend/src/queues/scheduler.ts                  (PR #50)
backend/src/queues/main.worker.ts                (PR #50)
backend/src/__tests__/lib/withReadOnlyRole.test.ts           (PR #49)
backend/src/__tests__/lib/sanitizeEmailHtml.test.ts          (PR #48)
backend/src/__tests__/services/ai/agents.service.test.ts     (PRs #46, #48, #50)
```

---

## 9. Conclusion

**fix-agents-service-gga-findings is COMPLETE.** All 7 active GGA findings (plus the 1 pre-fixed in PR #41) are resolved across 4 chained PRs. The architectural fix for LLM-generated SQL (Phase 3) is now active in production: every LLM SQL runs through the read-only role + RLS transaction, and every execution is audit-logged.

Lessons learned (saved to engram for future SDD cycles):

- Don't use `git checkout --` to "preserve" working tree changes — it discards them. Use `git stash` or `git reset --soft` instead.
- Don't use "Closes #N" on intermediate chained PRs — only on the last one.
- GGA has a hard prompt-size limit (~200KB) independent of the 600-line reviewer budget. Plan for split commits when changes touch many files.
- When a tool returns empty results, STOP and ASK the user. Don't relaunch, don't try workarounds.

---

## 10. Post-Archive Follow-up — PR #51 (defense-in-depth gaps)

After archiving this SDD, a manual end-to-end audit against the live Docker DB (`crema-db`) found **2 production-blocking bugs** that the original verify phase missed:

| # | Bug | Why verify missed it |
|---|-----|----------------------|
| A | `ai_insights_safe_users` view failed to compile — referenced `users.created_at` but the actual column is `users.createdate` (historical exception, no underscore) | View was never queried in tests |
| B | `ai_insights_ro` had `REVOKE ALL` on raw tables, but the LLM prompt instructed the LLM to use raw tables → every NL→SQL query would fail `permission denied` at runtime | Tests mocked the DB (`pool.query` mocked → no real role enforcement) |

PR [#51](https://github.com/egkike/crema/pull/51) (5 files, 108+ / 30−) closed those plus **4 more defense-in-depth gaps** found by running a fresh judgment-day pair on the same diff:

1. Column-level grant on `users` (`id, username, level, createdate`) to strip PII (email/password/two_factor_secret/reset tokens were readable by the LLM)
2. RLS policies for `product_questions` and `user_balances` (had GRANT but no RLS — tenant isolation broken)
3. `set_config` / `current_setting` added to `DANGEROUS_KEYWORDS` (RLS bypass prevention)
4. `ALLOWED_TABLES` missing 5 view names + had `balances` (wrong — table is `user_balances`) — making the views-first design's preferred path dead code

### What this SDD got right vs. what it missed

**Right**:
- Architecture (views + RLS + read-only role + audit) is sound and now production-correct.
- All 4 PRs followed the chained-PR protocol with docs split out.
- The original GGA findings are all resolved.

**Missed**:
- The verify phase (sdd-verify) ran unit tests that mocked the DB, so no end-to-end behavior was tested.
- The judgment-day pair on Phase 3 didn't catch the missing RLS policies (probably because the SQL was reviewed statically, not against a live DB).
- The LLM prompt change in PR #50 (adding view names) was reviewed for grammar/correctness, not for whether the views would actually compile.

### Lessons learned (new)

- **A test suite that mocks the DB cannot catch DB-level bugs.** Defense-in-depth layers added by this SDD (view aliases, RLS policies, role grants, dangerous keyword blocklist) require integration tests against a real Postgres container. Tracked as follow-up.
- **Judgment-day reviews on SQL changes need a "run it" step** — `EXPLAIN`-based verification or a smoke test against a live DB. Static review caught syntax, not runtime behavior.
- **PG grants are additive** — `GRANT SELECT (col1, col2)` does NOT replace a prior table-level `GRANT SELECT`. You must `REVOKE` first. Caught and fixed during PR #51's DB smoke test.
- **GGA bypass recovery**: `git reset --soft HEAD~1` + re-run `gga run` + re-commit. `gga run` only reviews staged changes, not commits. PR #51's first commit (39c2a78) bypassed GGA due to a bash timeout; recovered with this procedure.
