# Design: Agents Service GGA Findings Remediation

**Change**: `fix-agents-service-gga-findings`
**Issue Ref**: [#42](https://github.com/egkike/crema/issues/42)
**Date**: Junio 2026
**Status**: 🚧 IN PROGRESS
**Author**: `sdd-design`
**File affected**: `backend/src/services/ai/agents.service.ts` (2385 lines)
**Spec**: [`spec.md`](./spec.md) · **Proposal**: [`proposal.md`](./proposal.md)

---

## Architecture Overview

Three phases, one PR per logical concern. Phase 1 is a **hot-patch security PR** (parameterization + auth gating). Phase 2 swaps the custom HTML sanitizer for a vetted library, locks the tutor conversation contract, and adds an error sanitization wrapper. Phase 3 is **defense-in-depth at the database layer** — views + `ai_insights_ro` role + RLS + audit log on the primary DB (no read replica in this cycle).

```
Phase 1 (CRITICAL)              Phase 2 (WARNING)                  Phase 3 (ARCH)
──────────────────              ─────────────────                  ───────────────
SQL parameterization           sanitize-html (HTML XSS)           views + ai_insights_ro
   in updateConfig (×2)        withSanitizedErrors() wrapper      role + RLS on primary
creator_id enforcement         tutorService.chat → real conv      ai_sql_audit table
   in 3 service methods        (persist AgentConversation)        (no replica in this cycle)
targetUserId must be a
   confirmed buyer
```

All three phases share the same architectural principle: **never trust LLM output or client input as a security boundary.** The application code that calls into the database (or renders HTML) is the last line of defense, and the database itself is the line after that.

---

## Phase 1 — CRITICAL Security

### 1.1 SQL Injection Fix

**Root cause** (line 178 and line 716 of `agents.service.ts`): the INSERT clause joins the raw values into the SQL string:

```typescript
// BEFORE (vulnerable — line 178)
const query = `
  INSERT INTO "${getValidatedSchema()}".product_qa_agent_config (product_id, ${columns.join(', ')})
  VALUES ($1, ${params.slice(1).join(', ')})    // ← values interpolated, not placeholders
  ON CONFLICT (product_id) DO UPDATE SET ${setClauses.join(', ')}
  RETURNING *
`;
```

`params.slice(1)` returns the **values** (not the placeholders). `params.slice(1).join(', ')` stringifies them into the SQL. A payload like `model: "'); DROP TABLE students; --"` is concatenated verbatim.

**Fix** — build a parallel `valuePlaceholders` array of `$N` tokens at the same `paramIndex`:

```typescript
// AFTER (parameterized) — same in tutorService.updateConfig (line 716)
const valuePlaceholders: string[] = [];
for (let i = 1; i < params.length; i++) {
  valuePlaceholders.push(`$${i + 1}`);  // params[0] is productId → $2, $3, …
}
// Note: when columns.length === params.length - 1, the loop is exact.
// Defensive: assert before query build.
if (valuePlaceholders.length !== columns.length) {
  throw new AppError('Internal: placeholder/column count mismatch', 500);
}

const query = `
  INSERT INTO "${getValidatedSchema()}".product_qa_agent_config (product_id, ${columns.join(', ')})
  VALUES ($1, ${valuePlaceholders.join(', ')})
  ON CONFLICT (product_id) DO UPDATE SET ${setClauses.join(', ')}
  RETURNING *
`;
```

**Why not a project helper?** Searched `backend/src/lib/`, `repositories/`, and `utils/` — no counter-based placeholder builder exists. The pattern above is the minimum surgical change; if a `buildUpdateClauses()` helper emerges from future work, refactor then. **No DI container** (per `AGENTS.md`).

**Test** (`backend/src/__tests__/services/ai/agents.service.test.ts`):
- Inject `model: "gpt-4'); DROP TABLE product_qa_agent_config; --"` via `updateConfig`.
- Assert `pool.query` was called with the payload as a **bound parameter** (not in the SQL string). Use a spy: `expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/VALUES \(\$1, \$2.*\)/), expect.arrayContaining([expect.stringContaining('DROP TABLE')]))`.
- Assert the test table still exists after the call (would have been dropped if vulnerable).

### 1.2 Auth Gap Fix

The project already has `verifyProductOwnership(pool, productId, userId)` in `backend/src/utils/routeHelpers.util.ts:16`. **Reuse it** for `predictChurn` and `generateRecoveryEmail` (replaces the inline `ownershipQuery` at lines 1637 and 1986). For `compareEntities` and the new `targetUserId` check, build two small helpers next to the existing ones.

| Method | Gap (per spec) | Where the check goes | Test |
|---|---|---|---|
| `predictChurn` (line 1612) | Currently inlines ownership check — works for `productId` only | Replace lines 1635–1643 with `await verifyProductOwnership(pool, productId, userId)` | 200 with owned product; 403 with cross-creator productId |
| `generateRecoveryEmail` (line 1954) | `targetUserId` (line 2016) is **NOT** verified as a buyer of `productId` — any UUID returns a user record | Add a confirmed-buyer join **before** the student data fetch (after ownership check, before credit deduction) | 200 when `targetUserId` has a `confirmed` order; 404 (NOT 403 — don't leak existence) when not a buyer; 403 on cross-creator productId |
| `compareEntities` (line 2151) | `entityType === 'period'` (lines 2170–2178) has **no ownership check** — a creator can query any date range against the global orders table | Two-step guard: (1) caller checks if creator has ANY orders globally — if 0, returns 200 with empty data (new creator, not an error); (2) only if creator has orders elsewhere, call `verifyCreatorHasDataInPeriod` — if 0 in requested period, throw 403. The LLM prompt already includes "Filtra por el creator_id del usuario" — add server-side pre-checks, don't trust the LLM | 200 with own period (has orders); 200 with empty data (new creator, zero globally); 403 when creator has orders but zero in the requested period |

**New helper signatures** (add to `backend/src/utils/routeHelpers.util.ts`):

```typescript
export async function verifyBuyerOfProduct(
  pool: Pool, productId: string, buyerId: string
): Promise<void>;  // throws 404 if not a confirmed buyer

export async function verifyCreatorHasDataInPeriod(
  pool: Pool, creatorId: string, period: string  // "YYYY-MM"
): Promise<void>;  // throws 403 if zero orders in that period
```

**Why a 404 (not 403) for the buyer check?** Returning 403 leaks that the user exists; 404 is a uniform "not found in this product's roster" response. The spec says 404/403 — pick 404 for non-leakage.

---

## Phase 2 — WARNING Hardening

### 2.1 HTML Sanitization (`sanitize-html`)

**Choice: `sanitize-html`** (pure-JS, no native deps, battle-tested for Unicode XSS coverage, server-side optimized).

| Option | Pro | Con |
|---|---|---|
| `sanitize-html` (chosen) | Pure JS, lightweight, fast for server-side, explicitly covers Unicode escapes and SVG payloads, active maintenance | Less UI framework heritage than DOMPurify |
| `isomorphic-dompurify` (rejected) | Browser + Node, jsdom shim | Heavier (includes jsdom), not meaningfully better for server-side email sanitization |

**Allowlist config** (email-friendly, per spec):

```typescript
// backend/src/lib/sanitizeEmailHtml.ts (new — small, single-purpose)
import createSanitize from 'sanitize-html';

const sanitize = createSanitize({
  allowedTags: ['a', 'b', 'i', 'em', 'strong', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote'],
  allowedAttributes: {
    'a': ['href', 'target', 'rel'],
  },
  allowedSchemes: ['https', 'mailto'],
  enforceHtmlBoundary: true,
});

export function sanitizeEmailHtml(html: string): string {
  return sanitize(html);
}
```

**Why `sanitize-html` (not DOMPurify)**: pure-JS means no jsdom dependency, faster startup, smaller bundle. XSS coverage is equivalent for server-side email rendering. The proposal's Phase 2 approach already chose `sanitize-html` over the custom hand-rolled sanitizer; DOMPurify was never proposed.

Replace the hand-rolled `sanitizeHtml()` at `agents.service.ts:1045-1075` with a re-export of `sanitizeEmailHtml`. Then change the single call site at `agents.service.ts:2114`.

**Test vectors** (map the issue's 4 XSS vectors to test cases):

| Vector | Payload (LLM-typical) | Expected after sanitize |
|---|---|---|
| Unicode escapes | `&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)` | `alert(1)` (numeric character references decoded then stripped; `javascript:` scheme blocked by `allowedSchemes`) |
| SVG with active content | `<svg onload=alert(1)>` | `` (empty — `svg` is not in `allowedTags`) |
| Attribute-based XSS | `<a href="javascript:alert(1)">x</a>` | `<a>x</a>` (`javascript:` not in `allowedSchemes`; tag content kept) |
| Tab/newline splitting | `<scr\tipt>alert(1)</scr\nipt>` | `` (`script` not in `allowedTags`) |

**Legitimate markup survival** is the negative test: `<a href="https://x.com">link</a>`, `<b>bold</b>`, `<ul><li>item</li></ul>`, `<h1>title</h1>` must all pass through unchanged.

### 2.2 Error Message Sanitization

**Wrapper** — `backend/src/lib/withSanitizedErrors.ts` (new):

```typescript
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

export async function withSanitizedErrors<T>(
  op: string,                                   // e.g. 'insights.query'
  userId: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err: unknown) {
    if (err instanceof AppError) throw err;     // 4xx — let through
    const detail = err instanceof Error ? err.message : String(err);
    logger.error({ err: detail, op, userId }, 'DB error — sanitized for client');
    throw new AppError('Error executing query', 500);
  }
}
```

**What stays specific** (NOT wrapped): `AppError` (any 4xx), `ZodError` (validation), rate-limit `429`, credit `402`.

**Call sites** to apply in `agents.service.ts`:
- `insightsService.query` — wrap the pool.query call (line 1332)
- `insightsService.chatStream` — wrap the SQL execution block (line 2275 area)
- `insightsService.compareEntities` — wrap both entity SQL blocks (line 2275 inside the loop)
- `predictChurn` — wrap the `studentDataQuery` (line 1685)
- `generateRecoveryEmail` — wrap the `studentQuery` (line 2018)

**Test**: mock `pool.query` to throw `new Error('violates foreign key constraint "orders_product_id_fkey"')`. Assert the response body is `{ error: 'Error executing query' }` and the log entry contains the full constraint name.

### 2.3 `conversationId` Contract (Spec Choice Confirmed)

**Spec chose option (a) — persist a real `AgentConversation`. Confirmed.** The codebase already exposes `createConversation` (line 192) and `addMessage` (line 215) — reuse them.

**Schema change** (in `backend/db/init/15-tutor-conversations.sql`, new file per `reusable-resources.md §10` convention):

```sql
-- 15-tutor-conversations.sql
-- SDD: fix-agents-service-gga-findings (Phase 2, finding #8)
-- Adds agent_type='tutor' support to existing agent_conversations table.
-- The table already exists from Phase 5; no DDL needed unless we want a
-- dedicated messages table. Decision: reuse agent_messages (already exists).
-- No-op migration — included for documentation continuity.
```

Actually no DDL change is required — `agent_conversations.agent_type` is already a free-text column (line 199: `INSERT INTO ... agent_conversations (agent_type, product_id, user_id, metadata)`). The fix is in `tutorService.chat` (line 762) and `tutorService.chatStream` (line 849):

```typescript
// AFTER (tutorService.chat — line 762)
const conv = await createConversation('tutor', productId, userId, { productId });
await addMessage(conv.id, 'user', message);
// ... existing LLM call ...
await addMessage(conv.id, 'assistant', response);
return { response, conversationId: conv.id };   // ← real id, not productId
```

**Route + test updates**:
- `backend/src/routes/ai.routes.ts` — no change (the response shape is the same; only the value semantics change)
- `backend/src/__tests__/services/ai/agents.service.test.ts` — update the `tutorService.chat` test to assert `conversationId` matches the format of `createConversation` return (UUID v4), not the productId

---

## Phase 3 — Architectural

### 3.1 Primary DB — `SET LOCAL ROLE` (No Replica)

**Decision: Option B — primary DB only, no read replica in this cycle.**

Option B (views + role + RLS on primary) achieves the same security guarantees as Option A (replica) for the GGA findings, without the DBA work (streaming replication, lag monitoring, backup schedule) that Option A requires. Read replica is deferred to Phase 4 when it becomes an ops/scale requirement.

The execution path: `validateGeneratedSQL()` (first gate) → app builds query → `withReadOnlyRole()` helper → executes via the existing `pool` with `SET LOCAL ROLE ai_insights_ro` → returns results → audit row written.

```
                     ┌──────────────────────────────────────┐
                     │       agents.service.ts               │
                     │                                       │
  LLM-generated SQL  │  ┌──────────────────────────────┐    │
  ─────────────────► │  │  withReadOnlyRole(userId)   │    │
                     │  │  (SET LOCAL ROLE helper)    │    │
                     │  └──────────────┬───────────────┘    │
                     │                 │                    │
                     │                 ▼                    │
                     │  ┌──────────────────────────────┐    │
                     │  │  pool (primary, existing)    │────┼──► PG PRIMARY
                     │  │  + SET LOCAL ROLE ai_insights_ro│   │
                     │  └──────────────────────────────┘    │
                     │                 │                    │
                     │                 ▼                    │
                     │  ┌──────────────────────────────┐    │
                     │  │  ai_sql_audit (write)        │    │
                     │  └──────────────────────────────┘    │
                     └──────────────────────────────────────┘
```

**No new pool config** — `aiInsightsPool` does not exist. The app reuses the existing `pool` with `SET LOCAL ROLE` to enforce least-privilege on the primary.

**Note on `aiInsightsPool`**: If a replica is added in Phase 4, the wrapper would route to `aiInsightsPool` instead of `pool`. The `withReadOnlyRole()` helper signature is designed to make this swap mechanical (change one pool reference, keep the wrapper).

### 3.2 Curated View Layer

**Decision: 5 views** (not 6 — `balances` in the allowlist refers to `user_balances` which uses `user_id` not `creator_id`; the `ai_insights_safe_balances` view joins through `orders` to get `creator_id`):

| View | Source | Columns (safe, no PII) |
|---|---|---|
| `ai_insights_safe_orders` | `orders` JOIN `products` | `id`, `product_id`, `creator_id`, `buyer_id`, `total_amount`, `currency`, `status`, `created_at` |
| `ai_insights_safe_products` | `products` | `id`, `creator_id`, `title`, `type`, `status`, `created_at` |
| `ai_insights_safe_users` | `users` | `id`, `username` (no email/fullname), `level`, `created_at` |
| `ai_insights_safe_commissions` | `commissions` JOIN `users` | `id`, `order_id`, `user_id` (recipient), `amount`, `type`, `status`, `created_at` |
| `ai_insights_safe_reviews` | `product_reviews` JOIN `products` | `id`, `product_id`, `creator_id`, `user_id`, `rating`, `created_at` (no `content` text — PII risk) |
| `ai_insights_safe_questions` | `product_questions` | `id`, `product_id`, `creator_id`, `user_id`, `question`, `created_at` |

**Note on `product_questions` exclusion**: omitted from the views table because the LLM query surface does not target this table in the current allowlist. The `compareEntities` period analysis uses `orders` and `products` primarily; `product_questions` is out of scope for Phase 3.

**`creator_id` embedding strategy**: reviews and orders both JOIN to `products.creator_id` — this is the key that enables RLS. Commission rows that reference `user_id` (not `creator_id`) are scoped by embedding the commission's `order_id`'s `creator_id`.

**Why `user_balances` is NOT a view**: `user_balances` uses `user_id` directly (no `creator_id` join path). The view would need to expose `user_id` as the isolation key, but the allowlist's intent is to scope LLM-SQL by the creator making the request. Since `user_balances` stores the balance of a creator/affiliate for a currency, we embed `creator_id` by joining through `orders` where `orders.buyer_id = users.id` and `products.creator_id` is the requestor's id — but this is complex. Alternatively, add a comment that `user_balances` is accessed only for the requesting user's own balance (self-lookup, no cross-user risk), and the view exposes `user_id` with RLS scoping on that.

**`creator_id` embedding for `user_balances`**: The view joins `user_balances → users` (where `user_id = id`) and does NOT expose `creator_id` — instead RLS enforces `current_setting('app.user_id') = user_id` (the requestor is reading their own balance). This is valid because the requestor's `userId` IS their own `user_id` for self-lookups.

**Note on PII**: `users.email` and `users.fullname` are NOT in any view. `ai_insights_safe_users` exposes only `id`, `username`, `level`, `created_at`.

### 3.3 Least-Privilege Role + RLS + Audit

**DB init scripts**: `16-ai-insights-views.sql`, `17-ai-insights-role.sql`, `18-ai-insights-rls.sql`, `19-ai-sql-audit.sql`.

```sql
-- 17-ai-insights-role.sql
CREATE ROLE ai_insights_ro NOLOGIN;
GRANT CONNECT ON DATABASE crema_db TO ai_insights_ro;
GRANT USAGE ON SCHEMA public TO ai_insights_ro;
GRANT SELECT ON ai_insights_safe_orders, ai_insights_safe_products,
                ai_insights_safe_users, ai_insights_safe_commissions,
                ai_insights_safe_reviews
  TO ai_insights_ro;
-- Explicit REVOKE on the underlying tables (defense in depth):
REVOKE ALL ON product_reviews, product_questions, users, orders, products, commissions, user_balances
  FROM ai_insights_ro;
```

**TS wrapper** (`backend/src/lib/withReadOnlyRole.ts`):

```typescript
import { pool } from '../db/index';  // ← existing pool, not aiInsightsPool

export async function withReadOnlyRole<T>(
  userId: string,
  fn: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL ROLE ai_insights_ro");
    await client.query("SET LOCAL app.current_creator_id = $1", [userId]);  // for RLS
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Why `SET LOCAL app.current_creator_id`?** The RLS policies use `current_setting('app.current_creator_id')::uuid` as the predicate. The session variable is set at transaction start and resets at commit/rollback.

**RLS policies** (18-ai-insights-rls.sql) — one per underlying table:

```sql
-- 18-ai-insights-rls.sql
ALTER TABLE product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews FORCE ROW LEVEL SECURITY;  -- applies to table owner too

CREATE POLICY ai_insights_creator_isolation ON product_reviews
  USING (product_id IN (
    SELECT id FROM products WHERE creator_id = current_setting('app.current_creator_id')::uuid
  ));
```

**Audit log** (19-ai-sql-audit.sql) — retention managed via the project's existing BullMQ scheduler, NOT pg_cron:

```sql
CREATE TABLE ai_sql_audit (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL,
  sql_text TEXT NOT NULL,
  sql_hash CHAR(64) NOT NULL,         -- sha256 for dedup/analysis
  result_count INTEGER,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ai_sql_audit_creator ON ai_sql_audit(creator_id, created_at DESC);
```

**Retention via BullMQ** (following the project's existing `memory-cleanup` pattern):
- In `scheduler.ts`: add `{ name: 'audit-cleanup', pattern: '0 0 * * *' }` (daily at midnight)
- In `main.worker.ts`: add case `'audit-cleanup'` that runs:
  ```sql
  DELETE FROM ai_sql_audit WHERE created_at < NOW() - INTERVAL '90 days';
  ```
- The `memory-cleanup` job already uses `pool.query` with parameterized batched DELETEs — the `audit-cleanup` follows the same pattern but is simpler (no cursor, single daily DELETE).

Audit writes happen inside `withReadOnlyRole` after the query succeeds (or after error, with `success = false`).

**Verify with `EXPLAIN`** (per spec scenario):

```sql
SET ROLE ai_insights_ro;
SET app.current_creator_id = 'aaaa-bbbb-...';
EXPLAIN SELECT * FROM ai_insights_safe_reviews;
-- Expect: filter on subplan referencing current_setting('app.current_creator_id')
```

---

## File Change Summary

| File | Action | Phase | Notes |
|---|---|---|---|
| `backend/src/services/ai/agents.service.ts` | **Modify** — fix SQL injection (×2), swap sanitizer, error wrapper, persist tutor conversation, wire `withReadOnlyRole` into validateGeneratedSQL execution | 1, 2, 3 | +180 / −40 |
| `backend/src/utils/routeHelpers.util.ts` | **Modify** — add `verifyBuyerOfProduct`, `verifyCreatorHasDataInPeriod` | 1 | +50 |
| `backend/src/lib/sanitizeEmailHtml.ts` | **Create** — `sanitize-html` config | 2 | +20 |
| `backend/src/lib/withSanitizedErrors.ts` | **Create** — error wrapper | 2 | +25 |
| `backend/src/lib/withReadOnlyRole.ts` | **Create** — `SET LOCAL ROLE ai_insights_ro` + audit write helper (uses existing `pool`, not a new pool) | 3 | +40 |
| `backend/db/init/15-tutor-conversations.sql` | **Create** — no-op, doc-only (agent_type='tutor' already works) | 2 | +5 |
| `backend/db/init/16-ai-insights-views.sql` | **Create** — 5 views (orders, products, users, commissions, reviews) | 3 | +50 |
| `backend/db/init/17-ai-insights-role.sql` | **Create** — `ai_insights_ro` role + REVOKE on underlying tables | 3 | +15 |
| `backend/db/init/18-ai-insights-rls.sql` | **Create** — RLS policies on 5 tables (defense-in-depth) | 3 | +40 |
| `backend/db/init/19-ai-sql-audit.sql` | **Create** — audit table + indexes + 90-day retention note | 3 | +20 |
| `backend/src/queues/scheduler.ts` | **Modify** — add `audit-cleanup` job (daily, 90-day retention) | 3 | +3 |
| `backend/src/queues/main.worker.ts` | **Modify** — add `audit-cleanup` case (parameterized DELETE) | 3 | +15 |
| `backend/src/__tests__/services/ai/agents.service.test.ts` | **Modify** — SQL injection regression, auth gap regression, sanitizer tests, error wrapper test, tutor conversation test, RLS tests, audit log tests | 1, 2, 3 | +350 |
| `docs/project/reusable-resources.md` | **Modify** — append to §10 init-script inventory, add new lib helpers to §3 | 2, 3 | +15 |

**Total estimated**: ~810 new/modified lines. Phase 3 alone is ~125 lines of DB DDL + 40 lines of TS wrappers + 18 lines of scheduler changes.

---

## Test Plan (Per Phase)

### Phase 1

| Layer | What to test | Approach |
|---|---|---|
| Unit | SQL injection in `qaService.updateConfig` | `vi.spyOn(pool, 'query')`; assert payload in params, not in SQL string |
| Unit | SQL injection in `tutorService.updateConfig` | Same pattern |
| Unit | `predictChurn` 403 on cross-creator | Mock `pool.query` to return `[]` for ownership check |
| Unit | `generateRecoveryEmail` 404 on non-buyer | Mock the buyer-join query to return `[]` |
| Unit | `compareEntities` 403 on period with zero orders | Mock `verifyCreatorHasDataInPeriod` to throw |
| Integration | `POST /api/ai/insights/recover/email` 404 with non-buyer `targetUserId` | supertest + seeded DB |

### Phase 2

| Layer | What to test | Approach |
|---|---|---|
| Unit | `sanitizeEmailHtml` strips 4 XSS vectors | Direct calls with the payloads from §2.1 |
| Unit | `sanitizeEmailHtml` preserves legit markup | Direct calls with `<a>`, `<b>`, `<ul>`, `<h1>` |
| Unit | `withSanitizedErrors` re-throws `AppError` | Pass-through assertion |
| Unit | `withSanitizedErrors` replaces `Error` with generic 500 | Mock `pool.query` to throw `Error('...')` |
| Unit | `tutorService.chat` returns real `conversationId` | Assert UUID v4 format, not productId |
| Integration | `POST /api/ai/products/:id/tutor/chat` returns real conversationId | supertest |

### Phase 3

| Layer | What to test | Approach |
|---|---|---|
| Unit | `withReadOnlyRole` sets `ai_insights_ro` + `app.current_creator_id` | Mock `client.query` to capture the two `SET LOCAL` calls; assert role + session var |
| Unit | RLS policy filters cross-creator | Insert rows for creators A and B; run query as A via `withReadOnlyRole(A)`; assert only A's rows |
| Unit | `ai_sql_audit` row written on every execution (success + failure) | Mock `client.query`; assert the audit `INSERT` call after query |
| Integration | `SET LOCAL ROLE` is reverted after rollback | Run query that throws; verify subsequent query (new transaction) does NOT have the role set |
| Integration | `EXPLAIN` shows RLS predicate on `ai_insights_safe_orders` | Run `EXPLAIN` via the app pool as `ai_insights_ro`; assert filter on `creator_id` |
| E2E | LLM-SQL round-trip via `withReadOnlyRole` + audit row visible in DB | supertest → service → primary pool → audit row queryable |

---

## Risk Mitigations

| Proposal risk | Concrete mitigation in code |
|---|---|
| Param queries change query plan | `EXPLAIN ANALYZE` before/after on the test suite; pgbouncer connection reuse unchanged |
| Auth enforcement surfaces latent data leaks | Coordinate with product team before deploy; add a feature flag `STRICT_CREATOR_AUTH` (off → on) to roll out gradually |
| `sanitize-html` config too aggressive | Allowlist tests for `<a>`, `<b>`, `<ul>`, `<h1>`-`<h3>`; review with email-rendering frontend |
| Generic errors hurt UX | Only DB errors (5xx) are genericized; 4xx stays specific (validation, credits, rate-limit) |
| RLS misconfigured (forgot a table) | Test matrix per view + `EXPLAIN` per policy; DB specialist review; start with `FORCE ROW LEVEL SECURITY` so the table owner is not exempt |
| `SET LOCAL ROLE` per-request overhead | Pool-level connection reuse; benchmark under realistic load (5 churn + 10 compare + 10 recover/min/user) |
| Views don't cover all LLM use cases | The existing `validateGeneratedSQL` allowlist is the source of truth — extend views to cover anything the allowlist permits |

---

## Open Questions (Resolved)

- **Phase 3 architecture**: Option B (views + RLS on primary DB) chosen. Option A (replica) deferred to Phase 4. Rationale: Option B is security-complete for the GGA findings; the replica adds operational isolation, not security isolation. Current infrastructure (single `crema-db` container) has no replica configured; standing one up requires DBA engagement, replication monitoring, and separate backup schedule.
- **`compareEntities` period validation**: When a creator has zero orders globally (new creator with no data in any period), the period guard should return **200 OK with empty data** (`{ items: [], meta: { total: 0 } }`). This is the most RESTful and non-leaky pattern — "your query is valid, you have no data" is not an error. The LLM prompt gets the empty result and handles it gracefully. A 404 would confuse the semantics (the period exists, just has no data for this creator).
- **Audit retention**: 90-day rolling retention via BullMQ scheduler (same pattern as `memory-cleanup` job). Add `audit-cleanup` job to `scheduler.ts` with daily pattern and a parameterized `DELETE WHERE created_at < NOW() - INTERVAL '90 days'` in `main.worker.ts`. No pg_cron needed — reuse the existing infra.
- **`sanitize-html` vs DOMPurify**: chose `sanitize-html` (pure-JS, lighter, faster for server-side). The `sanitize-html` choice is the original proposal direction — no DOMPurify default ever existed in the spec. The rationale here is operational (pure-JS, no jsdom dependency, server-side optimized).

---

## Project Helpers Reused

- `verifyProductOwnership` (`backend/src/utils/routeHelpers.util.ts:16`) — used directly in `predictChurn` and `generateRecoveryEmail`.
- `createConversation` / `addMessage` (`agents.service.ts:192` / `:215`) — reused for tutor conversation persistence.
- `AppError` (`backend/src/errors/AppError.ts`) — pattern for sanitized 500s.
- No SQL placeholder builder found in `lib/` or `repositories/` — the counter-based fix is local to `updateConfig`.

---

## References

- **Issue**: [#42](https://github.com/egkike/crema/issues/42)
- **Proposal**: [`proposal.md`](./proposal.md)
- **Spec**: [`spec.md`](./spec.md)
- **Reference design**: `docs/project/ai-features/sdd/ai-insights-expansion/design.md` (tone/structure/format)
- **Project conventions**: `AGENTS.md` §"Project Conventions" (no DI, no decorators, direct repo imports, English for code identifiers)
- **Init script convention**: `docs/project/reusable-resources.md` §10
