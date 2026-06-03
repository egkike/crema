# Archive Report — interactive-agent (pre-openspec migration)

**Change**: interactive-agent
**Status**: ✅ ARCHIVED (pre-openspec migration)
**Date**: 2026-06-03
**Verify result**: N/A — pre-workflow implementation

---

> **Origin**: This SDD was created under the workflow that preceded the
> adoption of `openspec/` as the canonical artifact store. The planning
> cycle (proposal → spec → design → tasks) was completed in full at
> `docs/project/ai-features/sdd/interactive-agent/`. **No apply or
> verify artifacts were generated** under the current workflow;
> verification was performed via PR review + test suite at merge time.
> The implementation is active in production. This archive reflects
> the state at the time of migration (2026-06-03) and there are no
> outstanding tasks associated with this change.

---

## Implementation Reference

Per PRD v3.7 §4.21:

- **Tasks**: 1–11 (all completed, Mayo 2026, Phase 11)
- **Service**: `InteractiveAgentService` in `backend/src/services/ai/interactive-agent.service.ts`
- **Repository**: `backend/src/repositories/interactive-agent.repository.ts` (Advisory Lock pattern)
- **Tables**: `user_course_data`, `product_module_fields`
- **Endpoints**:
  - `POST /api/interactive/fields/:productId`
  - `GET /api/interactive/fields/:productId`
  - `POST /api/interactive/data/:productId`
  - `PUT /api/interactive/data/:productId/:moduleKey`
  - `GET /api/interactive/data/:productId`
  - `POST /api/interactive/analyze/:productId/:moduleKey` (3 credits)
  - `GET /api/interactive/analytics/:productId`
- **Rate limiter**: `interactiveAgentLimiter` (10 req/min)

## Security (per PRD)

- Input validation via Zod with regex `^[a-z0-9_]+$` for `moduleKey`
- Size limits: `input_data` 50KB, `output_analysis` 1MB, fields 50/module
- Authorization: product owner OR buyer with active order

## Archive Contents

| Artifact | Path | Status |
|----------|------|--------|
| proposal.md | `proposal.md` | ✅ Migrated from `docs/project/ai-features/sdd/interactive-agent/PROPOSE.md` |
| spec.md | `spec.md` | ✅ Migrated from `docs/project/ai-features/sdd/interactive-agent/SPEC.md` |
| design.md | `design.md` | ✅ Migrated from `docs/project/ai-features/sdd/interactive-agent/DESIGN.md` |
| tasks.md | `tasks.md` | ✅ Migrated from `docs/project/ai-features/sdd/interactive-agent/TASKS.md` |
| archive-report.md | `archive-report.md` | ✅ This document |
| verify-report.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |
| apply-progress.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |

## Source of Truth

The implementation is in production at:

- `backend/src/services/ai/interactive-agent.service.ts`
- `backend/src/repositories/interactive-agent.repository.ts`
- `backend/src/routes/interactive.routes.ts` (or under `ai.routes.ts`)
- `backend/src/middleware/rate-limiters.ts` (`interactiveAgentLimiter`)
- `backend/src/schemas/interactive.schema.ts` (Zod validation)
- `backend/db/init/` (DDL for `user_course_data`, `product_module_fields`)

---

## Engram Traceability

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| archive-report | (this save) | `sdd/interactive-agent/archive-report` |
