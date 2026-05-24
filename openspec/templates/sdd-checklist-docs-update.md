---
name: sdd-checklist-docs-update
description: Checklist snippet to append to Final Verification Checklist in SDD tasks.md
---

## Documentation Update Checklist

After all code and tests pass, run this mandatory step before archiving:

### 1. Update PRD.md

```bash
# Find the feature section in PRD.md and update status
# Example for §4.12 SEO Optimizer:
```

**Status transition:**
| Before | After |
|--------|-------|
| `🆕 NUEVO - Requiere desarrollo` | `✅ SDD COMPLETO` |
| `🆕 NUEVO - Requiere desarrollo` | `✅ IMPLEMENTADO` |
| `⚠️ PARCIAL` | `✅ IMPLEMENTADO` |

**Add implementation reference:**
```markdown
> **Implementation technical reference:**
> - Servicio: `seoOptimizerService` en `services/ai/seo-optimizer.service.ts`
> - Endpoint: `POST /api/ai/product/seo`
> - Capability: `seo.optimizer` registrada en Orchestrator
```

### 2. Update TECHNICAL-SPEC.md (if exists)

```bash
# Check if docs/project/{area}/TECHNICAL-SPEC.md exists
# If yes, add to AI Services table:
| seo-optimizer | SEO Optimizer | ✅ | `seo.optimizer` | `POST /api/ai/product/seo` |
```

### 3. Update reusable-resources.md

Add new service/repository to the appropriate tables in `docs/project/reusable-resources.md`:

**AI Services table:**
```markdown
| `seoOptimizerService` | SEO meta tags generation with RAG context | Singleton |
```

**Repositories table (if new repository created):**
```markdown
| `seoOptimizerRepository` | SEO config persistence | Singleton |
```

**Active SDDs Reference section:**
```markdown
- `docs/project/ai-features/sdd/seo-optimizer/` — SEO meta tags auto-generation
```

### 4. Update reusable-resources.md §10 (Database Schema)

**If new `db/init/XX-*.sql` scripts were created**, update the Init Script Inventory table:

```markdown
| `XX-feature-name.sql` | Description of what it sets up | `<feature>` |
```

Example:
```markdown
| `13-seo-optimizer-tables.sql` | `product_seo_configs` table for SEO meta tags | `seo-optimizer` |
```

### 5. Update CremaOverview.md

In `docs/CremaOverview.md`, add or update the AI Features table:

```markdown
| **SEO Optimizer** | Meta tags automáticos para productos (meta title, description, OG, Schema) |
```

### 6. Update Project README.md

In the root `README.md`, update AI Features section:

```markdown
- ✅ **SEO Optimizer** - Meta tags automáticos con RAG context
```

### 7. Update Backend README.md (if exists)

If `backend/README.md` exists, add the new endpoint to API reference section.

### 8. Verify Links

```bash
# Ensure no broken internal links
# Check for references to the feature section
```

### 9. Commit

```bash
# Per Commit Split Procedure: DOCS goes directly to master
git add docs/project/{area}/PRD.md docs/project/reusable-resources.md docs/CremaOverview.md README.md
git commit -m "docs({area}): update project docs for {feature-name} SDD completion"
git push
```

---

## Documents to Review Summary

| Document | What to Update | When to Update |
|----------|----------------|----------------|
| `PRD.md` | Feature section status + reference | **Always** |
| `TECHNICAL-SPEC.md` | AI Services table | If exists |
| `docs/project/reusable-resources.md` §3-5 | AI Services table, Repositories table, Active SDDs Reference | New service/repository/SDD |
| `docs/project/reusable-resources.md` §10 | Init Script Inventory | **If new `db/init/` scripts created** |
| `docs/CremaOverview.md` | AI Features table | New AI feature |
| `README.md` (root) | AI Features section | New AI feature |
| `backend/README.md` | API reference | New endpoint |

---

## Rule

> **This checklist is MANDATORY for every SDD.**  
> No SDD should be archived without updating project documents first.  
> The PRD is the source of truth for feature status — it must always reflect reality.

> **Database scripts**: Always use `CREATE INDEX IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` for idempotency. Document new scripts in reusable-resources.md §10.