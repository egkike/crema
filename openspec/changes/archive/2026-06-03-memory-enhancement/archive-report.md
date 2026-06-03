# Archive Report — memory-enhancement (pre-openspec migration)

**Change**: memory-enhancement
**Status**: ✅ ARCHIVED (pre-openspec migration)
**Date**: 2026-06-03
**Verify result**: N/A — pre-workflow implementation

---

> **Origin**: This SDD was created under the workflow that preceded the
> adoption of `openspec/` as the canonical artifact store. The planning
> cycle (proposal → spec → design → tasks) was completed in full at
> `docs/project/ai-features/sdd/memory-enhancement/`. **No apply or
> verify artifacts were generated** under the current workflow;
> verification was performed via PR review + test suite at merge time.
> The implementation is active in production. This archive reflects
> the state at the time of migration (2026-06-03) and there are no
> outstanding tasks associated with this change.

---

## Implementation Reference

Per PRD v3.7 §2.4 / §4.24:

- **Tasks**: M-1 to M-7 (all completed and tested, Mayo 2026)
- **PR**: #15 (merged to master, commits 7a4eb85, 1e2d3dd)
- **Service**: `MemoryService` in `backend/src/services/ai/memory.service.ts`
- **DB Migration**: `backend/db/init/11-hnsw-index.sql`
- **Worker**: `backend/src/queues/main.worker.ts` (cleanup job hourly)
- **Quota**: `checkQuotaAndEvict()` in memory service (10K per-user quota + LRU eviction)
- **Rate limiter**: `memoryLimiter` (100 req/min read, 20 req/min write)

## Gaps Closed

| Gap | Description | Resolution |
|-----|-------------|------------|
| G-1 | No RBAC on memory-search | ✅ RBAC validation in `memoryService.retrieveForTutor()` |
| G-2 | No efficient vector index (HNSW) | ✅ HNSW index with `m=16, ef_construction=64` |
| G-3 | No cleanup policy | ✅ Hourly `memory:cleanup` job (deletes >30 days) |
| G-4 | No per-user quota | ✅ 10K quota with LRU eviction |
| G-5 | No rate limiting | ✅ `memoryLimiter` (30 req/min) on AI endpoints |

## Archive Contents

| Artifact | Path | Status |
|----------|------|--------|
| proposal.md | `proposal.md` | ✅ Migrated from `docs/project/ai-features/sdd/memory-enhancement/proposal.md` |
| spec.md | `spec.md` | ✅ Migrated from `docs/project/ai-features/sdd/memory-enhancement/spec.md` |
| design.md | `design.md` | ✅ Migrated from `docs/project/ai-features/sdd/memory-enhancement/design.md` |
| tasks.md | `tasks.md` | ✅ Migrated from `docs/project/ai-features/sdd/memory-enhancement/tasks.md` |
| archive-report.md | `archive-report.md` | ✅ This document |
| verify-report.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |
| apply-progress.md | — | ⚠️ N/A — pre-workflow, not generated under current workflow |

## Source of Truth

The implementation is in production at:

- `backend/src/services/ai/memory.service.ts` (M-1 RBAC, M-5 quota, M-7 fallback)
- `backend/db/init/11-hnsw-index.sql` (M-2 HNSW index, M-3 IVFFlat→HNSW)
- `backend/src/queues/main.worker.ts` (M-4 cleanup job)
- `backend/src/lib/checkQuotaAndEvict.ts` or inline (M-5 LRU eviction)
- `backend/src/middleware/rate-limiters.ts` (M-6 `memoryLimiter`)

## Pattern Note

Per design: Crema's memory pattern is **RAG over product content**
(lessons, FAQs, reviews), NOT conversational memory. Therefore
`session_id`, `memory.store/recall` capabilities, and conversation
summarization are **explicitly out of scope**.

---

## Engram Traceability

| Artifact | Observation ID | Topic Key |
|----------|---------------|-----------|
| archive-report | (this save) | `sdd/memory-enhancement/archive-report` |
