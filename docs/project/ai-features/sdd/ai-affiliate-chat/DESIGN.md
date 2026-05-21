# Design: AI Affiliate Chat

**Change**: `ai-affiliate-chat` | **Capability**: `affiliate.chat` | **PRD Ref**: Section 4.10

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|---|---|---|---|---|
| Service reuse | Extend `conciergeService` | New `AffiliateChatService` | B: New service | Different domain (marketing vs support), cost model (user credits vs Crema-paid), skills, and RAG needs. Same singleton pattern. |
| Intent classification | LLM-based | Keyword-based | Keyword-based | v1 MVP avoids extra LLM round-trip. Simple keyword matching (`promo`, `copy`, `objecion`, `comision`, `metrica` maps to skill). Defaults to `product_info`. |
| Credit role detection | Return role from `verifyProductAccess` | Separate buyer check in service | Separate check | `verifyProductAccess` is a shared utility. Modifying its return type is a breaking change. Service checks `orders.status = 'completed'` independently. |
| Skills deployment | Inline in handler | Separate files | Inline in handler | Follows `concierge.chat` and `qa.chat` patterns. 3 skills are simple wrappers; no architectural benefit to splitting for v1. |
| Schema validation | Manual checks | Zod schema | Zod schema | Required by SPEC section 4.2. Added to `ai.schema.ts`. |

## Data Flow

```
POST /api/ai/affiliate/chat
   jwtAuthMiddleware -> aiChatLimiter -> validate(affiliateChatSchema)
     |
     v
Route handler (ai.routes.ts)
   -- uid(req) -> userId from JWT
   -- verifyProductAccess(pool, productId, userId) -> 403 | pass
-- Buyer check: SELECT id FROM orders WHERE product_id=$1 AND buyer_id=$2 AND status='confirmed'
        buyer  -> skip credit deduction
        not buyer (affiliate) -> aiCreditService.useCredits(userId, 1, 'Affiliate Chat', productId) -> 402 | pass
        // Credit is deducted AFTER successful LLM response (see credit atomicity note below)
     |
     v
affiliateChatService.chat({ productId, userId, message })
   -- sanitizeInput(message)
   -- defensiveFramePrompt(sanitized)
   -- classifyIntent(message) -> 'product_info' | 'promo_copy' | 'affiliate_metrics'
   -- memoryService.searchSimilar(userId, sanitized, 5, ['lesson', 'faq']) -> fragments[]
   -- llmService.buildPrompt(systemPrompt, context, framedMessage) -> LLMMessage[]
   -- llmService.chat({ messages, model?, temperature?, maxTokens? })
     |
     v
{ response, sources? }
```

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/src/services/ai/affiliate-chat.service.ts` | Create | Singleton service with `chat()` method, `sanitizeInput`, `defensiveFramePrompt`, `classifyIntent`, and 3 inline skill prompts. |
| `backend/src/services/ai/index.ts` | Modify | Add `affiliate-chat` skill registration block after `concierge-chat` (around line 294). Add import for `affiliateChatService`. |
| `backend/src/routes/ai.routes.ts` | Modify | Add `POST /api/ai/affiliate/chat` route after Phase 7 routes. |
| `backend/src/schemas/ai.schema.ts` | Modify | Add `affiliateChatSchema` Zod schema. |
| `docs/project/reusable-resources.md` | Modify | Add `affiliateChatService` to AI Services catalog. |

## Service Design

### Credit Atomicity

Credits MUST be deducted **only after** the LLM call succeeds. If the LLM call fails (timeout, error, retry exhausted), credits MUST NOT be deducted.

Implementation approach:
1. Call `affiliateChatService.chat()` first
2. On success: deduct credits via `aiCreditService.useCredits(userId, 1, 'Affiliate Chat', productId)`
3. On failure: return error to user without deducting credits

**Credit deduction failure handling**: Implemented in the route handler via a dedicated try/catch around `useCredits`. If `useCredits()` throws after the LLM has already responded successfully, the error is logged but the successful response is still returned to the user. This prevents silent credit loss.

This ensures users only lose credits when they receive a valid response. Special case: `affiliate_metrics` intent returns a stub immediately without LLM call — credits are **not** deducted for this intent.

### Rate Limiting

The endpoint uses the existing `aiChatLimiter` middleware. The max requests per window is controlled by `affiliate_chat.rate_limit` (default: 30). If the shared `aiChatLimiter` is configured with a different default, the route handler passes the configured value to override it for this endpoint.

### `affiliateChatService` — singleton object

Exported as `export const affiliateChatService = { ... }`. Single method: `chat(input: AffiliateChatInput): Promise<AffiliateChatResponse>`.

**Method logic**:
1. **Sanitize**: `sanitizeInput(message)` strips control chars below 32 and DEL (127). Identical to concierge implementation.
2. **Security log**: If sanitized length differs from original by more than 10%, log warning at `warn` level (potential injection).
3. **Empty check**: If sanitized input is empty, throw AppError(400, 'Invalid input').
4. **Frame**: `defensiveFramePrompt(sanitized)` wraps text in `<user_message>`, escapes `<` and `>`.
5. **Intent**: `classifyIntent(sanitized)` — keywords checked in priority order. First match wins: `comision`/`metrica`/`conversion` → `affiliate_metrics`, `promo`/`copy`/`tweet`/`post`/`redes` → `promo_copy`, default → `product_info`.
6. **RAG**: `memoryService.searchSimilar(userId, sanitizedQuery, 5, ['lesson', 'faq'])`. Join top fragments as context string. If empty results, system prompt instructs LLM to state lack of context.
7. **System prompt**: Select based on intent:
   - `product_info`: "You are an affiliate assistant. Answer using ONLY the provided product context..."
   - `promo_copy`: Marketing-specific prompt requesting social media copy in Spanish.
   - `affiliate_metrics`: Stub response for v1 ("Metricas detalladas no disponibles en esta version").
8. **LLM call**: `llmService.buildPrompt(systemPrompt, context, framedMessage)` followed by `llmService.chat()`. Config keys: `affiliate_chat.temperature` (default 0.7), `affiliate_chat.max_tokens` (default 1000), `affiliate_chat.model`, `affiliate_chat.system_prompt`.
9. **Response**: Return `{ response, sources }` where sources maps `EmbeddingSearchResult[]` fields.

## Skill Registration (in `index.ts`)

```typescript
{
  id: 'affiliate-chat',
  name: 'AI Affiliate Chat',
  capability: 'affiliate.chat',
  description: 'Chat contextualizado sobre productos para afiliados y compradores',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'message', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => {
    // Validate each param with typeof checks (same pattern as concierge-chat)
    // Throw AppError on invalid input
    // Authorization: requestingUserId === userId
    return affiliateChatService.chat({ productId, userId, message });
  },
}
```

## Route Registration (in `ai.routes.ts`)

```typescript
router.post('/affiliate/chat',
  jwtAuthMiddleware,
  aiChatLimiter,
  validate(affiliateChatSchema),
  async (req: Request, res: Response) => {
    const userId = uid(req);
    const { productId, message, userId: bodyUserId } = req.body;

    // Auth boundary: verify body userId matches JWT identity (throws 403, outside try/catch)
    if (userId !== bodyUserId) {
      throw new AppError('Unauthorized access', 403);
    }

    try {
      await verifyProductAccess(pool, productId, userId); // 403 if no access

      // Check if user is a buyer (confirmed order) — buyers don't pay credits
      const isBuyer = await pool.query(
        `SELECT id FROM "${getValidatedSchema()}"."orders" WHERE product_id = $1 AND buyer_id = $2 AND status = 'confirmed'`,
        [productId, userId]
      );

      // Call service first; deduct credits ONLY on success
      const result = await affiliateChatService.chat({ productId, userId, message });

      // Only deduct credits if NOT a buyer (affiliate) AND intent is not affiliate_metrics
      // Note: classifyIntent uses raw message; service uses sanitized internally
      if (isBuyer.rows.length === 0) {
        const intent = classifyIntent(message); // exported from affiliate-chat.service.ts
        if (intent !== 'affiliate_metrics') {
          // Catch credit failures separately — user gets response even if credit deduction fails
          try {
            await aiCreditService.useCredits(userId, 1, 'Affiliate Chat', productId);
          } catch (creditError: unknown) {
            logger.error({ error: creditError instanceof Error ? creditError.message : 'Unknown', userId, productId }, 'Credit deduction failed after LLM success');
          }
        }
      }

      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Affiliate chat endpoint error');
      throw new AppError('Error processing request. Please try again.', 500);
    }
  }
);
```

## Configuration

All config via `configService` (tiered: Redis -> DB -> .env -> default). Keys:

| Key | Type | Default | Usage |
|---|---|---|---|
| `affiliate_chat.temperature` | number | 0.7 | LLM temperature |
| `affiliate_chat.max_tokens` | number | 1000 | Max output tokens |
| `affiliate_chat.model` | string | null | LLM model override |
| `affiliate_chat.system_prompt` | string | (default below) | Product info system prompt |
| `affiliate_chat.rate_limit` | number | 30 | Max requests per minute per user (passed to `aiChatLimiter`) |

**Note on `userId` field**: The `userId` field in the Zod schema serves as a validation that the caller knows their own identity. The route handler uses `uid(req)` from the JWT as the authoritative identity, then compares it with `userId` from the body as an auth boundary check (`uid(req) === userId`). If they don't match, the request is rejected with 403.

Default system prompt (product_info): "You are an AI assistant for product affiliates. Answer ONLY using the product context provided. If the context does not contain relevant information, state that clearly. Do not fabricate facts. Respond in Spanish."

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `sanitizeInput` strips control chars, `defensiveFramePrompt` escapes delimiters, `classifyIntent` maps keywords | Pure function tests in `affiliate-chat.service.test.ts` |
| Unit | `chat()` with mocked `memoryService`, `llmService`, `configService` | Mock service calls, verify system prompt selection per intent |
| Integration | Route `POST /api/ai/affiliate/chat`: 401 without JWT, 400 on bad schema, 403 on no access, 402 on no credits | Supertest with real middleware chain, mock service layer |
| Integration | Credit deduction: affiliate charged 1 credit, buyer not charged | Verify `aiCreditService.useCredits` call count / absence per role |

## Migration / Rollout

No migration required. No new DB tables. Rollback: comment out the `affiliate-chat` skill block in `index.ts` and the route in `ai.routes.ts`. Revert commit if needed. No effect on other capabilities.
