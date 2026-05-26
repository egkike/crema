# Tasks: AI Insights Expansion

**Change**: ai-insights-expansion
**Type**: AI Feature
**PRD Ref**: PRD.md §4.8
**Mode**: Strict TDD (pnpm run vitest)

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100–1300 (additions across 9 files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 6 PRs (Task 0 → Task 5) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

### PR Breakdown

| PR | Task(s) | Est. Lines | Description |
|----|---------|------------|-------------|
| 1 | Task 0 | ~80 | DB migration + type definitions |
| 2 | Task 1 | ~120 | Zod schemas + rate limiters |
| 3 | Task 2 | ~200 | Service method: predictChurn |
| 4 | Task 3 | ~150 | Service methods: generateRecoveryEmail + compareEntities |
| 5 | Task 4 | ~180 | Orchestrator registration + REST routes |
| 6 | Task 5 | ~300 | Unit tests + integration tests + docs |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

---

## Task 0: Database Migration + Type Definitions

**Scope**: Add `churn_predictions` and `recovery_emails` tables to `05-ai-tables.sql`; add TypeScript interfaces to `ai.types.ts`.

**Files**:
- `backend/db/init/05-ai-tables.sql` — Append sections 7.5 and 7.6
- `backend/src/types/ai.types.ts` — Add `ChurnPrediction`, `RecoveryEmail`, `CompareResult` interfaces

**Actions**:
1. Append to `backend/db/init/05-ai-tables.sql` after section 7.4:

   ```sql
   -- 7.5 Churn Predictions Table
   CREATE TABLE IF NOT EXISTS churn_predictions (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       churn_score INTEGER NOT NULL CHECK (churn_score >= 0 AND churn_score <= 100),
       risk_factors JSONB NOT NULL DEFAULT '[]',
       narrative TEXT,
       recommended_action TEXT,
       data_snapshot JSONB,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   CREATE INDEX IF NOT EXISTS idx_churn_predictions_creator ON churn_predictions(creator_id, created_at DESC);
   CREATE INDEX IF NOT EXISTS idx_churn_predictions_product ON churn_predictions(product_id);
   CREATE INDEX IF NOT EXISTS idx_churn_predictions_target ON churn_predictions(target_user_id);

   -- 7.6 Recovery Emails Table
   CREATE TABLE IF NOT EXISTS recovery_emails (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
       target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       subject TEXT NOT NULL,
       body_html TEXT NOT NULL,
       preview_text VARCHAR(150),
       tone VARCHAR(20) NOT NULL DEFAULT 'empathic' CHECK (tone IN ('empathic', 'direct', 'motivational')),
       churn_prediction_id UUID REFERENCES churn_predictions(id) ON DELETE SET NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   CREATE INDEX IF NOT EXISTS idx_recovery_emails_creator ON recovery_emails(creator_id, created_at DESC);
   ```

2. Append to `backend/src/types/ai.types.ts`:

   ```typescript
   export interface ChurnPrediction {
     id: string;
     creatorId: string;
     productId: string;
     targetUserId: string;
     churnScore: number;
     riskFactors: Array<{ factor: string; weight: number }>;
     narrative: string | null;
     recommendedAction: string | null;
     dataSnapshot: Record<string, unknown> | null;
     createdAt: Date;
   }

   export interface RecoveryEmail {
     id: string;
     creatorId: string;
     productId: string;
     targetUserId: string;
     subject: string;
     bodyHtml: string;
     previewText: string | null;
     tone: 'empathic' | 'direct' | 'motivational';
     churnPredictionId: string | null;
     createdAt: Date;
   }

   export type CompareEntityType = 'period' | 'product';
   export type CompareMetric = 'revenue' | 'sales' | 'conversion' | 'engagement' | 'reviews';

   export interface CompareResult {
     entityA: { label: string; data: Record<string, unknown> };
     entityB: { label: string; data: Record<string, unknown> };
     narrative: string;
     deltas: Record<string, { a: number; b: number; delta: number; deltaPercent: number }>;
     recommendation: string;
   }
   ```

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] Docker DB container restarts and tables are created (`docker compose up -d db`)
- [ ] Tables `churn_predictions` and `recovery_emails` exist with correct columns and indexes

**Rollback**: Comment out the appended SQL in `05-ai-tables.sql`; remove new interfaces from `ai.types.ts`.

---

## Task 1: Zod Schemas + Rate Limiters

**Scope**: Add Zod validation schemas for the three new endpoints; add dedicated rate limiters.

**Files**:
- `backend/src/schemas/ai.schema.ts` — Append `churnPredictionSchema`, `recoveryEmailSchema`, `compareSchema`
- `backend/src/middlewares/rateLimit/rateLimit.ts` — Append `churnPredictionLimiter`, `recoveryEmailLimiter`, `compareLimiter`

**Actions**:

1. Append to `backend/src/schemas/ai.schema.ts`:

   ```typescript
   // Insights: Churn Prediction
   export const churnPredictionSchema = z.object({
     productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
     threshold: z.number().int().min(0).max(100).default(50).optional(),
   });

   // Insights: Recovery Email
   export const recoveryEmailSchema = z.object({
     productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
     targetUserId: z.string().uuid({ message: 'targetUserId must be a valid UUID' }),
     tone: z.enum(['empathic', 'direct', 'motivational']).default('empathic').optional(),
   });

   // Insights: A/B Comparatives
   export const compareSchema = z.object({
     entityType: z.enum(['period', 'product'], { message: 'entityType must be period or product' }),
     entityA: z.string().min(1, { message: 'entityA is required' }),
     entityB: z.string().min(1, { message: 'entityB is required' }),
     metrics: z.array(z.enum(['revenue', 'sales', 'conversion', 'engagement', 'reviews'])).min(1).max(5),
   });

   export type ChurnPredictionRequest = z.infer<typeof churnPredictionSchema>;
   export type RecoveryEmailRequest = z.infer<typeof recoveryEmailSchema>;
   export type CompareRequest = z.infer<typeof compareSchema>;
   ```

2. Append to `backend/src/middlewares/rateLimit/rateLimit.ts` (follow existing pattern):

   ```typescript
   export const churnPredictionLimiter = rateLimit({
     windowMs: 60 * 1000,
     max: 5,
     message: { success: false, error: 'Límite de predicción de churn alcanzado. Intenta de nuevo en 1 minuto.' },
     standardHeaders: true,
     legacyHeaders: false,
     keyGenerator: req => {
       const userId = req.user?.id;
       return userId || ipKeyGenerator(req.ip || '');
     },
     handler: (req, res, _next, options) => {
       logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de churn prediction alcanzado');
       res.status(options.statusCode || 429).json(options.message);
     },
   });

   export const recoveryEmailLimiter = rateLimit({
     windowMs: 60 * 1000,
     max: 10,
     message: { success: false, error: 'Límite de generación de email alcanzado. Intenta de nuevo en 1 minuto.' },
     standardHeaders: true,
     legacyHeaders: false,
     keyGenerator: req => {
       const userId = req.user?.id;
       return userId || ipKeyGenerator(req.ip || '');
     },
     handler: (req, res, _next, options) => {
       logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de recovery email alcanzado');
       res.status(options.statusCode || 429).json(options.message);
     },
   });

   export const compareLimiter = rateLimit({
     windowMs: 60 * 1000,
     max: 10,
     message: { success: false, error: 'Límite de comparativas alcanzado. Intenta de nuevo en 1 minuto.' },
     standardHeaders: true,
     legacyHeaders: false,
     keyGenerator: req => {
       const userId = req.user?.id;
       return userId || ipKeyGenerator(req.ip || '');
     },
     handler: (req, res, _next, options) => {
       logger.warn({ key: req.rateLimit?.key, path: req.path }, 'Límite de comparativas alcanzado');
       res.status(options.statusCode || 429).json(options.message);
     },
   });
   ```

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] Schemas export correctly (import and inspect types)
- [ ] Rate limiters export correctly

**Rollback**: Comment out appended schemas and limiters.

---

## Task 2: Service Method — predictChurn

**Scope**: Implement `insightsService.predictChurn(productId, userId, threshold?)` in `agents.service.ts`.

**Files**:
- `backend/src/services/ai/agents.service.ts` — Append `predictChurn` method to `insightsService` object

**Dependencies**: Task 0 (DB tables + types), Task 1 (schemas — for type reference)

**Actions**:
1. Add `predictChurn` method to `insightsService` export object. The method MUST:
   - Accept `productId: string`, `userId: string`, `threshold?: number`
   - Validate `productId` is non-empty UUID
   - Verify product ownership: `SELECT id FROM "schema".products WHERE id = $1 AND creator_id = $2`
   - Check credits: `aiCreditService.getBalance(userId)` → throw `AppError('Créditos insuficientes', 402)` if < 5
   - Fetch student data for the product via parameterized queries:
     - Students with last activity date and progress
     - Days since last access
     - Interaction count (Q&A + reviews) in last 60 days
   - Compute churn score using heuristics:
     - `daysSinceLastAccess > 30` → +40
     - `progress < 20% AND daysSinceLastAccess > 14` → +30
     - `interactions60d === 0` → +20
     - `accesses7d > 10 AND progress < 10%` → +10
     - `score = Math.min(100, sum of applicable factors)`
   - Filter students where `score >= (threshold ?? 50)`
   - For each at-risk student, call LLM to generate narrative + recommended action
   - Persist predictions to `churn_predictions` table
   - Deduct credits via `aiCreditService.useCredits(userId, 5, 'Churn Prediction', productId)`
   - Return `{ predictions: Array<{ userId, userName, churnScore, riskFactors, narrative, recommendedAction }> }`

2. Use `getValidatedSchema()` for all SQL queries — never hardcode schema name.
3. Use `logger.info` at start, `logger.warn` on low-data conditions, `logger.error` on failures.
4. Wrap LLM calls in try/catch; return partial results if LLM fails but heuristic scores succeed.

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (existing tests must not regress)

**Rollback**: Comment out `predictChurn` method.

---

## Task 3: Service Methods — generateRecoveryEmail + compareEntities

**Scope**: Implement `insightsService.generateRecoveryEmail(...)` and `insightsService.compareEntities(...)` in `agents.service.ts`.

**Files**:
- `backend/src/services/ai/agents.service.ts` — Append `generateRecoveryEmail` and `compareEntities` methods

**Dependencies**: Task 0 (DB tables + types), Task 1 (schemas)

**Actions**:

### generateRecoveryEmail
1. Accept `productId: string`, `targetUserId: string`, `tone?: 'empathic' | 'direct' | 'motivational'`, `creatorId: string`
2. Verify product ownership (same pattern as Task 2)
3. Check credits (3 credits); throw if insufficient
4. Fetch student data: name, email, progress, last access, interaction history
5. Build LLM prompt with system instructions + student data + tone
6. Call LLM; parse response into `{ subject, bodyHtml, previewText }`
7. **Sanitize HTML**: Strip `<script>`, `javascript:`, `on*=` event handlers before persisting or returning
8. Persist to `recovery_emails` table
9. Deduct 3 credits
10. Return `{ email: { subject, bodyHtml, previewText }, studentName, productName }`

### compareEntities
1. Accept `entityType: 'period' | 'product'`, `entityA: string`, `entityB: string`, `metrics: string[]`, `creatorId: string`
2. Check credits (3 credits); throw if insufficient
3. For each entity (A and B):
   - Build NL→SQL prompt for the requested metrics
   - Call LLM to generate SQL
   - Validate with `validateGeneratedSQL()` — reject if invalid
   - Execute validated SQL with safety limits (same as `insightsService.query`)
   - If one entity fails, store `{ error: '...' }` and continue
4. Call LLM with comparative analysis prompt (both result sets)
5. Parse response into `{ narrative, deltas, recommendation }`
6. Persist to `insights_history` table
7. Deduct 3 credits
8. Return `{ entityA: { label, data }, entityB: { label, data }, narrative, deltas, recommendation }`

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (no regression)

**Rollback**: Comment out both methods.

---

## Task 4: Orchestrator Registration + REST Routes

**Scope**: Register three new capabilities in the AI orchestrator; add three REST endpoints to `ai.routes.ts`.

**Files**:
- `backend/src/services/ai/index.ts` — Append `insights-predict`, `insights-compare`, `insights-recover` capability registrations
- `backend/src/routes/ai.routes.ts` — Append three `POST` route handlers

**Dependencies**: Task 2, Task 3 (service methods must exist)

**Actions**:

### Orchestrator (index.ts)
1. Append three capability registrations following the existing pattern (see `insights-ask` at line ~658):
   - `id: 'insights-predict'`, `capability: 'insights.predict'` — handler calls `insightsService.predictChurn()`
   - `id: 'insights-compare'`, `capability: 'insights.compare'` — handler calls `insightsService.compareEntities()`
   - `id: 'insights-recover'`, `capability: 'insights.recover'` — handler calls `insightsService.generateRecoveryEmail()`
2. Each handler MUST validate `requestingUserId === userId` for authorization (pattern from existing `insights-ask` handler).

### Routes (ai.routes.ts)
1. Import new schemas and rate limiters at the top of the file:
   ```typescript
   import { churnPredictionSchema, recoveryEmailSchema, compareSchema } from '../schemas/ai.schema';
   import { churnPredictionLimiter, recoveryEmailLimiter, compareLimiter } from '../middlewares/rateLimit/rateLimit';
   ```

2. Append three route handlers after the existing insights routes (~line 2080):

   - `POST /api/ai/insights/predict/churn`
     - Middleware: `jwtAuthMiddleware`, `churnPredictionLimiter`, `validate(churnPredictionSchema)`
     - Handler: Verify product ownership, call `insightsService.predictChurn(productId, userId, threshold)`, return 200

   - `POST /api/ai/insights/compare`
     - Middleware: `jwtAuthMiddleware`, `compareLimiter`, `validate(compareSchema)`
     - Handler: Call `insightsService.compareEntities(entityType, entityA, entityB, metrics, userId)`, return 200

   - `POST /api/ai/insights/recover/email`
     - Middleware: `jwtAuthMiddleware`, `recoveryEmailLimiter`, `validate(recoveryEmailSchema)`
     - Handler: Verify product ownership, call `insightsService.generateRecoveryEmail(productId, targetUserId, tone, userId)`, return 200

3. Each handler MUST use the existing `uid(req)` helper and `AppError` pattern.

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (no regression)
- [ ] `GET /api/orchestrator/capabilities` returns the three new capabilities

**Rollback**: Comment out capability registrations and route handlers.

---

## Task 5: Tests + Documentation

**Scope**: Write unit tests for the three new service methods, integration tests for the three new endpoints, and update project documentation.

**Files**:
- `backend/src/__tests__/services/ai/agents.service.test.ts` — Extend with tests for `predictChurn`, `generateRecoveryEmail`, `compareEntities`
- `backend/src/__tests__/routes/ai.routes.test.ts` — Extend with integration tests for the three new endpoints
- `backend/src/__tests__/services/orchestrator.service.test.ts` — Extend capability validation tests (if needed)
- `docs/project/reusable-resources.md` — Update §3 (AI Services) and §10 (Init Script Inventory)

**Dependencies**: Tasks 0–4 (all code must exist)

**Actions**:

### Unit Tests (agents.service.test.ts) — RED → GREEN → TRIANGULATE
1. Extend existing mock setup to include `aiCreditService.useCredits`, `aiCreditService.getBalance`, `aiCreditService.getOperationCost`, `llmService.chat`
2. Test `predictChurn`:
   - GREEN: Happy path — mock DB returns student data, mock LLM returns narrative, credits deducted, predictions returned
   - TRIANGULATE: Insufficient credits → AppError(402); Not product owner → AppError(403); LLM failure → partial results with heuristic scores only
3. Test `generateRecoveryEmail`:
   - GREEN: Happy path — student data fetched, LLM returns email, HTML sanitized, credits deducted
   - TRIANGULATE: Insufficient credits; Not product owner; HTML contains `<script>` → sanitized output
4. Test `compareEntities`:
   - GREEN: Happy path — SQL generated for both entities, validated, executed, LLM returns narrative + deltas
   - TRIANGULATE: One entity query fails → partial results with error field; SQL validation fails → AppError(400); Insufficient credits

### Integration Tests (ai.routes.test.ts)
1. Test `POST /api/ai/insights/predict/churn`:
   - Returns 401 without JWT
   - Returns 400 with invalid body (missing productId)
   - Returns 403 when user doesn't own product
   - Returns 200 with valid request (mock service)
   - Respects rate limiter (429 after 5 rapid requests)
2. Test `POST /api/ai/insights/compare`:
   - Returns 400 with invalid entityType
   - Returns 200 with valid request
   - Respects rate limiter (429 after 10 rapid requests)
3. Test `POST /api/ai/insights/recover/email`:
   - Returns 401 without JWT
   - Returns 403 when user doesn't own product
   - Returns 200 with valid request
   - Respects rate limiter (429 after 10 rapid requests)

### Orchestrator Tests
1. Verify `skillsRegistry.listCapabilities()` includes `insights.predict`, `insights.compare`, `insights.recover`

### Documentation
1. Update `docs/project/reusable-resources.md`:
   - §3 (AI Services): Update `insightsService` entry to include `predictChurn`, `generateRecoveryEmail`, `compareEntities`
   - §10 (Init Script Inventory): Add note about `churn_predictions` and `recovery_emails` tables in `05-ai-tables.sql`

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes — all new and existing tests green
- [ ] `pnpm vitest run --coverage` shows coverage for new methods

**Rollback**: Comment out test additions and documentation updates.

---

## Task 6: Post-Merge Verification

**Scope**: Run full verification suite after all PRs are merged to `master`.

**Actions**:
1. `git checkout master && git pull`
2. `pnpm tsc --noEmit` — must pass with zero errors
3. `pnpm lint` — must pass with zero warnings
4. `pnpm test` — all tests must pass
5. `pnpm vitest run --coverage` — confirm coverage on new methods
6. Verify orchestrator: `GET /api/orchestrator/capabilities` returns all 3 new capabilities
7. Verify DB tables: `churn_predictions` and `recovery_emails` exist with correct schema
8. No regressions on `insights.ask`, `insights.stream`, or dashboard CRUD endpoints

**Verification**:
- [ ] All checks pass
- [ ] No regressions detected

---

## Dependency Graph

```
Task 0 (DB + Types)
    │
    ├── Task 1 (Schemas + Rate Limiters)
    │       │
    │       ├── Task 2 (predictChurn)
    │       │       │
    │       │       └── Task 4 (Orchestrator + Routes) ── Task 5 (Tests + Docs) ── Task 6 (Post-Merge)
    │       │
    │       └── Task 3 (generateRecoveryEmail + compareEntities) ──┘
    │
    └── Task 2 (predictChurn) ────────────────────────────────────────┘
```

## Risk Register

| Risk | Mitigation |
|------|------------|
| `insightsService` grows beyond 700 lines | Methods are self-contained; split into separate service file if >1000 lines or >8 methods |
| LLM generates invalid SQL for comparatives | `validateGeneratedSQL()` rejects before execution; partial results returned on single-entity failure |
| Churn heuristics produce false positives with low data | Add confidence level in response when < 30 days of data available |
| HTML sanitization misses edge cases | Strip on `*` event handlers, `<script>`, `javascript:` URIs, `on*` attributes; test with injection payloads |
| Credit deduction fails after successful operation | Wrap in separate try/catch; log for audit; do not block response |
