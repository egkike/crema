# Archive Report — reports-agent (pre-openspec migration)

**Change**: reports-agent
**Status**: ✅ ARCHIVED (pre-openspec migration)
**Date**: 2026-06-03
**Verify result**: N/A — pre-workflow implementation

---

> **Origin**: This SDD was created under the workflow that preceded the
> adoption of `openspec/` as the canonical artifact store. The planning
> cycle (proposal → spec → design → tasks) was completed in full at
> `docs/project/ai-features/sdd/reports-agent/`. **No apply or verify
> artifacts were generated** under the current workflow; verification
> was performed via PR review + test suite at merge time. The
> implementation is active in production. This archive reflects the
> state at the time of migration (2026-06-03) and there are no
> outstanding tasks associated with this change.

---

## Implementation Reference

Per PRD v3.7 §4.22:

- **Phase**: 9 (completed)
- **Service**: `DenunciationService` in `backend/src/services/ai/denunciation.service.ts` (includes `reportService.triageReport()` with AI severity classification + action suggestion)
- **Tables**: `reports`, `report_reasons`, `report_actions`, `policies`
- **Endpoints**:
  - `GET /api/ai/reports/reasons` (public)
  - `POST /api/ai/reports` (JWT)
  - `GET /api/ai/reports` (admin)
  - `GET /api/ai/reports/:reportId` (admin)
  - `PUT /api/ai/reports/:reportId/resolve` (admin)
  - `POST /api/ai/reports/:reportId/actions` (admin)
  - `GET /api/ai/content/policies` (public)
  - `POST /api/admin/reports/:reportId/triage`
- **Capability**: `reports.create` registered in Orchestrator
- **Cost model**: AI consumption for triage is **paid by Crema** (operational cost, not user credits)

## Skills Implemented

| Skill | Function | Description |
|-------|----------|-------------|
| `reports.create` | Create report | User creates a content report |
| `reports.list` | Admin list | Admin views all reports |
| `reports.triage` | AI classification | Evaluates severity and suggests action |

## Archive Contents

| Artifact | Path | Status |
|----------|------|--------|
| proposal.md | `proposal.md` | ✅ Migrated from `docs/project/ai-features/sdd/reports-agent/PROPOSE.md` |
| spec.md | `spec.md` | ✅ Migrated from `docs/project/ai-features/sdd/reports-agent/SPEC.md` |
| design.md | `design.md` | ✅ Migrated from `docs/project/ai-features/sdd/reports-agent/DESIGN.md` |
| tasks.md | `tasks.md` | ✅ Migrated from `docs/project/ai-features/sdd/reports-agent/TASKS.md` |
| archive-report.md | `archive-report.md` | ✅ This document |
| verify-report.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |
| apply-progress.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |

## Source of Truth

The implementation is in production at:

- `backend/src/services/ai/denunciation.service.ts`
- `backend/src/routes/ai.routes.ts` (`/api/ai/reports/*`)
- `backend/src/routes/admin.routes.ts` (`/api/admin/reports/:reportId/triage`)
- `backend/db/init/` (DDL for `reports`, `report_reasons`, `report_actions`, `policies`)
- `backend/src/services/orchestrator.service.ts` (capability registration)

---

## Engram Traceability

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| archive-report | (this save) | `sdd/reports-agent/archive-report` |
