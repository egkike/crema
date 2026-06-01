# Tasks: AI Insights Expansion

**Change**: ai-insights-expansion
**Type**: AI Feature
**PRD Ref**: PRD.md §4.8
**Mode**: Strict TDD (pnpm run vitest)
**Status**: ✅ **COMPLETED** (Junio 2026) — All Tasks 0-5 + N+1 done. PRs #32, #33, #35-#41, #43, #44 mergeados. 1414 tests passing, TSC clean, lint clean.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1100-1300 (additions across 9 files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 6 PRs (Task 0 -> Task 5) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

### PR Breakdown

| PR | Task(s) | Est. Lines | Description |
|----|---------|------------|-------------|
| 1 | Task 0 | ~80 | DB migration + type definitions |
| 2 | Task 1 | ~120 | Zod schemas + rate limiters |
| 3 | Task 2 | ~250-300 | Service method: predictChurn |
| 4 | Task 3 | ~150 | Service methods: generateRecoveryEmail + compareEntities |
| 5 | Task 4 | ~180 | Orchestrator registration + REST routes |
| 6 | Task 5 | ~300 | Unit tests + integration tests + docs |

---

## Task 0: Database Migration + Type Definitions

**Scope**: Create new init script for new tables; fix `insights_history` schema bug; add TypeScript interfaces.

**Files**:
- `backend/db/init/14-ai-insights-expansion.sql` — CREATE new init script (NEW, per design decision)
- `backend/db/init/05-ai-tables.sql` — ALTER insights_history to add missing columns (fixes pre-existing bug)
- `backend/src/types/ai.types.ts` — Add `ChurnPrediction`, `RecoveryEmail`, `CompareResult` interfaces

**Note**: DB init uses a NEW file (`14-ai-insights-expansion.sql`) per design.md decision. Additionally, `insights_history` needs ALTER to add `is_successful` and `error_message` columns (fixes pre-existing bug where code references columns that don't exist).

**Actions**:
1. Create `backend/db/init/14-ai-insights-expansion.sql`:

   ```sql
   -- 14-ai-insights-expansion.sql
   -- AI Insights Expansion: Churn Predictions + Recovery Emails + A/B Comparatives
   -- SDD: ai-insights-expansion

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

   -- 7.7 A/B Comparatives Table
   CREATE TABLE IF NOT EXISTS ab_comparatives (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('period', 'product')),
       entity_a_label VARCHAR(100),
       entity_b_label VARCHAR(100),
       metrics TEXT[] NOT NULL,
       entity_a_data JSONB,
       entity_b_data JSONB,
       narrative TEXT,
       deltas JSONB,
       recommendation TEXT,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   );

   CREATE INDEX IF NOT EXISTS idx_ab_comparatives_creator ON ab_comparatives(creator_id, created_at DESC);
   ```

2. Append to `backend/db/init/05-ai-tables.sql` — fix insights_history schema bug:

   ```sql
   -- FIX: Add missing columns referenced by existing code in agents.service.ts
   -- These columns are already used in INSERT statements but were never added to the table
   ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS is_successful BOOLEAN DEFAULT TRUE;
   ALTER TABLE insights_history ADD COLUMN IF NOT EXISTS error_message TEXT;
   ```

3. Append to `backend/src/types/ai.types.ts`:

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
- [ ] Tables `churn_predictions`, `recovery_emails`, `ab_comparatives` exist with correct columns and indexes
- [ ] `insights_history` has `is_successful` and `error_message` columns

**Rollback**: Delete `14-ai-insights-expansion.sql`; rollback ALTER statements in `05-ai-tables.sql`; remove interfaces from `ai.types.ts`.

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
     tone: z.enum(['empathic', 'direct', 'motivational']).default('empathic'),
   });

   // Insights: A/B Comparatives — FIXED: uses structured objects matching Design
   export const compareSchema = z.object({
     entityType: z.enum(['period', 'product'], { message: 'entityType must be period or product' }),
     entityA: z.object({
       label: z.string().min(1).max(100),
       params: z.record(z.unknown()),
     }),
     entityB: z.object({
       label: z.string().min(1).max(100),
       params: z.record(z.unknown()),
     }),
     metrics: z.array(z.enum(['revenue', 'sales', 'conversion', 'engagement', 'reviews'])).min(1).max(10),
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

**Dependencies**: Task 0 (DB tables + types), Task 1 (schemas - for type reference)

**Estimated lines**: ~250-300 (may exceed original 200 estimate)

**Actions**:
1. Add `predictChurn` method to `insightsService` export object. The method MUST:
   - Accept `productId: string`, `userId: string`, `threshold?: number`
   - Validate `productId` is non-empty UUID
   - Verify product ownership: `SELECT id FROM "schema".products WHERE id = $1 AND creator_id = $2`
   - Check credits: `aiCreditService.getBalance(userId)` -> throw `AppError('Creditos insuficientes', 402)` if < 5
   - Fetch student data for the product via parameterized queries:
     - **FIXED**: Join on `orders` to filter only confirmed buyers (not creators/affiliates)
     - Students with last activity date and progress
     - Days since last access
     - Interaction count (Q&A + reviews) in last 60 days
   - Compute churn score using heuristics:
     - `daysSinceLastAccess > 30` -> +40
     - `progress < 20% AND daysSinceLastAccess > 14` -> +30
     - `interactions60d === 0` -> +20
     - `FIXED`: Remove Factor 4 (total_orders is purchase count, not access count; add comment that access tracking requires additional infrastructure)
     - `score = Math.min(100, sum of applicable factors)`
   - Filter students where `score >= (threshold ?? 50)`
   - **FIXED**: Include `confidence: 'high' | 'medium' | 'low'` in response based on data availability
   - For each at-risk student, call LLM to generate narrative + recommended action
   - Persist predictions to `churn_predictions` table
   - Deduct credits via `aiCreditService.useCredits(userId, 5, 'Churn Prediction', productId)`
   - Return `{ predictions: Array<{ userId, userName, churnScore, riskFactors, narrative, recommendedAction, confidence }> }`

2. Use `getValidatedSchema()` for all SQL queries - never hardcode schema name.
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

**Prerequisites**: `pnpm add sanitize-html --filter backend` (HTML sanitization library)

**Actions**:

### generateRecoveryEmail
1. Accept `productId: string`, `userId: string`, `targetUserId: string`, `tone?: 'empathic' | 'direct' | 'motivational'`
2. Verify product ownership (same pattern as Task 2)
3. Check credits (3 credits); throw if insufficient
4. Fetch student data: name, email, progress, last access, interaction history
5. Build LLM prompt with system instructions + student data + tone
6. Call LLM; parse response into `{ subject, bodyHtml, previewText }`
7. **FIXED**: Use `sanitize-html` npm package for HTML sanitization (NOT regex):
   ```typescript
   import sanitizeHtml from 'sanitize-html';
   const cleanHtml = sanitizeHtml(bodyHtml, {
     allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li'],
     allowedAttributes: { 'a': ['href'] },
   });
   ```
8. Persist to `recovery_emails` table
9. Deduct 3 credits
10. Return `{ email: { subject, bodyHtml, previewText }, studentName, productName, recoveryEmailId }`

### compareEntities
1. Accept `userId: string`, `entityType: 'period' | 'product'`, `entityA: { label: string; params: Record<string, unknown> }`, `entityB: { label: string; params: Record<string, unknown> }`, `metrics: string[]`
2. Check credits (3 credits); throw if insufficient
3. For each entity (A and B):
   - Build NL->SQL prompt for the requested metrics
   - Call LLM to generate SQL
   - Validate with `validateGeneratedSQL()` - reject if invalid
   - Execute validated SQL with safety limits (same as `insightsService.query`)
   - If one entity fails, store `{ error: '...' }` and continue
4. Call LLM with comparative analysis prompt (both result sets)
5. Parse response into `{ narrative, deltas, recommendation }`
6. **FIXED**: Persist to `ab_comparatives` table (NOT `insights_history` - structural mismatch)
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
   - `id: 'insights-predict'`, `capability: 'insights.predict'` - handler calls `insightsService.predictChurn()`
   - `id: 'insights-compare'`, `capability: 'insights.compare'` - handler calls `insightsService.compareEntities()`
   - `id: 'insights-recover'`, `capability: 'insights.recover'` - handler calls `insightsService.generateRecoveryEmail()`
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
     - Handler: Call `insightsService.compareEntities(userId, entityType, entityA, entityB, metrics)`, return 200

   - `POST /api/ai/insights/recover/email`
     - Middleware: `jwtAuthMiddleware`, `recoveryEmailLimiter`, `validate(recoveryEmailSchema)`
     - Handler: Verify product ownership, call `insightsService.generateRecoveryEmail(productId, userId, targetUserId, tone)`, return 200

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

**Files** (CORRECTED paths):
- `backend/src/__tests__/services/ai/agents.service.test.ts` — Extend with tests for `predictChurn`, `generateRecoveryEmail`, `compareEntities`
- `backend/src/__tests__/ai.routes.test.ts` — Extend with integration tests for the three new endpoints (NOTE: NOT `routes/ai.routes.test.ts`)
- `backend/src/__tests__/services/ai/ai-boot.test.ts` — Extend capability validation tests for new skills
- `docs/project/reusable-resources.md` — Update §3 (AI Services) and §10 (Init Script Inventory)

**Dependencies**: Tasks 0-4 (all code must exist)

**Actions**:

### Unit Tests (`backend/src/__tests__/services/ai/agents.service.test.ts`) — RED -> GREEN -> TRIANGULATE
**Actual path**: `backend/src/__tests__/services/ai/agents.service.test.ts` (note: `ai/` subdirectory exists)

1. Extend existing mock setup to include `aiCreditService.useCredits`, `aiCreditService.getBalance`, `aiCreditService.getOperationCost`, `llmService.chat`
2. Test `predictChurn`:
   - GREEN: Happy path - mock DB returns student data (JOINed with orders), mock LLM returns narrative, credits deducted, predictions returned
   - TRIANGULATE: Insufficient credits -> AppError(402); Not product owner -> AppError(403); LLM failure -> partial results with heuristic scores only; confidence level returned
3. Test `generateRecoveryEmail`:
   - GREEN: Happy path - student data fetched, LLM returns email, HTML sanitized (no script tags), credits deducted
   - TRIANGULATE: Insufficient credits; Not product owner; HTML contains `<script>` -> sanitized output; `sanitize-html` library used
4. Test `compareEntities`:
   - GREEN: Happy path - SQL generated for both entities, validated, executed, LLM returns narrative + deltas, persisted to `ab_comparatives`
   - TRIANGULATE: One entity query fails -> partial results with error field; SQL validation fails -> AppError(400); Insufficient credits

### Integration Tests (`backend/src/__tests__/ai.routes.test.ts`)
**Actual path**: `backend/src/__tests__/ai.routes.test.ts` (NOT `routes/ai.routes.test.ts`)

1. Test `POST /api/ai/insights/predict/churn`:
   - Returns 401 without JWT
   - Returns 400 with invalid body (missing productId)
   - Returns 403 when user doesn't own product
   - Returns 200 with valid request (mock service)
   - Respects rate limiter (429 after 5 rapid requests)
   - **FIXED**: Verify response body contains `data.predictions` array with items having `userId`, `churnScore`, `riskFactors`
2. Test `POST /api/ai/insights/compare`:
   - Returns 400 with invalid entityType
   - Returns 200 with valid request
   - Respects rate limiter (429 after 10 rapid requests)
3. Test `POST /api/ai/insights/recover/email`:
   - Returns 401 without JWT
   - Returns 403 when user doesn't own product
   - Returns 200 with valid request
   - Respects rate limiter (429 after 10 rapid requests)

### Orchestrator Tests (`backend/src/__tests__/services/ai/ai-boot.test.ts`)
**Actual path**: `backend/src/__tests__/services/ai/ai-boot.test.ts`

1. Verify `skillsRegistry.listCapabilities()` includes `insights.predict`, `insights.compare`, `insights.recover`

### Documentation
1. Update `docs/project/reusable-resources.md`:
   - §3 (AI Services): Update `insightsService` entry to include `predictChurn`, `generateRecoveryEmail`, `compareEntities`
   - §10 (Init Script Inventory): Add entry for `14-ai-insights-expansion.sql` with tables and indexes summary

**Verification**:
- [ ] `pnpm tsc --noEmit` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes - all new and existing tests green
- [ ] `pnpm vitest run --coverage` shows coverage for new methods

**Rollback**: Comment out test additions and documentation updates.

---

## Task 6: Post-Merge Verification

**Scope**: Run full verification suite after all PRs are merged to `master`.

**Actions**:
1. `git checkout master && git pull`
2. `pnpm tsc --noEmit` - must pass with zero errors
3. `pnpm lint` - must pass with zero warnings
4. `pnpm test` - all tests must pass
5. `pnpm vitest run --coverage` - confirm coverage on new methods
6. Verify orchestrator: `GET /api/orchestrator/capabilities` returns all 3 new capabilities
7. Verify DB tables: `churn_predictions`, `recovery_emails`, `ab_comparatives` exist with correct schema
8. No regressions on `insights.ask`, `insights.stream`, or dashboard CRUD endpoints

**Verification**:
- [ ] All checks pass
- [ ] No regressions detected

---

## Dependency Graph

```
Task 0 (DB + Types)
    |
    ├── Task 1 (Schemas + Rate Limiters)
    |       |
    |       ├── Task 2 (predictChurn)
    |       |       |
    |       |       └── Task 4 (Orchestrator + Routes) ── Task 5 (Tests + Docs) ── Task 6 (Post-Merge)
    |       |
    |       └── Task 3 (generateRecoveryEmail + compareEntities) ──┘
    |
    └── Task 2 (predictChurn) ────────────────────────────────────────┘
```

## Risk Register

| Risk | Mitigation |
|------|------------|
| `insightsService` grows beyond 700 lines | Methods are self-contained; split into separate service file if >1000 lines or >8 methods |
| LLM generates invalid SQL for comparatives | `validateGeneratedSQL()` rejects before execution; partial results returned on single-entity failure |
| Churn heuristics produce false positives with low data | Return `confidence` level in response when < 30 days of data available |
| HTML sanitization misses edge cases (regex approach) | **FIXED**: Use `sanitize-html` npm package - battle-tested library with allowlist approach |
| Credit deduction fails after successful operation | Wrap in separate try/catch; log for audit; do not block response |
| Churn queries include non-buyers | **FIXED**: JOIN on `orders` to filter only confirmed buyers |
| Compare persistence to `insights_history` mismatch | **FIXED**: Use dedicated `ab_comparatives` table |

---

## Task N+1: Update Project Documentation

**Depends on**: All previous tasks complete and verified (Tasks 0–5)

### What to do

After successful verification, update project documents to reflect that this SDD is complete.

#### 1. Update PRD.md (primary source of truth)

Change §4.8 status:
- **Before**: `⚠️ **PARCIAL** - InsightsService existe con dashboards CRUD + NL→SQL query + streaming. Requiere expandir: predicción de churn, generación de email de recuperación, comparativas A/B.`
- **After**: `✅ **COMPLETO** - Predicción de churn, generación de email de recuperación, y comparativas A/B implementadas.`

Update header status line at top of PRD.md:
- **Before**: `⚠️ Parciales: §4.8, §4.19 - Roadmap priorizado`
- **After**: Remove `§4.8` from "Parciales" list

Add implementation reference block at end of §4.8:
```markdown
> **Implementation technical reference:**
> - Servicio: `insightsService` en `backend/src/services/ai/agents.service.ts`
> - Métodos nuevos: `predictChurn`, `generateRecoveryEmail`, `compareEntities`
> - Endpoints: `POST /api/ai/insights/predict/churn`, `POST /api/ai/insights/compare`, `POST /api/ai/insights/recover/email`
> - Rate limiters: `churnPredictionLimiter` (5/min), `compareLimiter` (10/min), `recoveryEmailLimiter` (10/min)
> - Capabilities: `insights-predict`, `insights-compare`, `insights-recover` registradas en Orchestrator
> - Créditos: `insights.predict` → 5, `insights.compare` → 3, `insights.recover` → 3
> - DB tables: `churn_predictions`, `recovery_emails`, `ab_comparatives` (en `14-ai-insights-expansion.sql`)
```

Update §9 Roadmap to mark §4.8 as complete.

#### 2. Update TECHNICAL-SPEC.md

Check `docs/project/ai-features/TECHNICAL-SPEC.md` and add to AI Services table:
```markdown
| `insights.predict` | Churn prediction | POST | `/api/ai/insights/predict/churn` | `churnPredictionLimiter` | 5 |
| `insights.compare` | A/B Comparatives | POST | `/api/ai/insights/compare` | `compareLimiter` | 3 |
| `insights.recover` | Recovery Email | POST | `/api/ai/insights/recover/email` | `recoveryEmailLimiter` | 3 |
```

#### 3. Update reusable-resources.md

**AI Services table (§3)** — Add new methods to `insightsService` entry:
```markdown
| `insightsService` | AI analytics con NL→SQL + streaming + dashboards + **churn prediction, recovery email, A/B comparatives** |
```

**Active SDDs Reference (§Active SDDs Reference)** — Add:
```markdown
- `docs/project/ai-features/sdd/ai-insights-expansion/` — AI Insights Expansion: churn prediction, recovery email generation, A/B comparatives (§4.8)
```

#### 4. Update reusable-resources.md §10 (Init Script Inventory)

Add to Init Script Inventory table:
```markdown
| `14-ai-insights-expansion.sql` | Churn predictions, recovery emails, A/B comparatives tables + insights_history fixes | `ai-insights-expansion` |
```

#### 5. Update CremaOverview.md

Add to AI Features table:
```markdown
| **AI Insights Expansion** | Churn prediction, recovery email generation, A/B comparatives | ✅ §4.8 |
```

#### 6. Update root README.md

Add to AI Features list:
```markdown
- ✅ **AI Insights Expansion** - Predicción de churn, generación de email de recuperación, comparativas A/B (§4.8)
```

#### 7. Update backend/README.md

Add new endpoints to API reference section:
```markdown
### AI Insights Expansion
| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/ai/insights/predict/churn` | Predict student churn risk | 5/min |
| POST | `/api/ai/insights/compare` | A/B comparative analysis | 10/min |
| POST | `/api/ai/insights/recover/email` | Generate recovery email | 10/min |
```

### Verification
- [x] PRD.md §4.8 shows status `✅ **COMPLETO**`
- [x] PRD.md header removes §4.8 from "Parciales"
- [x] PRD.md §4.8 includes implementation reference block
- [x] TECHNICAL-SPEC.md AI Services table updated
- [x] reusable-resources.md §3 AI Services updated
- [x] reusable-resources.md Active SDDs Reference updated
- [x] reusable-resources.md §10 Init Script Inventory updated
- [x] CremaOverview.md AI Features table updated
- [x] root README.md AI Features list updated
- [x] backend/README.md API reference updated
- [x] No broken internal links

### Documents Summary

| Document | What to Update | When |
|----------|----------------|------|
| `PRD.md` | §4.8 status + header + implementation reference | Always |
| `TECHNICAL-SPEC.md` | AI Services table | If exists |
| `docs/project/reusable-resources.md` §3 | AI Services table | New methods |
| `docs/project/reusable-resources.md` | Active SDDs Reference | New SDD |
| `docs/project/reusable-resources.md` §10 | Init Script Inventory | New db scripts |
| `CremaOverview.md` | AI Features table | New AI feature |
| `README.md` (root) | AI Features list | New AI feature |
| `backend/README.md` | API reference | New endpoints |

### Execution Order
1. Edit PRD.md first (primary source of truth)
2. Update TECHNICAL-SPEC.md if applicable
3. Update reusable-resources.md (services, active SDDs)
4. Update reusable-resources.md §10 (init scripts)
5. Update CremaOverview.md
6. Update root README.md
7. Update backend/README.md if exists
8. Verify links are correct
