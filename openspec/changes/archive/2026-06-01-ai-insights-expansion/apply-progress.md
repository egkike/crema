# Apply Progress: AI Insights Expansion

**Change**: ai-insights-expansion  
**PRD Ref**: §4.8  
**Mode**: Strict TDD  

---

## Completed Tasks

### Task 0: DB Migration + Type Definitions ✅

**Status**: COMPLETE  
**Files changed**:
- `backend/db/init/14-ai-insights-expansion.sql` — NEW: 3 tables + 5 indexes
  - `churn_predictions` (10 columns, 3 indexes)
  - `recovery_emails` (11 columns, 1 index)
  - `ab_comparatives` (12 columns, 1 index)
- `backend/db/init/05-ai-tables.sql` — ALTER: 2 new columns on `insights_history`
  - `is_successful BOOLEAN DEFAULT TRUE`
  - `error_message TEXT`
- `backend/src/types/ai.types.ts` — Appended: 3 interfaces + 2 types
  - `ChurnPrediction`, `RecoveryEmail`, `CompareResult`
  - `CompareEntityType`, `CompareMetric`

**Verification**:
- [x] `npx tsc --noEmit` — PASSED (0 errors)
- [x] `pnpm lint` — PASSED (0 errors, 0 warnings)
- [x] SQL syntax reviewed: correct CREATE TABLE, CHECK constraints, FK references, index definitions
- [x] TypeScript interfaces match SQL schema column-for-column

---

## Remaining Tasks

- [ ] Task 1: Zod Schemas + Rate Limiters
- [ ] Task 2: Service Method — predictChurn
- [ ] Task 3: Service Methods — generateRecoveryEmail + compareEntities
- [ ] Task 4: Orchestrator Registration + REST Routes
- [ ] Task 5: Tests + Documentation
- [ ] Task 6: Post-Merge Verification
- [ ] Task N+1: Update Project Documentation
