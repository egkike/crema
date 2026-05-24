---
name: verify-report-template
description: Template for SDD verify-report — includes docs update section
---

# Verification Report: {change-name}

**Change**: `{change-name}`  
**Date**: {date}  
**Verification Mode**: {mode}  

---

## Executive Summary

{Brief summary of what was verified and the outcome}

---

## Verification Results

### Files Checked

| File | Purpose | Status |
|------|---------|--------|
| | | |

### Implementation Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| | | |

---

## Issues Found

### Critical Issues
{None / List issues}

### Warnings
{None / List warnings}

### Suggestions
{None / List suggestions}

---

## Test Results

| Test Suite | Result |
|------------|--------|
| | |

---

## Documentation Update Required

**Prerequisite for archive phase.** After verification passes, update these documents:

### Priority 1: Primary Sources of Truth

| Document | Section | Update Required |
|----------|---------|-----------------|
| `PRD.md` | §X.X | Change status from "🆕 NUEVO" to "✅ SDD COMPLETO" + add implementation reference |
| `docs/project/reusable-resources.md` | AI Services / Repositories / Active SDDs | Add new service/repository/SDD reference |

### Priority 2: Overview Documents

| Document | Section | Update Required |
|----------|---------|-----------------|
| `docs/CremaOverview.md` | AI Features table | Add feature entry |
| `README.md` (root) | AI Features section | Add feature entry |

### Priority 3: If Applicable

| Document | Condition | Update Required |
|----------|-----------|-----------------|
| `TECHNICAL-SPEC.md` | If exists | Add to AI Services table |
| `backend/README.md` | If exists | Add endpoint to API reference |

### Action Items

1. Edit `docs/project/{area}/PRD.md` — update feature section status + add implementation reference
2. Edit `docs/project/reusable-resources.md` — add to AI Services, Repositories, and Active SDDs sections
3. Edit `docs/CremaOverview.md` — add to AI Features table
4. Edit `README.md` (root) — add to AI Features section
5. Edit `TECHNICAL-SPEC.md` if exists — add to AI Services table
6. Edit `backend/README.md` if exists — add endpoint
7. Verify no broken internal links
8. Commit as docs (direct to master per Commit Split Procedure)

---

## Recommendation

- [ ] **PROCEED TO DOCS UPDATE** — All checks pass
- [ ] **BLOCKED** — Fix issues above before proceeding

---

## Sign-off

| Judge | Verdict | Notes |
|-------|---------|-------|
| | | |

---

## Next Steps

1. ✅ Complete implementation tasks (1-N)
2. ✅ Run verification
3. ⏳ **UPDATE DOCUMENTS** (see section above)
4. ⏳ Archive SDD