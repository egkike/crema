# Delta Spec: SEO Optimizer

**Change**: seo-optimizer  
**PRD Ref**: PRD.md §4.12  
**Type**: NEW capability  
**Capability ID**: `seo.optimizer`  

---

## 1. Functional Requirements

### Requirement: Generate SEO Metadata Endpoint

The system MUST expose an HTTP endpoint `POST /api/ai/product/seo` protected by `jwtAuthMiddleware` and `seoOptimizerLimiter`.

The endpoint SHALL accept a JSON body with `productId` (string, UUID).  
The handler SHALL validate the input with a Zod schema; on validation failure it MUST return `400` with an `AppError` and a generic message.

### Requirement: Product Ownership Validation

Before processing any SEO request, the system MUST verify that the requesting user owns the specified product.

If the user does not own the product, the system MUST return `403` with an `AppError` and MUST NOT call the LLM.

> **Note on Ownership Validation**: The implementation uses an inline SQL query pattern instead of a dedicated `verifyProductOwnership` function:
> ```sql
> SELECT id, creator_id FROM "products" WHERE id = $1
> -- Verify creator_id matches userId
> ```
> This pattern is defined in tasks.md Task 4 route handler.

### Requirement: RAG Context Retrieval

For every valid request, the system SHALL retrieve product content via `memoryService.searchSimilar`.

The call SHALL use:
- `userId` as the owner filter
- `query` derived from the product name and description
- `limit = 10`
- `sourceTypes = ['lesson', 'faq', 'review']`

If no relevant fragments are found, the system MUST generate SEO metadata using only the product name and description fields.

### Requirement: SEO Metadata Generation

The service SHALL generate four types of SEO metadata using the LLM:

| Type | Description | Max Length |
|------|-------------|------------|
| `metaTitle` | SEO-optimized title | 60 characters |
| `metaDescription` | Meta description for search engines | 155 characters |
| `ogTitle`, `ogDescription`, `ogImageUrl` | Open Graph tags for social sharing | N/A (flat fields) |
| `schemaMarkup` | JSON-LD structured data | N/A (object) |

The LLM prompt SHALL include:
- Product name
- Product description
- RAG-retrieved content (top 10 fragments)
- Output format specification
- Character limits enforcement

### Requirement: Open Graph Tags

The generated Open Graph tags SHALL contain flat fields:

| Field | Description |
|-------|-------------|
| `ogTitle` | Title optimized for social sharing (max 60 chars) |
| `ogDescription` | Description for social posts (max 100 chars) |
| `ogImageUrl` | Placeholder URL or product image URL if available |
| `canonicalUrl` | Canonical URL of the product |
| `ogType` | `"product"` for product pages |
| `ogSiteName` | Crema platform name |

### Requirement: Schema Markup

The generated `schemaMarkup` SHALL be valid JSON-LD following the Product schema.org standard:

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "<product_name>",
  "description": "<product_description>",
  "image": "<image_url>",
  "url": "<product_url>",
  "offers": {
    "@type": "Offer",
    "price": "<price>",
    "priceCurrency": "<currency>"
  }
}
```

### Requirement: Credit Consumption

The SEO Optimizer feature SHALL consume AI credits on every successful generation.  
The system SHALL:
1. Call the LLM first and receive a successful response.
2. Only on success, call `aiCreditService.useCredits(userId, amount, description, referenceId)` with `amount = 1`.
3. If credit balance is insufficient, return `402` with an `AppError` (this cannot happen if credits are deducted after LLM success, since the user had credits when the request started).
4. If the LLM call fails (timeout, error, retry exhausted), return the appropriate error code (503, 500) and MUST NOT deduct credits.

Credit transactions MUST be recorded with `type = 'usage'`, `description = 'SEO Optimizer'`, and `reference_id = productId`.

### Requirement: Rate Limiting

The endpoint SHALL use a dedicated `seoOptimizerLimiter` middleware.

The max requests per window is controlled by `seo_optimizer.rate_limit` config key (default: 10), read dynamically via `configService.getNumber()` on each request. This allows independent tuning for SEO optimization traffic.

Response headers MUST include:
- `X-RateLimit-Limit`: max requests per window
- `X-RateLimit-Remaining`: remaining requests in current window
- `X-RateLimit-Reset`: Unix timestamp when the window resets

On limit exceeded, the system MUST return `429` with `Retry-After` header.

---

## 2. User Stories

| ID | Role | Want | So that |
|----|------|------|---------|
| SEO-01 | Creador | generar meta tags automáticamente | mejorar el SEO de mis páginas de producto |
| SEO-02 | Creador | obtener OG tags para redes sociales | compartir mejor en Facebook/LinkedIn |
| SEO-03 | Creador | obtener schema markup para Rich Snippets | aparecer destacado en Google |
| SEO-04 | Creador | regenerar los meta tags | iterar y mejorar el copy |
| SEO-05 | Admin | que el sistema registre transacciones de créditos | auditar uso y costos |

---

## 3. Acceptance Criteria

### AC-1: Endpoint availability
- `POST /api/ai/product/seo` returns `200` for authenticated product owners with a valid JWT.
- Unauthenticated requests return `401`.

### AC-2: Input validation
- Missing `productId` returns `400`.
- `productId` that is not a valid UUID returns `400`.

### AC-3: Ownership validation
- A product owner receives SEO metadata for their product.
- A user who does not own the product receives `403`.
- A buyer of the product receives `403` (only owners can optimize SEO).

### AC-4: SEO Metadata Quality
- `metaTitle` is between 30-60 characters.
- `metaDescription` is between 100-155 characters.
- Response contains: `ogTitle`, `ogDescription`, `ogImageUrl`, `canonicalUrl`.
- `schemaMarkup` is valid JSON-LD parseable and follows Product schema.org.

### AC-5: Credit charging
- Credits are deducted ONLY after a successful LLM response; if the LLM call fails (timeout, error), no credits are deducted.
- Insufficient credit balance returns `402`.

### AC-6: Rate limiting
- More than 10 requests per minute from the same user return `429`.
- The rate limit is configurable via `seo_optimizer.rate_limit` (default: 10).
- Response includes `X-RateLimit-*` headers on every call.

### AC-7: Error handling
- LLM timeouts (>30 s) return `503` with a generic message, without stack traces.
- All errors use `AppError` with appropriate status codes.

---

## 4. API Design

### 4.1 Endpoint

```
POST /api/ai/product/seo
```

**Middleware chain:**
```
jwtAuthMiddleware → seoOptimizerLimiter → validate(zodSchema) → handler
```

### 4.2 Zod Validation Schema

```typescript
import { z } from 'zod';

export const seoOptimizerSchema = z.object({
  productId: z.string().uuid({ message: 'productId must be a valid UUID' }),
  productName: z.string()
    .min(1, { message: 'productName is required' })
    .max(200, { message: 'productName must be less than 200 characters' }),
  productDescription: z.string()
    .min(10, { message: 'productDescription must be at least 10 characters' })
    .max(5000, { message: 'productDescription must be less than 5000 characters' }),
  productType: z.enum(['course', 'ebook', 'podcast', 'membership', 'software', 'audiobook'], {
    message: 'productType must be one of: course, ebook, podcast, membership, software, audiobook',
  }),
  creatorName: z.string().max(100).optional(),
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export type SEOOptimizerRequest = z.infer<typeof seoOptimizerSchema>;
```

### 4.3 Request / Response Types

```typescript
// Request (validated body)
interface SEOOptimizerRequest {
  productId: string;       // UUID
  productName: string;     // 1-200 chars
  productDescription: string; // 10-5000 chars
  productType: 'course' | 'ebook' | 'podcast' | 'membership' | 'software' | 'audiobook';
  creatorName?: string;    // optional
  userId: string;          // UUID
}

// Service input (what the handler passes to SeoOptimizerService)
interface SEOOptimizerInput {
  userId: string;
  productId: string;
  productName: string;
  productDescription: string;
  productType: string;
  creatorName?: string;
}

// Success response
interface SeoOptimizerResponse {
  metaTitle: string;       // 30-60 chars
  metaDescription: string; // 100-155 chars
  ogTitle: string;         // max 60 chars
  ogDescription: string;   // max 100 chars
  ogImageUrl: string;      // URL
  canonicalUrl: string;    // canonical URL
  schemaMarkup: Record<string, unknown>; // JSON-LD object
  keywords: string[];      // 5-10 keywords
}
```

### 4.4 Response Examples

**Success (200):**
```json
{
  "metaTitle": "Curso Completo de Marketing Digital | Estrategias Probadas 2026",
  "metaDescription": "Domina el marketing digital con estrategias probadas. Aprende SEO, redes sociales y email marketing en este curso completo. Inscríbete hoy.",
  "ogTitle": "Curso de Marketing Digital | Domina las Estrategias",
  "ogDescription": "Aprende marketing digital con estrategias probadas. SEO, redes sociales y más.",
  "ogImageUrl": "https://crema.com/images/product-default.jpg",
  "canonicalUrl": "https://crema.com/product/abc-123",
  "schemaMarkup": {
    "@context": "https://schema.org",
    "@type": "Course",
    "name": "Marketing Digital",
    "description": "Curso completo de marketing digital",
    "provider": {
      "@type": "Organization",
      "name": "Crema"
    }
  },
  "keywords": ["marketing digital", "SEO", "redes sociales", "email marketing"]
}
```

**Validation Error (400):**
```json
{
  "status": "error",
  "message": "productId must be a valid UUID"
}
```

**Access Denied (403):**
```json
{
  "status": "error",
  "message": "You do not have ownership of this product"
}
```

**Insufficient Credits (402):**
```json
{
  "status": "error",
  "message": "Insufficient AI credits"
}
```

**Rate Limit (429):**
```json
{
  "status": "error",
  "message": "Too many requests"
}
```
Response headers: `Retry-After: 45`, `X-RateLimit-Limit: 10`, `X-RateLimit-Remaining: 0`

---

## 5. Data Model

**No new database tables are required for v1.**

The feature reuses existing tables:

| Table | Usage |
|-------|-------|
| `products` | Product ownership validation, name, description, price, currency, image_url |
| `ai_embeddings` | RAG source for `memoryService.searchSimilar` (source_types: `lesson`, `faq`, `review`) |
| `ai_credits` | Credit balance for creators |
| `ai_credit_transactions` | Credit usage logging |

---

## 6. Error Handling

| Scenario | AppError Code | HTTP Status | Client Message | Log Level |
|----------|--------------|-------------|----------------|-----------|
| Missing/invalid body fields | `400` | `400` | Generic validation message | `warn` |
| `productId` not a UUID | `400` | `400` | `productId must be a valid UUID` | `warn` |
| User does not own product | `403` | `403` | `You do not have ownership of this product` | `info` |
| Creator with insufficient credits | `402` | `402` | `Insufficient AI credits` | `info` |
| Rate limit exceeded | `429` | `429` | `Too many requests` | `info` |
| LLM timeout (>30 s) | `503` | `503` | `Service temporarily unavailable` | `error` | No credits deducted |
| LLM failure after retries | `500` | `500` | `Error processing request. Please try again.` | `error` | No credits deducted |
| Product not found | `404` | `404` | `Product not found` | `warn` |

---

## 7. Scenarios

### 7.1 Happy Paths

#### Scenario: Creator generates SEO metadata for product

- **GIVEN** an authenticated creator with ownership of `productId = "prod-abc"`
- **AND** the creator has sufficient AI credits
- **AND** the product has `name = "Marketing Digital"`, `description = "Curso completo de marketing"`
- **WHEN** they POST `{"productId": "prod-abc"}`
- **THEN** the system returns `200` with complete SEO metadata
- **AND** 1 credit is deducted from the creator's balance
- **AND** `metaTitle` is 30-60 characters
- **AND** `metaDescription` is 100-155 characters
- **AND** `ogTitle`, `ogDescription`, `ogImageUrl` are present
- **AND** `schemaMarkup` is valid JSON-LD

#### Scenario: Creator regenerates SEO metadata

- **GIVEN** an authenticated creator with ownership of `productId = "prod-abc"`
- **AND** the creator has sufficient AI credits
- **WHEN** they POST `{"productId": "prod-abc"}` again
- **THEN** the system returns `200` with new SEO metadata (may differ slightly)
- **AND** 1 credit is deducted from the creator's balance

### 7.2 Error Paths

#### Scenario: Unauthenticated request

- **GIVEN** a request without a valid JWT
- **WHEN** it hits `POST /api/ai/product/seo`
- **THEN** the system returns `401` before reaching the handler

#### Scenario: Non-owner user

- **GIVEN** an authenticated user who does not own `productId = "prod-abc"`
- **WHEN** they send a SEO request for that product
- **THEN** the system returns `403` with `You do not have ownership of this product`
- **AND** the LLM is NOT called

#### Scenario: Buyer (not owner) attempts SEO optimization

- **GIVEN** an authenticated buyer who purchased `productId = "prod-abc"` but does not own it
- **WHEN** they send a SEO request for that product
- **THEN** the system returns `403`
- **AND** the LLM is NOT called

#### Scenario: Creator runs out of credits

- **GIVEN** an authenticated creator with ownership of the product
- **AND** their AI credit balance is `0`
- **WHEN** they send a SEO request
- **THEN** the system returns `402` with `Insufficient AI credits`
- **AND** the LLM is NOT called

#### Scenario: Rate limit exceeded

- **GIVEN** an authenticated creator who has already made 10 requests in the current minute
- **WHEN** they send another SEO request
- **THEN** the system returns `429` with `Too many requests`
- **AND** the response includes `Retry-After` and `X-RateLimit-*` headers

#### Scenario: LLM timeout

- **GIVEN** an authenticated creator with valid ownership
- **WHEN** the LLM call exceeds 30 seconds
- **THEN** the system returns `503` with `Service temporarily unavailable`
- **AND** the error is logged at `error` level without exposing stack traces
- **AND** no credits are deducted

#### Scenario: LLM failure after retries

- **GIVEN** an authenticated creator with valid ownership
- **WHEN** the LLM call fails after all retries are exhausted
- **THEN** the system returns `500` with `Error processing request. Please try again.`
- **AND** no credits are deducted

### 7.3 Edge Cases

#### Scenario: No RAG results found

- **GIVEN** a valid request for a product with no `lesson`, `faq`, or `review` embeddings
- **WHEN** the user asks for SEO optimization
- **THEN** the system generates SEO metadata using only the product name and description
- **AND** `sources` is an empty array

#### Scenario: Product with no price

- **GIVEN** a valid request for a product without a price (e.g., free product)
- **WHEN** the LLM generates schema markup
- **THEN** `offers.price` is set to `"0"` or `"Free"`
- **AND** `offers.priceCurrency` reflects the configured currency

#### Scenario: Very long product description

- **GIVEN** a product with a description exceeding 500 characters
- **WHEN** the LLM generates SEO metadata
- **THEN** the system truncates the description to 1000 characters before sending to LLM
- **AND** generation continues normally

#### Scenario: Product with special characters in name

- **GIVEN** a product with name containing special characters: `" Curso <JavaScript> & React "`
- **WHEN** the LLM generates SEO metadata
- **THEN** special characters are properly escaped in `metaTitle`, `ogTitle`, and `schemaMarkup`
- **AND** the output is valid and properly formatted