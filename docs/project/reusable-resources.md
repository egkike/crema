# Reusable Resources Inventory

**Purpose:** Complete catalog of reusable code modules for SDD design and implementation.
**Reference from:** AGENTS.md (Project Conventions section)
**Last updated:** Mayo 2026

---

## Quick Reference

| Category | Key Modules | Pattern |
|----------|-------------|---------|
| Config | `config`, `aiContentConfig`, `redisConnection` | Singleton |
| Errors | `AppError` | Class |
| Services | `configService`, `notificationService`, `emailService`, orchestrator, AI services | Singleton / Static |
| Repositories | `userRepository`, `productRepository`, `appConfigRepository` | Singleton |
| Middlewares | `jwtAuthMiddleware`, `rateLimit`, `upload`, `globalErrorHandler` | Express middleware |
| Utils | `logger`, `jwt`, `validators`, `routeHelpers` | Pure functions / Singleton |
| Types | `entities.ts`, `dto.ts`, `express.d.ts`, `ai.types.ts` | Interfaces + Zod |
| Queues | `scheduler.ts`, `main.worker.ts` | Module-level state |

---

## 1. Configuration (`src/config/`)

### `config/index.ts`
Centralized environment validation using Zod. Exports the validated `config` singleton.

```typescript
import { config } from '../config';
// Usage: config.db.host, config.jwt.secret, config.storage.maxGlobalSizeBytes
```

**Key exports:**
- `config` — singleton with all env vars (db, jwt, storage, redis, etc.)
- `getValidatedSchema()` — returns the Zod schema

### `config/ai-content.config.ts`
AI content assistant configuration (chunk sizes, limits, formats).

```typescript
import { aiContentConfig, SUPPORTED_CONTENT_TYPES, SUPPORTED_TRANSCRIPTION_FORMATS } from '../config/ai-content.config';
```

### `config/redis.ts`
Redis/BullMQ connection options.

```typescript
import { redisConnection } from '../config/redis';
```

---

## 2. Error Handling (`src/errors/`)

### `errors/AppError.ts`
Custom error class with `statusCode` and `isOperational` flags.

```typescript
import { AppError } from '../errors/AppError';
throw new AppError('message', 400);
```

**Pattern:** Used throughout all layers. Global error middleware (`middlewares/global-error.middleware.ts`) catches and formats these.

---

## 3. Services (`src/services/`)

### Core Services

| Service | What it does | Pattern |
|---------|-------------|---------|
| `configService` | Tiered config access: Redis → DB → .env → default | Singleton (`get`, `getNumber`, `getBoolean`, `getJSON`, `set`) |
| `notificationService` | Slack/Datadog error notifications with rate limiting | Singleton |
| `emailService` | Nodemailer email sender with multiple templates | Static class |
| `authService` | Partner registration with captcha + subscription | Static class |
| `userService` | User level upgrade with payout validation | Static class |
| `accessService` | Protected content delivery + guarantee evaluation | Static class |
| `commissionService` | Order commission splitting (platform/creator/affiliate) | Static class |
| `releaseService` | Balance release after guarantee period | Singleton |
| `payoutService` | Payout processing + platform liquidity checks | Singleton |
| `captchaService` | Google reCAPTCHA verification | Static class |
| `twoFactorService` | TOTP 2FA setup + QR code + backup codes | Static class |

### AI Services

| Service | What it does |
|---------|-------------|
| `llmService` | Unified LLM interface (OpenAI/Anthropic/Gemini/Ollama) |
| `embeddingService` | Vector embedding generation |
| `memoryService` | Semantic search + embedding management (RAG) |
| `aiCreditService` | AI credit balance management |
| `conciergeService` | AI support chatbot |
| `affiliateChatService` | AI chat for affiliates/buyers about specific products (RAG-based, credit-gated) |
| `contentAssistantService` | Content analysis (summary, topics, questions) |
| `contentReaderService` | File content extraction (PDF, Md, TXT) |
| `transcriptionService` | Audio/video transcription |
| `qaAgentService`, `tutorService`, `insightsService`, `analyticsService` | Q&A agent, tutor, insights, analytics |
| `interactiveAgentService` | Talleres dinámicos AI — user data + personalized analysis |

### Orchestrator

```typescript
import { orchestratorService } from '../services/orchestrator.service';
import { skillsRegistry } from '../services/skills-registry.service';
```

---

## 4. Repositories (`src/repositories/`)

| Repository | What it does |
|------------|-------------|
| `userRepository` | User CRUD, auth, 2FA, sessions |
| `productRepository` | Product CRUD, lessons, modules |
| `orderRepository` | Order CRUD, access verification, admin listing |
| `balanceRepository` | Balance operations (pending/available) |
| `commissionRepository` | Commission records |
| `payoutRepository` | Payout/withdrawal records |
| `subscriptionRepository` | User subscriptions + plan limits |
| `appConfigRepository` | App config DB storage (for ConfigService) |
| `memoryRepository` | Vector embedding persistence (pgvector) |
| `creditsRepository` | AI credit balance persistence |

**Pattern:** All repositories are singleton objects.

```typescript
import { productRepository } from '../repositories/product.repository';
import { configRepository } from '../repositories/app-config.repository';
```

---

## 5. Middlewares (`src/middlewares/`)

### Auth Middlewares

```typescript
import { jwtAuthMiddleware } from '../middlewares/auth/jwt.middleware';
import { restrictTo } from '../middlewares/auth/role.middleware';
import { validate } from '../middlewares/auth/validate.middleware';
import { checkPlanLimits } from '../middlewares/auth/checkPlanLimits.middleware';
import { requireAdmin2FA } from '../middlewares/auth/admin2fa.middleware';
```

**Usage:**
```typescript
router.post('/route', jwtAuthMiddleware, restrictTo('ADMIN'), validate(schema), handler);
```

### Rate Limiting

```typescript
import { apiLimiter, loginLimiter, aiLimiter, adminWriteLimiter } from '../middlewares/rateLimit/rateLimit';
```

Pre-configured limiters: `loginLimiter`, `refreshLimiter`, `apiLimiter`, `aiLimiter`, `aiChatLimiter`, `aiContentLimiter`, `productUploadLimiter`, `transcribeUploadLimiter`, `webhookLimiter`, `adminReadLimiter`, `adminWriteLimiter`, `interactiveAgentLimiter`.

### Storage

```typescript
import { upload, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES, EXECUTABLE_EXTENSIONS } from '../middlewares/storage/upload.middleware';
```

### Error Handling

```typescript
import { globalErrorHandler, asyncHandler } from '../middlewares/global-error.middleware';
```

### Audit

```typescript
import { auditMiddleware, logAudit, getAuditLogs } from '../middlewares/audit/audit.middleware';
// Usage: router.use(auditMiddleware('UPDATE', 'product'));
```

---

## 6. Utilities (`src/utils/`)

| Utility | What it does | Usage |
|---------|-------------|-------|
| `logger` | Pino logger with redaction, pretty/JSON | `import logger from './logger'` |
| `jwt` | JWT generation, verification, payload cleaning | `generateAccessToken()`, `verifyToken()` |
| `validators` | Argentina-specific validators (CUIT, CBU) | `validateCUIT(cuit)` |
| `params` | Safe query parameter parsing | `toString()`, `parseClamped()` |
| `routeHelpers` | Ownership/access verification | `verifyProductOwnership()` |
| `rounder` | Financial rounding to 2 decimals | `roundToTwo(value)` |
| `streamingUtil` | Mux/Cloudflare signed URL generation | `streamingUtil.getSignedUrl()` |
| `ip` | Client IP extraction | `extractClientIp(req)` |
| `url-validator` | External URL validation with domain allowlist | `validateExternalUrl()`, `validateExternalUrlSafe()`, `getExternalUrlError()` |

---

## 7. Types (`src/types/`)

### `types/entities.ts`
Core domain interfaces: `User`, `UserWithPassword`, `Product`, `Order`, `Balance`, `Payout`, `Commission`, `Coupon`, `Refund`, `AppConfig`, etc.

### `types/dto.ts`
DTOs for API input/output: `CreateOrderDTO`, `CreateProductDTO`, `CreateUserDTO`, `BalanceOperationDTO`, etc.

### `types/express.d.ts`
Express.Request extensions:
```typescript
interface AuthenticatedRequest extends Request {
  user: UserPayload;
  rateLimit?: RateLimitInfo;
  validatedBody?: unknown;
}
```

### `types/ai.types.ts`
AI features types: `AICredit`, `EmbeddingSourceType`, `AIEmbedding`, `EmbeddingSearchResult`, `SemanticSearchRequest`, etc.

### `types/ai-content.types.ts`
Content assistant types + Zod schemas: `contentSourceSchema`, `contentAnalysisRequestSchema`, etc.

---

## 8. Queues (`src/queues/`)

```typescript
import { mainQueue, initScheduler, closeScheduler } from '../queues/scheduler';
import { initMainWorker, closeWorker } from '../queues/main.worker';
```

**Scheduled jobs:** auth-cleanup, memory-cleanup, release-balances, subscription-check, liquidity-check, payout-audit.

---

## 9. Hooks (`src/hooks/`)

Embedding sync hooks for AI content:

```typescript
import { onLessonChange, onFaqChange, onQuestionCreated, onPolicyChange, onReviewCreated } from '../hooks/sync-embeddings';
// Usage: await onLessonChange(lesson, 'create');
```

---

## Pattern Summary

| Pattern | Used By | Import |
|---------|---------|--------|
| **Singleton service** | configService, notificationService, memoryService, repositories | Named import: `import { serviceName } from '../services/path'` |
| **Static class** | EmailService, AuthService, CaptchaService, TwoFactorService | `import { ClassName } from '../services/class'` |
| **Config singleton** | config, aiContentConfig, redisConnection | `import { config } from '../config'` |
| **Middleware factory** | restrictTo, validate, auditMiddleware | Called with args: `restrictTo('ADMIN')` |
| **Pure functions** | validators, params, ip, rounder | Named imports |
| **Error class** | AppError | `import { AppError } from '../errors/AppError'` |

---

## Using This Catalog in SDD

When designing a new feature in an SDD:

1. **Check this catalog first** — does a service/repository/util already exist for your need?
2. **Reference existing patterns** — don't design a new config system when `ConfigService` exists
3. **Link to this doc** — in your SDD design.md, add: "See `docs/project/reusable-resources.md` for existing modules"

### Example SDD Design Reference

```markdown
## Architecture

### Config Access
Uses `ConfigService` (see reusable-resources.md §3) for tiered config
(storage.allowed_extensions via DB, Redis cache, .env fallback).

### Error Handling
Uses `AppError` class + `globalErrorHandler` middleware
(see reusable-resources.md §2).
```

---

## Active SDDs Reference

These SDDs have been completed and reference this catalog:

### AI Features
- `docs/project/ai-features/sdd/ai-affiliate-chat/` — AI chat contextual para afiliados, usa memoryService (RAG)
- `docs/project/ai-features/sdd/memory-enhancement/` — Memory RAG con HNSW, RBAC, cleanup, quota
- `docs/project/ai-features/sdd/interactive-agent/` — Talleres dinámicos con análisis personalizado, usa aiCreditService, llmService
- `docs/project/ai-features/sdd/seo-optimizer/` — SEO meta tags con RAG context (pending implementation)

### Architecture Improvements
- `docs/project/architecture-improvements/sdd/config-service/` — Tiered config with Redis caching, crea `app_configs`
- `docs/project/architecture-improvements/sdd/concierge-integration/` — AI support chatbot con escalación, usa conciergeService
- `docs/project/architecture-improvements/sdd/error-handling/` — Error notifications con Slack/Datadog
- `docs/project/architecture-improvements/sdd/orchestrator/` — Central routing con 18 capabilities (SSE streaming)
- `docs/project/architecture-improvements/sdd/user-context/` — User context y notas, crea `user_context`, `user_notes`

### Content Security
- `docs/project/content-security/sdd/content-security/` — uses upload middleware, url-validator, config patterns

---

## 10. Database Schema (`db/init/`)

Database initialization scripts run **once on first container start** via docker-compose volume mount (`./db/init:/docker-entrypoint-initdb.d`). All scripts use `CREATE INDEX IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` for idempotency.

> **Always check this section before adding tables or indexes in an SDD.** Creating something that already exists wastes migration effort.

### Init Script Inventory

| File | What it sets up | SDD Source |
|------|-----------------|------------|
| `01-create-tables.sql` | Core tables: users, products, orders, balances, payouts, commissions, subscriptions | — |
| `02-create-indexes.sql` | Core indexes on user, product, order, balance tables | — |
| `03-create-seeds.sql` | Seed data (admin user, default plans) | — |
| `04-refactor-types.sql` | Schema migrations (add columns, constraints) | — |
| `05-ai-tables.sql` | `ai_embeddings`, `ai_credits`, `ai_credit_transactions`, `ai_credit_packages` | — |
| `06-ai-indexes.sql` | AI indexes: source, user, created_at DESC/ASC, HNSW/IVFFlat vector, cleanup, LRU eviction | — |
| `07-config-service-tables.sql` | `app_configs` table + config service setup | `config-service` |
| `08-orchestrator-tables.sql` | Orchestrator tables, skills registry | `orchestrator` |
| `09-error-handling-config.sql` | Error policies, content policies, report reasons | `error-handling` |
| `10-user-context-tables.sql` | Q&A (questions, FAQs), reviews/ratings, reports, analytics, AI agents | `user-context` |
| `11-hnsw-index.sql` | HNSW vector index (alternative to IVFFlat, requires pgvector) | `memory-enhancement` |
| `12-interactive-agent.sql` | `user_course_data`, `product_module_fields` tables for interactive agent (talleres dinámicos AI) | `interactive-agent` |
| `13-*-*.sql` | **Pending** — New scripts added during implementation | See SDD |

> **📝 For SDD authors:** When creating a new `db/init/XX-*.sql` script:
> 1. Document the script in your SDD tasks.md (e.g., Task 0 or first task)
> 2. Add it to this inventory table with the SDD source
> 3. Update the "Active SDDs Reference" section above
> 4. Use `CREATE INDEX IF NOT EXISTS` and `CREATE TABLE IF NOT EXISTS` for idempotency

### Key Indexes for AI Features

| Index | Columns | Purpose |
|-------|---------|---------|
| `idx_ai_embeddings_source` | `(source_type, source_id)` | Look up embeddings by source |
| `idx_ai_embeddings_user` | `(user_id)` | User's embedding list |
| `idx_ai_embeddings_created` | `(created_at DESC)` | Recent embeddings, vector search ordering |
| `idx_ai_embeddings_cleanup` | `(created_at ASC, id ASC)` | memory-cleanup job batched deletes (ASC scan) |
| `idx_ai_embeddings_user_created` | `(user_id, created_at ASC)` | LRU eviction (checkQuotaAndEvict) |
| `idx_ai_embeddings_hnsw` | `(embedding vector_cosine_ops)` | Cosine similarity search |
| `idx_ai_embeddings_ivfflat` | `(embedding vector_cosine_ops)` | Alternative to HNSW for large datasets |
| `idx_ai_credits_user` | `(user_id)` | Credit balance lookups |
| `idx_ai_credits_expires` | `(expires_at)` | Expired credits cleanup |

### Index Naming Conventions

```
idx_<table>_<columns>     → btree single column:     idx_users_email
idx_<table>_<col1>_<colN> → composite:               idx_orders_user_status
idx_<table>_<purpose>     → purpose-driven:         idx_ai_embeddings_cleanup
```

### Adding Indexes — Checklist

1. **Check existing indexes** in `06-ai-indexes.sql` (for AI tables) or `02-create-indexes.sql` (core tables)
2. Use `CREATE INDEX IF NOT EXISTS` so rerunning init scripts is safe
3. For vector indexes: wrap in `DO $$ BEGIN ... CREATE INDEX ... END $$` with `IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')` guard
4. Add `IF NOT EXISTS` check if the index depends on conditional features (e.g., extension not yet loaded)

### Database Connection

```typescript
import pool from '../db/postgres';
// Usage: pool.query<T>(query, params) — always parameterized
const result = await pool.query<{ created_at: Date; id: string }>(
  'SELECT created_at, id FROM ai_embeddings WHERE user_id = $1 LIMIT $2',
  [userId, 10]
);
```

### Key Schema Notes

- **`created_at` / `updated_at`**: Present on most tables but **NOT always NOT NULL** — always guard before calling `.toISOString()`
- **`id`**: UUID v4 as primary key on all major tables
- **Composite cursors**: For cursor-based pagination, use `(created_at, id)` tuple comparison with `::timestamptz` / `::text` casts, not separate `>` on each column
- **Cleanup jobs**: Use ASC scan with `created_at < cutoff` + `ORDER BY created_at ASC, id ASC` — DESC indexes don't help for ascending iteration

---

*To update this catalog: edit this file and run `skill-registry` to sync changes to engram.*