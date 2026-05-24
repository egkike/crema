---
name: task-template-docs-update
description: Task template for SDD docs update — append this as the final task in every SDD tasks.md
---

## Task N+1: Update Project Documentation

**Depends on**: All previous tasks complete and verified

### What to do

After successful verification, update project documents to reflect that this SDD is complete. Follow this order:

#### 1. Update PRD.md (primary source of truth)

Change the status for the feature section:
- **Before**: `🆕 NUEVO - Requiere desarrollo` or similar pending status
- **After**: `✅ SDD COMPLETO` or `✅ IMPLEMENTADO` as appropriate

Add implementation reference block:
```markdown
> **Implementation technical reference:**
> - Servicio: `serviceName` en `services/ai/service-name.service.ts`
> - Endpoint: `METHOD /api/path`
> - Rate limiter: `limiterName` (N/min)
> - Capability: `capability.id` registrada en Orchestrator
> - Config keys: `service_name.*`
```

Also update the header status line at the top of PRD.md.

#### 2. Update TECHNICAL-SPEC.md (if exists)

Check if `docs/project/<area>/TECHNICAL-SPEC.md` exists and add the feature to relevant tables.

#### 3. Update reusable-resources.md

Add new service to AI Services table and new repository to Repositories table in `docs/project/reusable-resources.md`:

```markdown
| `serviceName` | Description | Pattern |
```

Also update Active SDDs Reference section:
```markdown
- `docs/project/<area>/sdd/<feature>/` — Description
```

#### 4. Update Database Schema Documentation (§10)

If new `db/init/XX-*.sql` scripts were created, update `docs/project/reusable-resources.md` §10:

Add to Init Script Inventory table:
```markdown
| `XX-feature-name.sql` | Description of what it sets up | `<feature>` |
```

Update the Init Script Inventory header note to remove "Pending" if this is the first script added.

#### 5. Update CremaOverview.md

Add to AI Features table in `docs/CremaOverview.md`:
```markdown
| **Feature Name** | Description |
```

#### 6. Update Project README.md (root)

Add to AI Features list in root `README.md`:
```markdown
- ✅ **Feature Name** - Description
```

#### 7. Update backend/README.md (if exists)

If `backend/README.md` exists, add new endpoint to API reference section.

### Verification
- [ ] PRD.md section shows updated status
- [ ] PRD.md includes implementation reference with file paths
- [ ] TECHNICAL-SPEC.md (if exists) updated
- [ ] reusable-resources.md updated (AI Services + Repositories + Active SDDs)
- [ ] reusable-resources.md §10 updated (if new db scripts created)
- [ ] CremaOverview.md updated
- [ ] README.md (root) updated
- [ ] No broken internal links

### Documents Summary

| Document | What to Update | When to Update |
|----------|----------------|----------------|
| `PRD.md` | Feature section status + reference | **Always** |
| `TECHNICAL-SPEC.md` | AI Services table | If exists |
| `docs/project/reusable-resources.md` §3-5 | AI Services table, Repositories table | New service/repository |
| `docs/project/reusable-resources.md` §10 | Init Script Inventory | **If new `db/init/` scripts created** |
| `docs/project/reusable-resources.md` | Active SDDs Reference | New SDD |
| `docs/CremaOverview.md` | AI Features table | New AI feature |
| `README.md` (root) | AI Features section | New AI feature |
| `backend/README.md` | API reference | New endpoint |

### Execution Order

1. Edit PRD.md first (primary source of truth)
2. Then update TECHNICAL-SPEC.md if applicable
3. Update reusable-resources.md (services, repos, active SDDs)
4. Update reusable-resources.md §10 (if new db scripts)
5. Update CremaOverview.md
6. Update root README.md
7. Update backend/README.md if exists
8. Verify links are correct

### Notes

- This task should ALWAYS be the last task in any SDD tasks.md
- Status updates follow this pattern:
  - `🆕 NUEVO - Requiere desarrollo` → `✅ SDD COMPLETO` (SDD done, implementation pending)
  - `🆕 NUEVO - Requiere desarrollo` → `✅ IMPLEMENTADO` (SDD + implementation done)
  - `⚠️ PARCIAL` → `✅ IMPLEMENTADO` (completed partial implementation)
- Commit this task separately as docs (direct to master) per Commit Split Procedure
- **Database scripts**: Always use `CREATE INDEX IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` for idempotency