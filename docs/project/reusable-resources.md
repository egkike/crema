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
| `contentAssistantService` | Content analysis (summary, topics, questions) |
| `contentReaderService` | File content extraction (PDF, MD, TXT) |
| `transcriptionService` | Audio/video transcription |
| `qaAgentService`, `tutorService`, `insightsService`, `analyticsService` | Q&A agent, tutor, insights, analytics |

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

Pre-configured limiters: `loginLimiter`, `refreshLimiter`, `apiLimiter`, `aiLimiter`, `aiChatLimiter`, `aiContentLimiter`, `productUploadLimiter`, `transcribeUploadLimiter`, `webhookLimiter`, `adminReadLimiter`, `adminWriteLimiter`.

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

These SDDs reference this catalog:
- `docs/project/content-security/sdd/content-security/` — uses upload middleware, config patterns
- `docs/project/ai-features/sdd/memory-enhancement/` — uses memoryService, memoryRepository, hooks
- `docs/project/architecture-improvements/sdd/config-service/` — defines ConfigService patterns

---

*To update this catalog: edit this file and run `skill-registry` to sync changes to engram.*