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
| "improve accessibility", "a11y audit", "WCAG compliance", "screen reader support", "keyboard navigation", "make accessible" | accessibility | .agents/skills/accessibility/SKILL.md |
| "Astro", ".astro files", "static site generation", "islands architecture", "content collections", "deploy Astro" | astro | .agents/skills/astro/SKILL.md |
| "improve SEO", "optimize for search", "fix meta tags", "add structured data", "sitemap" | seo | .agents/skills/seo/SKILL.md |
| Tailwind CSS, styling, responsive design, CSS utilities | tailwind-css-patterns | .agents/skills/tailwind-css-patterns/SKILL.md |
| TypeScript advanced types, generics, conditional types | typescript-advanced-types | .agents/skills/typescript-advanced-types/SKILL.md |
| Writing tests, vitest, mocking, coverage, test patterns | vitest | .agents/skills/vitest/SKILL.md |
| React/Next.js performance, re-renders, bundle optimization | vercel-react-best-practices | .agents/skills/vercel-react-best-practices/SKILL.md |
| React compound components, render props, context provider, component architecture | vercel-composition-patterns | .agents/skills/vercel-composition-patterns/SKILL.md |
| Node.js principles, framework selection, async patterns, security | nodejs-best-practices | .agents/skills/nodejs-best-practices/SKILL.md |
| Express.js server, REST API, middleware, authentication | nodejs-express-server | .agents/skills/nodejs-express-server/SKILL.md |
| Backend architecture, Node.js patterns, microservices | nodejs-backend-patterns | .agents/skills/nodejs-backend-patterns/SKILL.md |

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

### accessibility
- WCAG 2.2: follow POUR principles (Perceivable, Operable, Understandable, Robust)
- Target AA compliance minimum (4.5:1 contrast for text, 3:1 for large text/UI)
- All images need alt text (descriptive or alt="" for decorative)
- Icon buttons need aria-label or visually-hidden text
- All functionality must be keyboard accessible (Enter/Space support)
- Use :focus-visible for visible focus indicators (never remove outlines)
- Form inputs need programmatically associated labels
- Use aria-live for dynamic content announcements
- Respect prefers-reduced-motion for animations
- Interactive targets minimum 24x24px (44x44 recommended)

### astro
- Use --config flag for custom config path if needed
- Run `npx astro sync` after adding/changing integrations for TypeScript types
- Deploy with adapter: `npx astro add vercel/node/cloudflare/netlify`
- Pages go in src/pages/ (filename = route)
- Components go in src/components/ (convention)
- Public assets go in public/ (copied as-is to build)
- Use `npx astro check` before build to catch errors
- Set site config for sitemaps and canonical URLs

### frontend-design
- Commit to a bold aesthetic direction (maximalist, minimalist, retro-futuristic, etc.)
- Choose distinctive fonts (avoid Inter, Roboto, Arial, system fonts)
- Use CSS variables for consistent theming
- Prioritize high-impact animations over scattered micro-interactions
- Use Motion library for React, CSS-only for HTML
- Create atmosphere with gradients, textures, noise, shadows vs solid colors
- Unexpected layouts: asymmetry, overlap, diagonal flow, grid-breaking
- Match implementation complexity to aesthetic vision

### nodejs-backend-patterns
- Apply Clean Architecture: controllers → services → repositories
- Use dependency injection for testability
- Implement proper error handling with custom error classes
- Use Zod for input validation at API boundaries
- Apply rate limiting on all public endpoints
- Implement proper logging with correlation IDs
- Use parameterized queries for all database operations

### nodejs-best-practices
- Choose framework based on context (Hono for edge, Fastify for performance, Express for legacy)
- Use layered architecture for growing projects
- Fail fast: validate early at boundaries
- Don't trust any input (even "internal" data)
- Use async/await for sequential, Promise.all for parallel independent operations
- Never use sync methods in production (fs.readFileSync, etc.)
- Centralized error handling with consistent response format

### nodejs-express-server
- Use express-validator or Zod for input validation
- Implement proper security headers with Helmet.js
- Use httpOnly, secure, sameSite cookies for auth tokens
- Implement rate limiting with express-rate-limit
- Proper CORS configuration with explicit allowed origins
- Centralized error handling middleware
- Use controller → service → repository pattern

### seo
- Title tags: 50-60 chars, primary keyword near start, unique per page
- Meta descriptions: 150-160 chars, compelling with CTA, unique per page
- Single h1 per page with logical heading hierarchy
- Use semantic HTML (header, nav, main, footer, article)
- Implement structured data (JSON-LD) for rich snippets
- robots.txt: allow public paths, disallow admin/api/private
- XML sitemap: max 50k URLs, include lastmod
- Canonical URLs to prevent duplicate content

### tailwind-css-patterns
- Use utility classes for composition over custom CSS
- Apply responsive prefixes: md:, lg:, xl: for breakpoints
- Use @apply for repeated patterns, utility classes for one-offs
- Implement dark mode with dark: prefix
- Use group and group-hover for parent-child hover states
- Use focus:, active:, disabled: for interaction states
- Apply container queries with @container when needed

### typescript-advanced-types
- Use generics for reusable type-safe components
- Prefer readonly arrays and const assertions
- Use satisfies for validation without narrowing
- Utility types: Partial, Required, Pick, Omit, Record
- Conditional types for type inference from functions
- Template literal types for string patterns
- Use never for exhaustive type checking

### vercel-composition-patterns
- Avoid boolean prop proliferation (use explicit variants)
- Use compound components for related UI pieces
- Prefer children over render props
- Decouple state from implementation with context
- Lift state up only when shared, keep local otherwise
- Use explicit variant props over optional booleans
- React 19: no forwardRef needed, ref is regular prop
- Use useActionState for form mutations, useOptimistic for optimistic UI

### vercel-react-best-practices
- No useMemo/useCallback unless proven necessary (React Compiler handles it)
- use() hook for promises/context, replaces useEffect for data fetching
- Server Components by default, add 'use client' only for interactivity
- Server actions: use useActionState, proper error boundaries
- Use Suspense boundaries for streaming
- Implement proper error boundaries with error.tsx
- Prefetch with link rel="prefetch" for visible links
- Avoid passing object/function props that cause re-renders

### vitest
- Use describe/it for test structure
- Use beforeEach/afterEach for setup/teardown
- Use vi.fn() for mocking, vi.spyOn() for existing methods
- Use fake timers with vi.useFakeTimers() for time-dependent tests
- Use toEqual for objects/arrays, toBe for primitives
- Use test.each for parameterized tests
- Use skip/only to control test execution
- Coverage: --coverage flag with v8 or istanbul provider

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | AGENTS.md | Project agent instructions |
| Vercel React Best Practices | .agents/skills/vercel-react-best-practices/AGENTS.md | Referenced by AGENTS.md |
| Vercel Composition Patterns | .agents/skills/vercel-composition-patterns/AGENTS.md | Referenced by AGENTS.md |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
