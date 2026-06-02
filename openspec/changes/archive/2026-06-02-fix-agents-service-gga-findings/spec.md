# Fix Agents Service GGA Findings — Specification

**Change**: `fix-agents-service-gga-findings` · **Issue**: [#42](https://github.com/egkike/crema/issues/42)  
**Date**: Junio 2026 · **Status**: ✅ COMPLETED · **Author**: `sdd-spec`  
**File**: `backend/src/services/ai/agents.service.ts`

**MUST** = absolute, **SHOULD** = recommended, **MAY** = optional. Scenarios: GIVEN → WHEN → THEN.

---

## Phase 1 — CRITICAL Security

### 1. SQL Injection Immunity (`updateConfig`)

`qaService.updateConfig` (line 178) and `tutorService.updateConfig` (line 716) MUST use `$N` placeholders for ALL VALUES — no raw interpolation via `${params.slice(1).join(', ')}`.

- **Benign**: GIVEN valid config (`isEnabled: true, model: "gpt-4"`) WHEN SQL is built THEN VALUES use only `$N` placeholders.
- **Malicious payload literal**: GIVEN `model: "'); DROP TABLE students; --"` WHEN `updateConfig` executes THEN payload lands as a literal string via parameter binding.

### 2. Server-Side `creator_id` Enforcement

Two gaps: (a) `compareEntities` (line 2170) checks ownership for `product` but has ZERO enforcement for `period`. (b) `generateRecoveryEmail` (line 2004) fetches user data for ANY `targetUserId` without joining `orders` to verify enrollment. MUST enforce `creator_id` for `period` AND verify `targetUserId` is a confirmed buyer.

- **New creator with zero global orders**: GIVEN creator A with zero orders globally WHEN A sends `compare` with `entityType=period&entityA=2024-01` THEN 200 OK with empty data (new creator — no data is not an error).
- **Creator has orders globally but zero in requested period**: GIVEN creator A (has orders globally) with zero orders in `2024-01` WHEN A sends `compare` with `entityType=period&entityA=2024-01` THEN 403 (valid query, but no data for this creator in this period).
- **Non-student target**: GIVEN creator A (owns P1) and user U who never bought P1 WHEN A sends recovery email with `targetUserId=U` THEN MUST verify U is a buyer before fetching data, else 404/403 without leaking U's info.

---

## Phase 2 — WARNING Hardening

### 3. HTML Sanitization (`sanitize-html`)

Replace custom `sanitizeHtml()` with `sanitize-html` (pure-JS, battle-tested for XSS coverage including Unicode escapes, server-side optimized). Allowlisted: `<a>`, `<b>`, `<i>`, `<p>`, `<ul>`, `<li>`, `<h1>`–`<h3>`. Stripped: `<script>`, `<iframe>`, `<svg>` with active content, `on*` handlers, `javascript:` URIs, Unicode payloads.

- **Unicode XSS**: GIVEN LLM output with `&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;:alert(1)` WHEN sanitized THEN Unicode URI neutralized.
- **Markup preserved**: GIVEN `<a href="...">Retake</a>` and `<b>important</b>` WHEN sanitized THEN links and bold survive.

### 4. Generic DB Error Messages

All DB query paths MUST (a) log full error detail server-side with operation + `userId`, (b) throw generic `AppError('Error executing query', 500)` to client. Rate-limit/credit/validation errors stay specific.

- **Constraint leak**: GIVEN error exposing `violates foreign key constraint "orders_product_id_fkey"` WHEN caught THEN client gets generic 500; server log gets full detail.
- **Rate-limit preserved**: GIVEN user exceeds `compareLimiter` WHEN rate limiter rejects THEN client gets HTTP 429 with `Retry-After` — not genericized.

### 5. `tutorService.chat` Conversation Contract

**Decision**: Option (a) — persist real conversation. Rationale: QA-flow consistency, enables history, current `productId` as `conversationId` is misleading. System MUST create `AgentConversation` rows and return real `id`.

- **Chat returns real ID**: GIVEN authenticated creator with credits WHEN `POST /api/ai/products/:productId/tutor/chat` THEN `conversationId` MUST be a real `agent_conversations` UUID.
- **Streaming persistence**: GIVEN same preconditions via SSE WHEN `chatStream` completes THEN conversation MUST be persisted in `agent_conversations` and `agent_conversation_messages`.

---

## Phase 3 — Architectural

### 6. View Layer + Role + RLS + Audit (Primary DB, Option B — no replica)

(1) Curated views over `orders`, `products`, `users`, `commissions`, `product_reviews`, `product_questions` — safe columns only, no PII, `creator_id` embedded via JOINs. (2) Role `ai_insights_ro` — SELECT only on views, no access to underlying tables. (3) RLS on underlying tables as defense-in-depth. (4) `ai_sql_audit` logs every execution (90-day rolling retention). (5) `validateGeneratedSQL()` is the first gate. Read replica is NOT in this cycle (Phase 4).

- **Role rejects writes**: GIVEN a validated SELECT when executed via `withReadOnlyRole()` THEN any write fails with permission-denied (SET LOCAL ROLE ai_insights_ro allows SELECT only).
- **RLS auto-filters**: GIVEN creators A, B with data in same view WHEN A queries without `WHERE creator_id` THEN RLS restricts to A's rows, verified via `EXPLAIN`.
- **Audit logging**: GIVEN any LLM-SQL execution WHEN query completes THEN `ai_sql_audit` records SQL, `creator_id`, result count, timestamp before response.
- **Validation blocks**: GIVEN statement with `UNION SELECT ... FROM information_schema` WHEN `validateGeneratedSQL()` evaluates it THEN system returns HTTP 400 without executing.
