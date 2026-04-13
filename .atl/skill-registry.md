# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | /home/kike/.config/opencode/skills/branch-pr/SKILL.md |
| When user asks to build web components, pages, artifacts, posters, or applications | frontend-design | /home/kike/.agents/skills/frontend-design/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | /home/kike/.config/opencode/skills/go-testing/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | /home/kike/.config/opencode/skills/issue-creation/SKILL.md |
| When user says "judgment day", "review adversarial", "dual review", "doble review" | judgment-day | /home/kike/.config/opencode/skills/judgment-day/SKILL.md |
| When orchestrator launches you to implement one or more tasks from a change | sdd-apply | /home/kike/.config/opencode/skills/sdd-apply/SKILL.md |
| When orchestrator launches you to archive a change after implementation and verification | sdd-archive | /home/kike/.config/opencode/skills/sdd-archive/SKILL.md |
| When orchestrator launches you to write or update the technical design for a change | sdd-design | /home/kike/.config/opencode/skills/sdd-design/SKILL.md |
| When orchestrator launches you to think through a feature, investigate the codebase, or clarify requirements | sdd-explore | /home/kike/.config/opencode/skills/sdd-explore/SKILL.md |
| When user wants to initialize SDD in a project, or says "sdd init", "iniciar sdd" | sdd-init | /home/kike/.config/opencode/skills/sdd-init/SKILL.md |
| When orchestrator launches you to onboard a user through the full SDD cycle | sdd-onboard | /home/kike/.config/opencode/skills/sdd-onboard/SKILL.md |
| When orchestrator launches you to create or update a proposal for a change | sdd-propose | /home/kike/.config/opencode/skills/sdd-propose/SKILL.md |
| When orchestrator launches you to write or update specs for a change | sdd-spec | /home/kike/.config/opencode/skills/sdd-spec/SKILL.md |
| When orchestrator launches you to create or update the task breakdown for a change | sdd-tasks | /home/kike/.config/opencode/skills/sdd-tasks/SKILL.md |
| When orchestrator launches you to verify a completed (or partially completed) change | sdd-verify | /home/kike/.config/opencode/skills/sdd-verify/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | /home/kike/.config/opencode/skills/skill-creator/SKILL.md |
| When user says "update skills", "skill registry", "actualizar skills", "update registry" | skill-registry | /home/kike/.config/opencode/skills/skill-registry/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### branch-pr
- Every PR MUST link an approved issue — no exceptions
- Every PR MUST have exactly one `type:*` label
- Automated checks must pass before merge is possible
- Blank PRs without issue linkage will be blocked by GitHub Actions
- Use Conventional Commits format: `feat(<project>): description`, `fix(<project>): description`
- Never commit directly to master — always use feature branches
- PR title and body must follow the team's template
- Squash and merge only after CI passes and review approved

### frontend-design
- Create production-grade interfaces with high design quality
- Avoid generic AI aesthetics — aim for distinctive, polished UI
- Choose fonts that are beautiful, unique, and interesting (never Arial, Inter, Roboto)
- Commit to a cohesive aesthetic direction (minimalist, maximalist, retro-futuristic, etc.)
- Use CSS variables for color consistency
- Prioritize CSS-only animations over JavaScript when possible
- Use Motion library for React when available
- Unexpected layouts: asymmetry, overlap, diagonal flow, grid-breaking
- Add atmospheric backgrounds: gradient meshes, noise textures, geometric patterns
- Match implementation complexity to aesthetic vision

### go-testing
- Use teatest for Bubbletea TUI testing
- Follow standard Go testing patterns
- Test file naming: *_test.go
- Use table-driven tests for multiple scenarios
- Mock external dependencies
- Coverage goal: 80%+ for core business logic
- Use golden file testing for complex output validation

### issue-creation
- Issue-first enforcement: all changes must have an issue
- Use issue templates for bug reports and feature requests
- Include steps to reproduce, expected vs actual behavior
- For features: describe user story, acceptance criteria
- Labels: bug, feature, enhancement, documentation
- Link related issues

### judgment-day
- Launch two independent blind judge sub-agents simultaneously
- Synthesize their findings into a unified report
- Apply fixes and re-judge until both pass
- Escalate after 2 iterations if consensus not reached
- Both judges must pass for approval

### sdd-apply
- Read tasks + spec + design before implementing
- Follow existing code patterns and conventions
- Load relevant coding skills for the project stack
- Run tests after implementation
- Mark tasks as completed as you go

### sdd-archive
- Sync delta specs to main specs (docs/project/)
- Archive completed change artifacts
- Generate archive report with lineage
- Clean up temporary files

### sdd-design
- Create technical design document with architecture decisions
- Document approach and rationale
- Include sequence diagrams for complex flows
- Reference existing patterns in the codebase
- Identify affected modules/packages

### sdd-explore
- Investigate codebase and understand the problem
- Research alternatives and approaches
- Document findings without committing to change
- Provide recommendations but leave decision to user

### sdd-init
- Detect project stack, conventions, testing capabilities
- Bootstrap persistence backend (engram/openspec/hybrid)
- Create skill registry if not exists
- Save project context to engram

### sdd-onboard
- Guide user through full SDD cycle
- Start with exploration, then proposal, specs, design, tasks
- Run through apply and verify phases
- Archive on completion

### sdd-propose
- Create change proposal with intent, scope, approach
- Include rollback plan for risky changes
- Identify affected modules/packages
- Define success criteria

### sdd-spec
- Write delta specifications for the change
- Use Given/When/Then format for scenarios
- Use RFC 2119 keywords (MUST, SHALL, SHOULD, MAY)
- Reference existing specs in docs/project/

### sdd-tasks
- Break down specs and design into implementation tasks
- Group tasks by phase (infrastructure, implementation, testing)
- Use hierarchical numbering (1.1, 1.2, etc.)
- Keep tasks small enough to complete in one session

### sdd-verify
- Validate implementation against specs
- Run tests if test infrastructure exists
- Compare implementation against every spec scenario
- Report CRITICAL / WARNING / SUGGESTION

### skill-creator
- Follow Agent Skills spec for new skills
- Include frontmatter with name, description, metadata
- Document trigger conditions
- Write Critical Patterns and Rules sections
- Test skill in isolation before publishing

### skill-registry
- Scan user skills across all known skill directories
- Scan project conventions (agents.md, AGENTS.md, etc.)
- Generate compact rules (5-15 lines per skill)
- Write .atl/skill-registry.md
- Save to engram if available

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | /home/kike/Documentos/Kike/Desarrollos_Software/Proyectos/crema/AGENTS.md | Project agent instructions |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
