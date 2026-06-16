# Spec: description-generator

**Change**: description-generator
**Date**: 2026-06-12
**Status**: 🚧 IN SPEC
**Author**: sdd-spec

---

## ADDED Requirements

### Requirement: description.generator (Orchestrator Capability)

The system SHALL provide a `description.generator` capability that generates title alternatives, conversion-optimized description, SEO tags, learning objectives, and meta description for product pages.

**Input parameters** (orchestrator handler):
- `requestingUserId`: string (UUID, required)
- `productId`: string (UUID, required)
- `productDescription`: string (10-5000 chars, required)
- `productType`: enum `['course', 'ebook', 'podcast', 'membership', 'software', 'audiobook']` (required)
- `userId`: string (UUID, required — the buyer/creator making the request)

**Output shape**:
```typescript
interface DescriptionGeneratorOutput {
  titles: string[];                    // 3 title alternatives
  description: string;                // 1 paragraph conversion-optimized
  objectives: string[];               // 3-5 learning objectives
  tags: string[];                     // 5-10 SEO keywords
  metaDescription: string;            // 1 line for landing page
  detectedLanguage: 'es' | 'en' | 'pt'; // auto-detected from input
  sources: Array<{                     // RAG context
    contentType: 'lesson' | 'faq' | 'review';
    contentId: string;
    similarity: number;
  }>;
  cached: boolean;                     // true if served from Redis cache
  degraded: boolean;                   // true if LLM response was malformed and fallback was used
}
```

**Timeout**: 30s (orchestrator), 60s (route-level)
**Cacheable**: false (at orchestrator level; service-level Redis cache is implemented for 7-day TTL)

#### Scenario: Valid input with cache miss
- **Given** a creator with valid JWT, product ownership, and sufficient credits
- **When** `POST /api/ai/product/description` is called with valid input
- **Then** the system returns `200` with full `DescriptionGeneratorOutput`, `cached: false`, deducts 1 credit, and stores result in Redis with 7-day TTL

#### Scenario: Valid input with cache hit
- **Given** a creator with valid JWT, product ownership, and sufficient credits
- **When** `POST /api/ai/product/description` is called with input matching existing cache key
- **Then** the system returns `200` with full `DescriptionGeneratorOutput`, `cached: true`, and deducts 0 credits

#### Scenario: Input language Spanish detected
- **Given** a valid input with `productDescription` in Spanish
- **When** the service processes the input
- **Then** the output is generated in Spanish (`detectedLanguage: 'es'`) and all fields contain Spanish text

#### Scenario: Input language English detected
- **Given** a valid input with `productDescription` in English
- **When** the service processes the input
- **Then** the output is generated in English (`detectedLanguage: 'en'`) and all fields contain English text

#### Scenario: Input language Portuguese detected
- **Given** a valid input with `productDescription` in Portuguese
- **When** the service processes the input
- **Then** the output is generated in Portuguese (`detectedLanguage: 'pt'`) and all fields contain Portuguese text

#### Scenario: Orchestrator handler validates input correctly
- **Given** `description.generator` is called via orchestrator with invalid input
- **When** the handler validates the input
- **Then** it throws `AppError(400)` with descriptive message for each invalid field

#### Scenario: Orchestrator handler authorization
- **Given** `description.generator` is called with `requestingUserId !== userId`
- **When** the handler checks authorization
- **Then** it throws `AppError(403)`

#### Scenario: Orchestrator times out (>30s)
- **Given** `description.generator` is called with valid input
- **When** processing exceeds 30 seconds
- **Then** the orchestrator returns a timeout error

---

### Requirement: POST /api/ai/product/description (HTTP Endpoint)

The system SHALL provide a `POST /api/ai/product/description` endpoint protected by JWT authentication, creator role restriction (`restrictTo('CREATOR')`), Zod validation, rate limiting, product ownership verification (`verifyProductOwnership`), and credit pre-check.

**Auth**: JWT required, `Creator` role required (via `restrictTo('CREATOR')`)
**Rate limit**: 10 req/min via `descriptionGeneratorLimiter`
**Ownership**: Verified via `verifyProductOwnership(pool, productId, userId)` — throws 403 for both not-found and mismatch (single combined query)
**Timeout**: 60 seconds (LLM call)

#### Scenario: No JWT provided
- **Given** no JWT token in request
- **When** `POST /api/ai/product/description` is called
- **Then** returns `401`

#### Scenario: Missing required field productId
- **Given** a valid JWT with missing `productId`
- **When** `POST /api/ai/product/description` is called
- **Then** returns `400` with Zod validation error

#### Scenario: productDescription too short (< 10 chars)
- **Given** a valid JWT with `productDescription` of 5 characters
- **When** `POST /api/ai/product/description` is called
- **Then** returns `400` with Zod validation error

#### Scenario: productType not in enum
- **Given** a valid JWT with `productType: 'invalid_type'`
- **When** `POST /api/ai/product/description` is called
- **Then** returns `400` with Zod validation error

#### Scenario: User does not own product
- **Given** a valid JWT for user X requesting description for product Y owned by user Z
- **When** `POST /api/ai/product/description` is called
- **Then** returns `403`

#### Scenario: User has 0 credits
- **Given** a valid JWT with 0 credit balance
- **When** `POST /api/ai/product/description` is called
- **Then** returns `402` before any LLM call is made

#### Scenario: Rate limit exceeded (11th request in 1 minute)
- **Given** a valid JWT that has made 10 requests in the last minute
- **When** `POST /api/ai/product/description` is called
- **Then** returns `429`

#### Scenario: Valid request returns full output shape
- **Given** a valid JWT, product ownership, and sufficient credits
- **When** `POST /api/ai/product/description` is called with valid input
- **Then** returns `200` with `{ success: true, data: DescriptionGeneratorOutput, creditsUsed: 1 }`

---

### Requirement: Credit Operation — description_generation

The system SHALL deduct 1 credit for each `description_generation` operation, with pre-check before LLM call and deduction after success.

**Cost**: 1 credit per generation
**Pre-check**: balance >= 1 before LLM call (returns 402 if not)
**Deduction**: AFTER successful LLM response (not on cache hit, not on degraded output)
**Cache hit**: 0 credits deducted
**Degraded output**: 0 credits deducted (no useful LLM output produced)

#### Scenario: Insufficient credits returns 402 before LLM
- **Given** a user with 0 credits calling the description generator
- **When** the service checks credit balance
- **Then** LLM is NOT called and `AppError(402)` is thrown

#### Scenario: Credit deducted only after successful LLM response
- **Given** a user with 1 credit calling the description generator
- **When** the LLM call succeeds
- **Then** credit is deducted AFTER receiving the LLM response

#### Scenario: Cache hit does not deduct credit
- **Given** a user with 1 credit calling with input matching cache
- **When** cache hit occurs
- **Then** 0 credits are deducted and response includes `cached: true`

#### Scenario: Degraded output does not deduct credit
- **Given** a user with 1 credit calling the description generator
- **When** the LLM returns malformed JSON and fallback is used (`degraded: true`)
- **Then** 0 credits are deducted and response includes `degraded: true`

---

### Requirement: Redis Cache (description-generator)

The system SHALL cache description generator output in Redis using a content-based key with 7-day TTL.

**Key format**: `hash(productId + description_normalized + productType + schema_version)`
**Value**: Full JSON `DescriptionGeneratorOutput`
**TTL**: 604800 seconds (7 days)
**Schema version**: Bump `SCHEMA_VERSION` constant when output shape changes

#### Scenario: Cache miss triggers generation and stores result
- **Given** a valid input with no existing cache entry
- **When** `descriptionGeneratorService.generate` is called
- **Then** it generates output, stores in Redis with 7-day TTL, returns with `cached: false`

#### Scenario: Cache hit returns stored result without LLM call
- **Given** a valid input matching an existing cache entry
- **When** `descriptionGeneratorService.generate` is called
- **Then** it returns the cached result directly without calling LLM

#### Scenario: Different productId produces different cache key
- **Given** the same description text but different productId values
- **When** cache keys are generated
- **Then** they are different due to productId in hash

#### Scenario: Redis unavailable — graceful degradation
- **Given** Redis is unavailable (connection refused or timeout)
- **When** `descriptionGeneratorService.generate` is called
- **Then** generation succeeds without caching, `cached: false` is returned, and a warning is logged

---

### Requirement: Shared Lib — ai-product-optimizer.lib.ts

The system SHALL provide reusable helpers in `lib/ai-product-optimizer.lib.ts` for RAG context fetching, LLM calls, response parsing, and credit deduction.

**Exported helpers**:
- `fetchProductRagContext(userId, query)` — Returns RAG chunks from `memoryService.searchSimilar(..., ['lesson', 'faq', 'review'])`. Query constructed from product description; no productId needed.
- `callLLMForOptimization<T>(systemPrompt, userPrompt, configPrefix, schema?)` — Typed LLM call wrapper with configService reading; optional `schema` param for future Zod response validation
- `parseStructuredResponse<T>(rawLLMText, fallback)` — JSON parse with safety fallback, never throws
- `deductCreditsAfterSuccess(userId, operationKey, metadata)` — Credit deduction with typed `operationKey` union (includes `'description_generation'`), no type cast needed

#### Scenario: fetchProductRagContext returns chunks from lessons/faqs/reviews
- **Given** a user with content containing lessons, FAQs, and reviews
- **When** `fetchProductRagContext(userId, query)` is called
- **Then** it returns RAG chunks from `memoryService.searchSimilar` with sourceTypes `['lesson', 'faq', 'review']`

#### Scenario: parseStructuredResponse returns fallback on malformed JSON
- **Given** a malformed LLM response string (not valid JSON)
- **When** `parseStructuredResponse<Foo>(rawText, fallback)` is called
- **Then** it returns `fallback` without throwing

#### Scenario: parseStructuredResponse returns parsed object on valid JSON
- **Given** a valid LLM response string containing `{"titles": ["A", "B", "C"]}`
- **When** `parseStructuredResponse<{titles: string[]}>(rawText, fallback)` is called
- **Then** it returns the parsed object

#### Scenario: LLM returns exactly 3 title alternatives
- **Given** the LLM returns valid JSON with 3 titles
- **When** `parseStructuredResponse` is called
- **Then** `titles` is a string array of length 3

#### Scenario: deductCreditsAfterSuccess throws 402 on insufficient credits
- **Given** a user with 0 credits
- **When** `deductCreditsAfterSuccess(userId, 'description_generation', meta)` is called
- **Then** it throws `AppError(402, 'Insufficient credits')`

#### Scenario: deductCreditsAfterSuccess uses typed operationKey without cast
- **Given** the `operationKey` parameter is typed as `'search' | 'chat' | 'generate_insight' | 'churn_prediction' | 'description_generation'`
- **When** called with `'description_generation'`
- **Then** TypeScript infers the correct type without any `as` cast

#### Scenario: deductCreditsAfterSuccess deducts credit on success
- **Given** a user with 1 credit
- **When** `deductCreditsAfterSuccess(userId, 'description_generation', meta)` is called
- **Then** it deducts 1 credit and returns without error

#### Scenario: LLM returns valid JSON with empty titles array
- **Given** the LLM returns valid JSON `{"titles": [], "description": "...", "objectives": [], "tags": [], "metaDescription": "...", "detectedLanguage": "en"}`
- **When** the service parses the response
- **Then** `output.titles` is an empty array and `output.degraded` is `true`

#### Scenario: LLM returns valid JSON with missing objectives field
- **Given** the LLM returns valid JSON without the `objectives` field
- **When** the service parses the response
- **Then** `output.objectives` is an empty array and `output.degraded` is `true`

#### Scenario: Redis is unavailable during cache write
- **Given** Redis connection fails on `cacheSet`
- **When** the service completes LLM generation successfully
- **Then** generation succeeds, cached output is NOT stored, a warning is logged, and the response returns `cached: false`

---

### Requirement: Configuration Keys (description_generator.*)

The system SHALL read description-generator-specific config keys via `configService`.

| Key | Type | Default | Consumed by |
|-----|------|---------|-------------|
| `description_generator.temperature` | number | 0.7 | service (LLM call) |
| `description_generator.max_tokens` | number | 2000 | service (LLM call) |
| `description_generator.model` | string | null (use default) | service (LLM model override) |

---

## MODIFIED Requirements

None — this is a pure new capability, no existing specs modified.

## REMOVED Requirements

None.

---

## Reusable Resources (Formal List)

| Module | Location | Pattern | Used By |
|--------|----------|---------|---------|
| `AppError` | `src/errors/AppError.ts` | Class | All layers |
| `llmService` | `src/services/ai/llm.service.ts` | Singleton `chat()` | description-generator.service.ts |
| `memoryService` | `src/services/ai/memory.service.ts` | Singleton `searchSimilar()` | ai-product-optimizer.lib.ts |
| `aiCreditService` | `src/services/ai/credits.service.ts` | Singleton `useCredits()`, `getOperationCost()` | ai-product-optimizer.lib.ts |
| `configService` | `src/services/config.service.ts` | Singleton `getNumber()`, `get()` | description-generator.service.ts |
| `jwtAuthMiddleware` | `src/middlewares/auth/jwt.middleware.ts` | Express middleware | ai.routes.ts |
| `restrictTo` | `src/middlewares/auth/role.middleware.ts` | Express middleware factory | ai.routes.ts |
| `validate` | `src/middlewares/auth/validate.middleware.ts` | Express middleware factory | ai.routes.ts |
| `asyncHandler` | `src/middlewares/global-error.middleware.ts` | Express wrapper | ai.routes.ts |
| `rateLimit` | `src/middlewares/rateLimit/rateLimit.ts` | Express middleware factory | ai.routes.ts |
| `logger` | `src/utils/logger.ts` | Pino logger | All layers |
| `verifyProductOwnership` | `src/utils/routeHelpers.util.ts` | Helper function | ai.routes.ts (ownership check) |
| `contentReaderService` | `src/services/ai/content/content-reader.service.ts` | Singleton | Future SEO Optimizer refactor |

---

## Configuration Keys Summary

| Key | Type | Default | Consumed by |
|-----|------|---------|-------------|
| `description_generator.temperature` | number | 0.7 | `callLLMForOptimization` |
| `description_generator.max_tokens` | number | 2000 | `callLLMForOptimization` |
| `description_generator.model` | string | null | `callLLMForOptimization` |

---

## Cache Specification

| Property | Value |
|----------|-------|
| Key format | `hash(productId + description_normalized + productType + schema_version)` |
| TTL | 604800 seconds (7 days) |
| Schema version | `SCHEMA_VERSION = 1` |
| Storage | Full JSON `DescriptionGeneratorOutput` |
| Hit behavior | Return cached, 0 credits, no LLM call |
| Miss behavior | Generate, deduct credit, store with TTL |

---

## Credit Operation Specification

| Property | Value |
|----------|-------|
| Operation key | `description_generation` |
| Cost | 1 credit |
| Pre-check | `balance >= 1` before LLM call |
| Deduction timing | AFTER successful LLM response |
| Cache hit | 0 credits deducted |
| Degraded output | 0 credits deducted (no useful LLM output) |
| Error on failure | No deduction (idempotent) |

---

## Chained PR Split Guidance

Structure Given/When/Then scenarios to align with 4 chained PRs (strict TDD — each PR includes its own tests):

1. **PR #1: Shared lib + lib tests** (~303 lines) — `lib/ai-product-optimizer.lib.ts` + `lib/ai-product-optimizer.lib.test.ts` + `config.service.ts` (+3 lines)
   - Scenarios: Shared lib scenarios (parseStructuredResponse, fetchProductRagContext, deductCreditsAfterSuccess, cache helpers)

2. **PR #2a: Service skeleton + validation + cache read** (~300 lines) — `services/ai/description-generator.service.ts` (partial: skeleton + input validation + cache read logic only) + partial test file (~50 lines)
   - Scenarios: Input validation only (3 tests: empty productId, description < 10 chars, description > 5000 chars)

3. **PR #2b: Service core: RAG + LLM + output + error + lang** (~300 lines) — extends `services/ai/description-generator.service.ts` (LLM core, RAG, output, error handling, language detection) + `__tests__/services/ai/description-generator.service.test.ts` (remaining ~200 lines)
    - Scenarios: Service core scenarios (cache hit/miss, RAG, LLM success/failure, language detection, output truncation, degraded output) — 21 tests (plus 3 from PR 2a = 24 total service tests)

4. **PR #3: Registration + integration tests** (~320 lines) — orchestrator + route + schema + limiter + credit op + `__tests__/routes/description-generator.routes.test.ts`
    - Scenarios: Route scenarios with full HTTP flow (auth, validation, authorization, credits, timeout, rate limit), Orchestrator scenarios — 16 tests (per tasks.md T3.7)

---

## Metadata

| Field | Value |
|-------|-------|
| Capability | `description.generator` |
| HTTP Endpoint | `POST /api/ai/product/description` |
| Orchestrator ID | `description-generator` |
| Rate Limiter | `descriptionGeneratorLimiter` (10 req/min) |
| Credit Cost | 1 credit |
| Cache TTL | 7 days |
| LLM Timeout | 60s |
| Strict TDD | true (per `openspec/config.yaml`) |