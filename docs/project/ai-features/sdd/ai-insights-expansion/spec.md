# AI Insights Expansion Specification

**Change**: `ai-insights-expansion`  
**PRD Ref**: PRD.md §4.8  
**Type**: AI Feature — New Capabilities  
**Artifact Store**: `openspec` (file-backed)  
**Status**: ✅ **COMPLETED** (Junio 2026) — All requirements implemented. See verify-report-rejudge-2.md for final verdict.

---

## Purpose

Expand the existing `insightsService` with three net-new AI-driven capabilities:
- **Churn Prediction** — identify students at risk of abandoning a product before churn occurs.
- **Recovery Email Generation** — generate personalized, ready-to-send HTML email content to re-engage at-risk students.
- **A/B Comparatives** — compare metrics between two periods or two products with natural-language narrative, percentage deltas, and actionable recommendations.

All new capabilities MUST reuse the existing backend infrastructure (LLM service, AI credit service, PostgreSQL pool, Zod schemas, JWT auth, rate limiting) and MUST NOT introduce new service singletons.

---

## Requirements

### Requirement: Churn Prediction (`insights.predict`)

The system MUST accept a churn prediction request for a product, compute a per-student churn score (0–100) using heuristics over historical data, generate LLM narrative and risk factors, persist the prediction, and return a ranked list of at-risk students.

#### Scenario: Successful churn prediction

- GIVEN an authenticated creator with a valid JWT and sufficient AI credits (≥ 5)
- WHEN the creator sends `POST /api/ai/insights/predict/churn` with `productId` (and optional `threshold`)
- THEN the system MUST:
  1. Validate the request body with `churnPredictionSchema` (Zod).
  2. Enforce rate limiting via `churnPredictionLimiter` (5 requests per minute per user).
  3. Verify that the requesting user is the creator/owner of the product.
  4. Deduct 5 AI credits via `aiCreditService.useCredits()`.
  5. Execute parameterized SQL queries to fetch historical student data:
     - students enrolled in the product,
     - days since last access per student,
     - course progress percentage per student,
     - interaction history (Q&A, reviews) in the last 60 days.
  6. Compute a per-student churn score with the following heuristic factors:
     - last access > 30 days ago → +40 risk points,
     - progress < 20% AND last access > 14 days ago → +30 risk points,
     - no interactions in 60 days → +20 risk points,
     - >10 accesses in 7 days but progress < 10% → +10 risk points.
     Total score MUST be capped at 100.
  7. Invoke the LLM to produce a qualitative narrative and recommended action per at-risk student.
  8. Persist each prediction row into `churn_predictions` with columns: `creator_id`, `product_id`, `target_user_id`, `churn_score`, `risk_factors` (JSONB), `narrative`, `recommended_action`, `data_snapshot` (JSONB).
  9. Return a JSON payload containing `predictions` as an array of objects with at least `userId`, `userName`, `churnScore`, `riskFactors`, `narrative`, and `recommendedAction`.

#### Scenario: Insufficient AI credits

- GIVEN an authenticated creator with fewer than 5 AI credits
- WHEN the creator requests churn prediction
- THEN the system MUST return HTTP 402 (Payment Required) or HTTP 400 with an `AppError` indicating insufficient credits, and MUST NOT persist any prediction or call the LLM.

#### Scenario: Creator does not own the product

- GIVEN an authenticated user who is not the creator of the requested `productId`
- WHEN the user requests churn prediction
- THEN the system MUST return HTTP 403 (Forbidden) and MUST NOT execute queries, deduct credits, or call the LLM.

#### Scenario: Rate limit exceeded

- GIVEN an authenticated creator who has already made 5 churn prediction requests in the current 1-minute window
- WHEN the creator sends another churn prediction request
- THEN the system MUST return HTTP 429 (Too Many Requests) with standard `Retry-After` headers.

---

### Requirement: Recovery Email Generation (`insights.recover`)

The system MUST accept a request to generate a personalized recovery email for a specific at-risk student, produce subject + HTML body + preview text using the LLM, sanitize the HTML output, persist the generation, and return the email content to the creator.

#### Scenario: Successful recovery email generation

- GIVEN an authenticated creator with a valid JWT and sufficient AI credits (≥ 3)
- WHEN the creator sends `POST /api/ai/insights/recover/email` with `productId`, `targetUserId`, and optional `tone` (`empathic`, `direct`, or `motivational`)
- THEN the system MUST:
  1. Validate the request body with `recoveryEmailSchema` (Zod).
  2. Enforce rate limiting via `recoveryEmailLimiter` (10 requests per minute per user).
  3. Verify that the requesting user is the creator/owner of the product.
  4. Deduct 3 AI credits via `aiCreditService.useCredits()`.
  5. Fetch real student data (name, email, progress, last access, interaction history) using parameterized SQL.
  6. Build an LLM prompt with strict system instructions, real student data, and the requested tone.
  7. Call the LLM and parse the response into `subject`, `bodyHtml`, and `previewText`.
  8. Sanitize `bodyHtml` server-side to remove `<script>`, event handlers (`onclick`, `onerror`, etc.), and other XSS vectors before returning or persisting.
  9. Persist the result into `recovery_emails` with columns: `creator_id`, `product_id`, `target_user_id`, `subject`, `body_html`, `preview_text`, `tone`, `churn_prediction_id` (optional FK).
  10. Return a JSON payload containing `email` (`subject`, `bodyHtml`, `previewText`), `studentName`, and `productName`.

#### Scenario: LLM generates unsafe HTML

- GIVEN a successful LLM response that contains `<script>` tags or inline event handlers
- WHEN the system processes the response
- THEN the sanitization step MUST strip all dangerous markup, and the persisted and returned `bodyHtml` MUST be safe for rendering in a browser.

#### Scenario: Creator does not own the product

- GIVEN an authenticated user who is not the creator of the requested `productId`
- WHEN the user requests recovery email generation
- THEN the system MUST return HTTP 403 and MUST NOT call the LLM, deduct credits, or persist any record.

#### Scenario: Rate limit exceeded

- GIVEN an authenticated creator who has already made 10 recovery email requests in the current 1-minute window
- WHEN the creator sends another recovery email request
- THEN the system MUST return HTTP 429 with standard `Retry-After` headers.

---

### Requirement: A/B Comparatives (`insights.compare`)

The system MUST accept a comparative analysis request between two entities (periods or products), generate and safely execute SQL for each entity, invoke the LLM for narrative and deltas, persist the result, and return raw data + insight + recommendations.

#### Scenario: Successful A/B comparative

- GIVEN an authenticated creator with a valid JWT and sufficient AI credits (≥ 3)
- WHEN the creator sends `POST /api/ai/insights/compare` with `entityType` (`period` or `product`), `entityA`, `entityB`, and `metrics[]` (`revenue`, `sales`, `conversion`, `engagement`, `reviews`)
- THEN the system MUST:
  1. Validate the request body with `compareSchema` (Zod); `entityType` MUST be constrained to `period` or `product`.
  2. Enforce rate limiting via `compareLimiter` (10 requests per minute per user).
  3. Deduct 3 AI credits via `aiCreditService.useCredits()`.
  4. For each entity (`A` and `B`), build a natural-language prompt instructing the LLM to generate a parameterized SQL query for the requested metrics.
  5. Validate every generated SQL statement with the existing `validateGeneratedSQL()` function; reject any statement that fails validation.
  6. Execute each validated SQL query using the existing `pool` with parameterized values.
  7. If one entity query fails, the system MUST return partial results for the successful entity alongside an explicit `error` field for the failed entity; it MUST NOT fail the entire request with a 500 error unless both queries fail or the LLM/DB is unreachable.
  8. Feed both result sets into the LLM with a comparative analysis prompt.
  9. Parse the LLM response into:
     - `narrative` (natural-language comparative summary),
     - `deltas` (object with per-metric `a`, `b`, `delta`, `deltaPercent`),
     - `recommendation` (actionable advice).
  10. Persist the combined query text, raw results, and LLM output into `insights_history` (or a dedicated comparative history table if introduced).
  11. Return a JSON payload containing `entityA` (`label`, `data`), `entityB` (`label`, `data`), `narrative`, `deltas`, and `recommendation`.

#### Scenario: SQL injection attempt in generated query

- GIVEN an LLM-generated SQL statement that contains disallowed patterns (e.g., raw string concatenation, `DROP`, `DELETE` without `WHERE`, or schema mutations)
- WHEN `validateGeneratedSQL()` evaluates the statement
- THEN the system MUST reject the query, return HTTP 400 with a generic validation-failed message, and MUST NOT execute the SQL.

#### Scenario: Rate limit exceeded

- GIVEN an authenticated creator who has already made 10 compare requests in the current 1-minute window
- WHEN the creator sends another compare request
- THEN the system MUST return HTTP 429 with standard `Retry-After` headers.

---

### Requirement: Credit Charging

The system MUST deduct the correct AI credit cost for every successful invocation of a new capability.

#### Scenario: Credit deduction accuracy

- GIVEN any authenticated creator invoking a new insights capability
- WHEN the request passes auth, validation, rate limiting, and authorization checks
- THEN `aiCreditService.useCredits()` MUST be called exactly once with:
  - `insights.predict` → amount `5`,
  - `insights.compare` → amount `3`,
  - `insights.recover` → amount `3`.

---

### Requirement: Rate Limiting

The system MUST apply dedicated, per-endpoint rate limiters to all new insights endpoints.

#### Scenario: Rate limiter registration

- GIVEN the backend application is starting
- WHEN the route registration phase runs
- THEN the following limiters MUST be mounted on their respective routes:
  - `churnPredictionLimiter` on `POST /api/ai/insights/predict/churn` (5 req/min),
  - `compareLimiter` on `POST /api/ai/insights/compare` (10 req/min),
  - `recoveryEmailLimiter` on `POST /api/ai/insights/recover/email` (10 req/min).

---

### Requirement: Database Schema

The system MUST provide the new tables `churn_predictions` and `recovery_emails` with appropriate indexes and foreign-key constraints.

#### Scenario: Database initialization

- GIVEN a fresh database initialized with `backend/db/init/05-ai-tables.sql`
- WHEN the script executes
- THEN the following MUST exist:
  - Table `churn_predictions` with columns `id` (UUID PK), `creator_id` (UUID, FK to `users`), `product_id` (UUID, FK to `products`), `target_user_id` (UUID, FK to `users`), `churn_score` (INTEGER, CHECK 0–100), `risk_factors` (JSONB), `narrative` (TEXT), `recommended_action` (TEXT), `data_snapshot` (JSONB), `created_at` (TIMESTAMPTZ).
  - Indexes `idx_churn_predictions_creator`, `idx_churn_predictions_product`, `idx_churn_predictions_target`.
  - Table `recovery_emails` with columns `id` (UUID PK), `creator_id` (UUID, FK to `users`), `product_id` (UUID, FK to `products`), `target_user_id` (UUID, FK to `users`), `subject` (TEXT, NOT NULL), `body_html` (TEXT, NOT NULL), `preview_text` (VARCHAR(150)), `tone` (VARCHAR(20), CHECK `empathic`/`direct`/`motivational`), `churn_prediction_id` (UUID, FK to `churn_predictions` ON DELETE SET NULL), `created_at` (TIMESTAMPTZ).
  - Indexes `idx_recovery_emails_creator`.

---

### Requirement: Orchestrator Registration

The system MUST register the three new capabilities in the AI orchestrator so they are discoverable via `skillsRegistry.listCapabilities()`.

#### Scenario: Capability registration

- GIVEN the AI service index module (`backend/src/services/ai/index.ts`) is loaded
- WHEN the orchestrator initializes
- THEN the following capabilities MUST be registered:
  - `insights.predict` mapped to orchestrator ID `insights-predict`,
  - `insights.compare` mapped to orchestrator ID `insights-compare`,
  - `insights.recover` mapped to orchestrator ID `insights-recover`.

---

### Requirement: No Regression in Existing Capabilities

The system MUST NOT alter or degrade the behavior of existing `insightsService` capabilities.

#### Scenario: Existing insights endpoints remain intact

- GIVEN the existing capabilities `insights.ask`, `insights.stream`, and dashboards CRUD
- WHEN the `ai-insights-expansion` change is deployed
- THEN all existing endpoints, handlers, schemas, rate limiters, and database objects MUST continue to function with identical request/response contracts and performance characteristics.

---

### Requirement: Input Validation

The system MUST reject malformed or unauthorized requests before performing any credit deduction, LLM call, or database write.

#### Scenario: Invalid request body

- GIVEN a request with missing required fields, wrong types, or out-of-range values
- WHEN the request reaches the route handler
- THEN Zod validation MUST fail, the system MUST return HTTP 400 with a structured error payload, and MUST NOT deduct credits, call the LLM, or write to the database.

---

### Requirement: Observability

The system MUST emit structured logs for every new capability invocation.

#### Scenario: Logging on churn prediction

- GIVEN a churn prediction request is received
- WHEN the handler begins processing
- THEN `logger.info` MUST emit a log line containing the operation name (`insights.predict`), the authenticated `userId`, and sanitized parameters (no PII such as raw email addresses).

#### Scenario: Logging on errors

- GIVEN any failure during LLM invocation, SQL execution, or credit deduction
- WHEN the error is caught
- THEN `logger.error` MUST emit a log line with the error message and contextual metadata, and MUST NOT include sensitive data (passwords, tokens, full SQL parameter values).

---

## Security Requirements

### Requirement: Authentication

All new endpoints MUST be protected by `jwtAuthMiddleware`; unauthenticated requests MUST receive HTTP 401.

### Requirement: Authorization

For `insights.predict` and `insights.recover`, the system MUST verify product ownership before executing business logic. For `insights.compare`, the system MUST verify that the requesting user owns the data being compared.

### Requirement: SQL Injection Prevention

All database queries generated by the LLM for comparatives MUST pass through `validateGeneratedSQL()` before execution. Dynamic schema or table names MUST be validated against an explicit allowlist.

### Requirement: XSS Prevention in Recovery Emails

HTML generated by the LLM for recovery emails MUST be sanitized server-side before persistence and before inclusion in the JSON response. The sanitization MUST remove `<script>` tags, inline event handlers, `javascript:` URIs, and other common XSS vectors.

### Requirement: Prompt Injection Defense

LLM prompts that incorporate user-supplied input MUST wrap that input in clear delimiters (e.g., `[USER_INPUT_START]` / `[USER_INPUT_END]`) and MUST instruct the model to treat the wrapped content as untrusted data, not as instructions.

### Requirement: Error Handling

The system MUST return generic error messages in production (no stack traces, no internal file paths, no raw SQL errors). Detailed error information MAY be logged server-side.
