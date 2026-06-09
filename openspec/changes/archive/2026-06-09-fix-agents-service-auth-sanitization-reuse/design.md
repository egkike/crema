# Design: Fix Agents Service Auth + Sanitization Gaps (Reuse)

**Change**: `fix-agents-service-auth-sanitization-reuse` · **Issue**: [#55](https://github.com/egkike/crema/issues/55)
**Date**: 2026-06-07 · **Status**: 🚧 IN PROGRESS · **Author**: `sdd-design`
**Updated**: 2026-06-07 (updated after judgment day final round: added route-level verifyProductAccess removal note, TOCTOU risk notes, Spanish error messages, verifyDashboardOwnership wrapping notes, out-of-scope route documentation, query count analysis, testing dependency note)
**Files**: `agents.service.ts`, `affiliate-chat.service.ts`, `concierge.service.ts`, `routeHelpers.util.ts`

---

## Technical Approach

Reuse the same pattern from `2026-06-02-fix-agents-service-gga-findings`: inject existing helpers (`verifyDashboardOwnership`, `verifyProductAccess`, `withSanitizedErrors`) into 3 service files. No new abstractions, no DI, no decorators. One codebase-specific blocker found: `verifyDashboardOwnership` queries a non-existent table — fix inline.

---

## Architecture Decisions

### Decision 1: Fix `verifyDashboardOwnership` table reference

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Fix `insight_dashboards` → `creator_dashboards` in the helper | One-line change; all callers benefit | ✅ Chosen |
| Write inline ownership query in each service method | Avoids touching shared utility; duplicates logic | Rejected |

**Rationale**: `verifyDashboardOwnership` at `routeHelpers.util.ts:87` queries `insight_dashboards` — a table with zero DB init scripts and zero references outside this helper. All dashboard methods in `agents.service.ts` use `creator_dashboards` (backed by `05-ai-tables.sql:324`). The helper is dead code until corrected. Fix it once.

### Decision 2: Move ownership check from route → service

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add ownership check in service, keep route check as well | Defense-in-depth; double `getDashboardById` call | Rejected |
| Add ownership check in service, remove route check | Single source of truth; simpler routes | ✅ Chosen |

**Rationale**: Routes at `ai.routes.ts:1994-2001` and `:2032-2038` already call `getDashboardById` + manual `creator_id !== userId`. Moving the check into the service layer makes `updateDashboard(userId, dashboardId, data)` self-guarding. Routes become: pass `userId`, let service throw 403/404.

### Decision 3: Product existence check before access check in affiliate chat

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `verifyProductAccess` as-is (throws 403 for both missing + no-access) | Simple; leaks existence | Rejected |
| Check product existence first (404), then `verifyProductAccess` (403) | Two queries; matches spec scenarios exactly | ✅ Chosen |

**Rationale**: Spec requires 404 for non-existent product, 403 for unauthorized access. `verifyProductAccess` returns 403 for both. Add a lightweight `SELECT 1 FROM products WHERE id = $1` guard before the access check.

---

## File Changes

### 1. `backend/src/utils/routeHelpers.util.ts` — Fix table reference

**Line 87**: Change `insight_dashboards` → `creator_dashboards`.

```typescript
// BEFORE (line 87)
`SELECT id FROM "${getValidatedSchema()}"."insight_dashboards" WHERE id = $1 AND creator_id = $2`

// AFTER
`SELECT id FROM "${getValidatedSchema()}"."creator_dashboards" WHERE id = $1 AND creator_id = $2`
```

> **Note (JD final):** The `verifyDashboardOwnership` helper's internal `pool.query` is NOT wrapped with `withSanitizedErrors` — this is pre-existing behavior shared with `verifyProductOwnership`. Wrapping would require modifying the shared helper; outside scope of this SDD (the route's catch block handles client-facing errors).

### 2. `backend/src/services/ai/agents.service.ts` — Ownership + sanitization

**Import** (line 13): Add `verifyDashboardOwnership` to existing import from `routeHelpers.util`.

```typescript
// BEFORE (line 13)
import { verifyProductOwnership, verifyBuyerOfProduct, verifyCreatorHasDataInPeriod } from '../../utils/routeHelpers.util';

// AFTER
import { verifyProductOwnership, verifyBuyerOfProduct, verifyCreatorHasDataInPeriod, verifyDashboardOwnership } from '../../utils/routeHelpers.util';
```

**`createDashboard` (line 1200)**: Wrap with `withSanitizedErrors`.

```typescript
// AFTER
const { rows } = await withSanitizedErrors(
  'insightsService.createDashboard',
  userId,
  () => pool.query<{ id: string }>(query, [userId, name, description || null])
);
```

**`updateDashboard` (lines 1207–1233)**: Add `userId` param, ownership check, sanitization.

```typescript
// AFTER
async updateDashboard(
  userId: string,    // ← NEW first parameter
  dashboardId: string,
  data: { name?: string; description?: string; config?: Record<string, unknown> }
): Promise<void> {
  // NOTE: verifyDashboardOwnership(pool, dashboardId, userId) — entity before userId
  await verifyDashboardOwnership(pool, dashboardId, userId);  // ← NEW ownership gate

  // ... existing update logic unchanged ...
  await withSanitizedErrors(       // ← wrap existing pool.query
    'insightsService.updateDashboard',
    userId,
    () => pool.query(query, params)
  );
},
```

**`getDashboardById` (lines 1239–1272)**: Add `userId` param, ownership check, sanitization.

```typescript
// AFTER
async getDashboardById(
  userId: string,    // ← NEW first parameter
  dashboardId: string
): Promise<{ ... }> {
  // Existence pre-check → 404 if dashboard doesn't exist (mirrors Decision 3 pattern)
  const { rows: exists } = await withSanitizedErrors(
    'insightsService.dashboardExistence',
    userId,
    () => pool.query(
      `SELECT 1 FROM "${getValidatedSchema()}"."creator_dashboards" WHERE id = $1`,
      [dashboardId]
    )
  );
  if (exists.length === 0) throw new AppError('Dashboard no encontrado', 404);
  // Note: 2-query pattern — existence pre-check then ownership. Low TOCTOU risk
  // (dashboard deleted between queries would result in 403 from verifyDashboardOwnership, not 404).
  // Acceptable for this SDD scope.

  // NOTE: verifyDashboardOwnership(pool, dashboardId, userId) — entity before userId
  await verifyDashboardOwnership(pool, dashboardId, userId);  // ← throws 403 if non-owner

  // ... existing SELECT + return logic, wrapped ...
  const { rows } = await withSanitizedErrors(
    'insightsService.getDashboardById',
    userId,
    () => pool.query<...>(query, [dashboardId])
  );

  // unreachable: existence pre-check guarantees at least one row (404 thrown otherwise)
  const r = rows[0];
  // ... rest unchanged ...
},
```

> **Note (JD final):** The `verifyDashboardOwnership` call is not wrapped with `withSanitizedErrors` because the helper only throws `AppError` (never raw PG errors). The route's outer catch handles unexpected errors. If the helper is ever modified to throw raw errors, wrap it.

**`deleteDashboard` (lines 1277–1281)**: Add `userId` param, ownership check, sanitization.

```typescript
// AFTER
async deleteDashboard(
  userId: string,    // ← NEW first parameter
  dashboardId: string
): Promise<boolean> {
  // NOTE: verifyDashboardOwnership(pool, dashboardId, userId) — entity before userId
  await verifyDashboardOwnership(pool, dashboardId, userId);  // ← NEW ownership gate

  const result = await withSanitizedErrors(    // ← wrap
    'insightsService.deleteDashboard',
    userId,
    () => pool.query(query, [dashboardId])
  );
  return (result.rowCount || 0) > 0;
},
```

### 3. `backend/src/routes/ai.routes.ts` — Pass userId, remove manual checks

**PUT route (lines 1983–2015)**: Remove `getDashboardById` + manual `creator_id` check; pass `userId` to service.

```typescript
// AFTER (simplified route)
router.put(
  '/insights/dashboards/:dashboardId',
  jwtAuthMiddleware,
  validate(updateDashboardSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const dashboardId = toString(req.params.dashboardId);
    const userId = uid(req);
    const { name, description, config } = req.body;

    await insightsService.updateDashboard(userId, dashboardId, { name, description, config });
    // service throws 403/404 if unauthorized or not found

    res.json({ success: true, data: { message: 'Dashboard updated' } });
  })
);
```

**DELETE route (lines 2022–2052)**: Same simplification.

```typescript
// AFTER
router.delete(
  '/insights/dashboards/:dashboardId',
  jwtAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const dashboardId = toString(req.params.dashboardId);
    const userId = uid(req);

    const deleted = await insightsService.deleteDashboard(userId, dashboardId);
    // service throws 403/404 if unauthorized or not found

    res.json({ success: true, data: { deleted } });
  })
);
```

### 4. `backend/src/services/ai/affiliate-chat.service.ts` — Product access check

**Add imports** at top:

```typescript
import pool from '../../db/postgres';
import { getValidatedSchema } from '../../utils/validators.util';
import { verifyProductAccess } from '../../utils/routeHelpers.util';
import { AppError } from '../../errors/AppError';
import { withSanitizedErrors } from '../../lib/withSanitizedErrors';
```

**`chat()` method (line 121)**: Add existence + access checks before sanitization.

```typescript
async chat(input: AffiliateChatInput): Promise<AffiliateChatResponse> {
  const { productId, userId, message } = input;

  // 0. Check product exists (404 if not) — wrapped with withSanitizedErrors + schema-qualified
  const { rows: prodRows } = await withSanitizedErrors('affiliateChat.productExistence', userId, () =>
    pool.query(`SELECT 1 FROM "${getValidatedSchema()}"."products" WHERE id = $1`, [productId])
  );
  if (prodRows.length === 0) {
    throw new AppError('Producto no encontrado', 404);
  }
  // Note: existence check then access check. Low TOCTOU risk. Acceptable for this SDD scope.

  // 0b. Verify user has access (403 if not)
  await verifyProductAccess(pool, productId, userId);

  // 1. Sanitize input (unchanged)
  // ...
```

> **⚠️ CRITICAL (JD final):** Route-level `verifyProductAccess` at `ai.routes.ts:2302` MUST be removed — the service now handles both existence (404) and access (403). Do NOT keep a duplicate check. See Task 2.6b.

> **Note (JD final):** Routes at lines 1464 (qa/chat) and 1815 (tutor/chat) also call `verifyProductAccess` and return 403 for missing products. These are OUT OF SCOPE for this SDD (affiliate-chat only). Documenting for awareness — future SDDs should address consistency if 404 behavior is needed for those endpoints.

> **Note (JD final):** After removing route-level `verifyProductAccess`, affiliate-chat performs: 1 existence query + up to 3 access queries + 1 buyerCheck (for credit deduction, still at route line 2304) = 5 pre-RAG queries. This is 1 more than the original 4-query flow — the tradeoff is correct 404/403 semantics for existence vs. access.

### 5. `backend/src/services/ai/concierge.service.ts` — Defense-in-depth sanitization

**Add import**:

```typescript
import { withSanitizedErrors } from '../../lib/withSanitizedErrors';
```

**Wrap repository calls** inside the try block (lines 144–159):

```typescript
// AFTER: wrap userContextRepository calls with withSanitizedErrors
await withSanitizedErrors('concierge.contextFind', userId, () =>
  userContextRepository.findByUserAndProduct(userId, CONCIERGE_PRODUCT_ID)
).then((existing) => {
  // ... existing context save logic unchanged ...
  return withSanitizedErrors('concierge.contextUpsert', userId, () =>
    userContextRepository.upsert(userId, CONCIERGE_PRODUCT_ID, { ... })
  );
}).catch((contextError) => {
  logger.warn({ error: contextError }, 'Concierge: Failed to save user context');
});
```

> The outer `catch` (line 165) already re-throws as generic `AppError`. This wraps the repository calls themselves — defense-in-depth so DB errors are logged with operation context before reaching the outer catch.

---

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `updateDashboard` rejects non-owner with 403 | Mock `pool.query` for `verifyDashboardOwnership` to return `[]`; assert `AppError` thrown with 403 |
| Unit | `deleteDashboard` rejects non-owner with 403 | Same pattern |
| Unit | `getDashboardById` rejects non-owner with 403 | Mock existence query returns a row (dashboard exists); mock `verifyDashboardOwnership` query returns `[]` (non-owner); assert `AppError` thrown with 403 |
| Unit | `getDashboardById` rejects missing dashboard with 404 | Mock existence pre-check query returns `[]`; assert `AppError` thrown with 404 before `verifyDashboardOwnership` is called |
| Unit | Dashboard `pool.query` errors are sanitized | `vi.spyOn(pool, 'query').mockRejectedValue(new Error('violates fk constraint'))` → assert generic 500 message, original detail in logs |
| Unit | `affiliateChatService.chat` rejects missing product with 404 | Mock `pool.query` product check to return `[]`; assert 404 |
| Unit | `affiliateChatService.chat` rejects unauthorized user with 403 | Mock product exists → mock `verifyProductAccess` to throw 403 |
| Unit | `conciergeService.chat` sanitizes repository errors | Mock `userContextRepository.findByUserAndProduct` to throw `Error('constraint violation')` → assert chat response succeeds (fire-and-forget, error is non-fatal); verify `logger.warn` called with sanitized operation context |
| Integration | `PUT /api/ai/insights/dashboards/:id` 403 as non-owner | supertest + seeded DB: create dashboard as user A, call PUT as user B → 403 |
| Integration | `DELETE /api/ai/insights/dashboards/:id` 403 as non-owner | Same pattern |
| Integration | `POST /api/ai/affiliate/chat` 404 on non-existent product | supertest with fake UUID |

> **⚠️ Note (JD final):** Integration test `POST /api/ai/affiliate/chat 404 on non-existent product` requires Task 2.6b (route-level verifyProductAccess removal) to be completed first — without it, the route returns 403 before the service-level 404 can fire.

### Test file
- `backend/src/__tests__/services/ai/agents.service.test.ts` — add dashboard ownership + sanitization tests
- `backend/src/__tests__/services/ai/affiliate-chat.service.test.ts` — add product access tests
- `backend/src/__tests__/services/ai/concierge.service.test.ts` — add sanitization test

---

## Migration / Rollout

No migration required. No DB schema changes. `git revert` restores prior behavior.

---

## Open Questions

- [x] **`verifyDashboardOwnership` table rename**: The `insight_dashboards` → `creator_dashboards` fix in `routeHelpers.util.ts` changes the helper's contract. **Resolved**: zero callers and zero DB references confirmed via grep. Safe to fix; verify with `pnpm test` after change.
