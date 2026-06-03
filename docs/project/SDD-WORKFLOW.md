## Spec Driven Development (SDD) Workflow

### Overview

SDD is the planning layer for substantial changes. Code starts ONLY after SDD is approved.

### Prerequisites

**PRD must exist FIRST** → `docs/project/<feature>/PRD.md`

SDD starts from existing PRD requirements. If PRD doesn't exist, create it first before starting SDD.

### SDD Phases

| Phase | Document | Purpose |
|-------|----------|---------|
| **init** | `init.md` | Initialize SDD context, read openspec/config.yaml |
| **explore** | `exploration.md` | Explore scope, risks, dependencies, prior art |
| **proposal** | `proposal.md` | Scope, objectives, approach |
| **spec** | `spec.md` | Functional requirements, acceptance criteria |
| **design** | `design.md` | Architecture, technical decisions |
| **tasks** | `tasks.md` | Implementation checklist |
| **apply** | `apply-progress.md` | Implementation with strict TDD evidence |
| **verify** | `verify-report.md` | Verification against specs, judgment day |
| **sync** | `sync-report.md` | Sync delta specs to `openspec/specs/` |
| **archive** | `archive-report.md` | Final archive of completed SDD |

### Phase Flow

```
PRD (existing) → init → explore → proposal → spec → design → tasks → apply → verify → sync → archive
```

### SDD Location

**`openspec/changes/<change>/` is the single source of truth** for all SDD artifacts (proposal, spec, design, tasks, apply-progress, verify-report, archive-report). The older `docs/project/<feature>/sdd/<change>/` convention was deprecated on 2026-06-03 and replaced with openspec-first. See `openspec/changes/archive/2026-06-03-*` for historical SDDs migrated from the old layout.

| Location | Purpose |
|----------|---------|
| `openspec/changes/<change>/` | **Source of truth** — proposal, spec, design, tasks, apply-progress, verify-report |
| `openspec/changes/archive/YYYY-MM-DD-<change>/` | Archived completed SDDs (after `sdd-archive`) |
| `openspec/templates/` | Reusable SDD templates (sdd-checklist, task-template, verify-report) |
| `openspec/config.yaml` | SDD configuration (`strict_tdd`, test commands, lint, typecheck) |
| `docs/project/<feature>/PRD.md` | PRD lives here (PRE-SDD, never in openspec) |
| `docs/project/common/prd-template.md` | **Template canónico** para nuevos PRDs (10 secciones: contexto → objetivos → alcance → RF/RNF → roadmap). Usar para TODOS los nuevos PRDs. |

### Document Structure

```
openspec/changes/<change>/
├── proposal.md            ← SDD: scope y objetivos
├── spec.md                ← SDD: requisitos técnicos
├── design.md              ← SDD: arquitectura
├── tasks.md               ← SDD: checklist (INCLUYE Task N+1)
├── apply-progress.md      ← SDD: implementation progress (strict TDD evidence)
├── verify-report.md       ← SDD: verification report
└── (after sdd-archive)
    → openspec/changes/archive/YYYY-MM-DD-<change>/
      ├── archive-report.md      ← Final archive
      └── (proposal, spec, design, tasks, verify-report)

docs/project/<feature>/
└── PRD.md                 ← Product requirements (PRE-SDD, lives here, not in openspec)
```

### Code Implementation Rules

- Code ONLY starts after Design phase is approved
- Follow the task list in `tasks.md` in order
- Run verification after each task
- Never skip tasks or change scope without updating SDD
- **Use strict TDD** when `openspec/config.yaml` has `strict_tdd: true`

### Mandatory Task: Update Project Documentation

**Every SDD tasks.md must end with Task N+1: Update Project Documentation**

This task updates all project documents to reflect that the SDD is complete:

| Document | What to Update | When |
|----------|----------------|------|
| `PRD.md` | Feature section status + reference | Always |
| `docs/project/reusable-resources.md` §3-5 | AI Services, Repositories, Active SDDs Reference | New service/repository/SDD |
| `docs/project/reusable-resources.md` §10 | Init Script Inventory | **If new db/init scripts created** |
| `docs/CremaOverview.md` | AI Features table | New AI feature |
| `README.md` (root) | AI Features section | New AI feature |
| `TECHNICAL-SPEC.md` | AI Services table | If exists |
| `backend/README.md` | API reference | New endpoint |

See `openspec/templates/task-template-docs-update.md` for the full task template.

### Database Scripts in SDD

When an SDD requires new database tables or indexes:

1. Create script in `backend/db/init/XX-feature-name.sql`
2. Use CREATE INDEX IF NOT EXISTS and CREATE TABLE IF NOT EXISTS for idempotency
3. Document in Task 0 or first task in tasks.md
4. Update `docs/project/reusable-resources.md` §10 (Init Script Inventory)

### Configuration Reference

See `openspec/config.yaml` for:
- `strict_tdd`: Enable strict TDD mode with test-first workflow
- `testing.runner.command`: Test command to run (default: pnpm run vitest)
- `quality.lint_command`: Lint command (default: cd backend && npm run lint)
- `quality.typecheck_command`: TypeScript check command

### When to Use SDD

Use SDD for substantial changes:
- New features with complex requirements
- Architecture changes
- Database schema changes
- New services or integrations

### Judgment Day Protocol

After implementation and before final commit:

1. User says "judgment day" or "hagamos juicio"
2. Launch two independent blind judge agents
3. Synthesize findings from both judges
4. Apply fixes for identified issues
5. Re-judge until both pass OR escalate to user

**CRITICAL** issues must be fixed immediately.  
**WARNING** issues should be fixed if easy.  
**SUGGESTION** issues are optional.

For judgment day workflow, see `judgment-day` skill.
