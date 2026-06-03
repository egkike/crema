# Archive Report — concierge-integration (pre-openspec migration)

**Change**: concierge-integration
**Status**: ✅ ARCHIVED (pre-openspec migration)
**Date**: 2026-06-03
**Verify result**: N/A — pre-workflow implementation

---

> **Origin**: This SDD was created under the workflow that preceded the
> adoption of `openspec/` as the canonical artifact store. The planning
> cycle (proposal → spec → design → tasks) was completed in full at
> `docs/project/architecture-improvements/sdd/concierge-integration/`.
> **No apply or verify artifacts were generated** under the current
> workflow; verification was performed via PR review + test suite at
> merge time. The implementation is active in production. This
> archive reflects the state at the time of migration (2026-06-03)
> and there are no outstanding tasks associated with this change.

---

## Implementation Reference

Per architecture-improvements PRD §Estado (Fase 7):

- **Phase**: Fase 7 — Concierge Integration (completada 2026-04-27)
- **Service**: `conciergeService` in `backend/src/services/ai/concierge.service.ts`
- **Capability**: `concierge.chat` registered in Orchestrator
- **Function**: AI support chatbot con escalación, system prompt configurable, sanitización de input, defensive framing contra prompt injection
- **Related**: Per ai-features PRD §4.9 — same `ConciergeService` powers the AI Support Chatbot (core). Advanced skills (search_faqs, get_order_status, evaluate_refund_risk, escalate_to_human, create_support_ticket) pending.

## Archive Contents

| Artifact | Path | Status |
|----------|------|--------|
| proposal.md | `proposal.md` | ✅ Migrated |
| spec.md | `spec.md` | ✅ Migrated |
| design.md | `design.md` | ✅ Migrated |
| tasks.md | `tasks.md` | ✅ Migrated (self-ref updated) |
| archive-report.md | `archive-report.md` | ✅ This document |
| verify-report.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |
| apply-progress.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |

## Source of Truth

The implementation is in production at:

- `backend/src/services/ai/concierge.service.ts`
- `backend/src/routes/ai.routes.ts` (or `concierge.routes.ts`)
- `backend/src/services/orchestrator.service.ts` (capability registration)
- `backend/src/schemas/ai.schema.ts` (input validation)

---

## Engram Traceability

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| archive-report | (this save) | `sdd/concierge-integration/archive-report` |
