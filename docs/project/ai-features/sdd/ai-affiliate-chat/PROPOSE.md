# Proposal: AI Afiliate Chat

**Change**: ai-affiliate-chat
**Type**: AI Feature
**Phase**: A (weeks 1-2)
**Date**: Mayo 2026
**PRD Ref**: PRD.md §4.10

---

## Intent

Dar a Afiliados y Compradores un chat con IA contextualizado sobre productos específicos. El afiliado pregunta sobre el producto que promociona (objeciones, ángulos de venta, copy para redes); el comprador resuelve dudas post-compra. La IA responde basada en el contenido real del producto, no en conocimiento general.

> **Del PRD (§4.10):** "Entrenado con el contenido del producto que promocionan."

## Scope

### In Scope
- `AffiliateChatService` — nuevo servicio singleton en `services/ai/`
- Registro como capability `affiliate.chat` en Orchestrator (skillsRegistry)
- Contexto de producto vía `memoryService.searchSimilar` (RAG sobre ai_embeddings)
- 3 skills nuevos: `get_product_info`, `get_affiliate_metrics`, `generate_promo_copy`
- Validación de acceso: el usuario debe tener acceso al producto (comprador o afiliado aprobado)
- Rate limiting con `aiChatLimiter` (ya existe)
- Defensa contra prompt injection (reutiliza `sanitizeInput` + `defensiveFramePrompt`)
- Input validation con Zod (nunca `any`)
- Consumo de créditos AI para afiliados (compradores: incluido en compra)

### Out of Scope
- Historial de conversación persistente (misma sesión HTTP, sin DB)
- Análisis de audiencia agregado ("¿la mayoría de tus referidos preguntan por...?") — requiere dashboards, se posterga
- Métricas de afiliado en tiempo real (requires commission/order aggregation pipeline)
- Frontend (panel de afiliado/comprador)

## Capabilities

### New Capabilities
- `affiliate-chat`: Chat contextualizado sobre productos para afiliados y compradores

### Modified Capabilities
None — es un capability nuevo, no modifica los existentes.

## Approach

### ¿Extender ConciergeService o crear AffiliateChatService?

**Crear `AffiliateChatService` nuevo.** ConciergeService es soporte de plataforma sin contexto de producto, pagado por Crema. AffiliateChatService requiere RAG sobre contenido de producto, consume créditos del usuario, y tiene skills de marketing que Concierge no necesita. Mismo patrón singleton, diferente dominio.

### Ubicación del código

| Capa | Archivo | Acción |
|------|---------|--------|
| Service | `backend/src/services/ai/affiliate-chat.service.ts` | **Nuevo** |
| Orchestrator | `backend/src/services/ai/index.ts` | Agregar registro |
| Skills | `backend/src/services/ai/affiliate-chat.service.ts` (inline) | 3 habilidades dentro del handler |

### API Real de Servicios Existentes

```typescript
// productRepository — verificar acceso al producto
productRepository.getProductById(id: string): Promise<Product | null>

// memoryService — búsqueda semántica sobre contenido del producto
memoryService.searchSimilar(userId, query, limit, sourceTypes?): Promise<EmbeddingSearchResult[]>

// llmService — llamada al modelo
llmService.chat({ messages, model?, temperature?, maxTokens? }): Promise<LLMResponse>
llmService.buildPrompt(systemPrompt, context, userQuestion): LLMMessage[]
// → retorna [{ role: 'system', content }, { role: 'system', content: context }, { role: 'user', content: '[USER_INPUT_START]\n...\n[USER_INPUT_END]' }]

// configService — config tiered (Redis → DB → .env → default)
configService.getBoolean(key, default?): Promise<boolean>
configService.getNumber(key, default?): Promise<number>
configService.get(key, default?): Promise<string | null>
```

### Patrón de Registro (basado en concierge.chat)

```typescript
// En backend/src/services/ai/index.ts
{
  id: 'affiliate-chat',
  name: 'AI Afiliate Chat',
  capability: 'affiliate.chat',
  description: 'Chat contextualizado sobre productos para afiliados y compradores',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'message', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => { /* validación Zod + llamada a AffiliateChatService */ }
}
```

### Skills Necesarios (dentro del handler)

| Skill | Descripción | Fuente de datos |
|-------|-------------|-----------------|
| `get_product_info` | Recupera fragmentos relevantes del contenido del producto | `memoryService.searchSimilar(userId, pregunta, 5, ['lesson', 'faq'])` |
| `get_affiliate_metrics` | Comisiones y conversiones del afiliado para ese producto (v1: stub, v2: real) | `commissionRepository` + `orderRepository` |
| `generate_promo_copy` | Genera copy para redes sociales usando el contexto del producto | `llmService.chat()` con system prompt de marketing |

### Flujo del Chat

```
Usuario (afiliado/comprador) envía mensaje + productId
    │
    ▼
POST /api/ai/affiliate/chat  ← aiChatLimiter
    │
    ▼
affiliate.chat handler
    ├── Validación Zod del input
    ├── Verificar acceso al producto (productRepository.getProductById)
    ├── Clasificar intención del mensaje (info, copy, objeciones, dudas)
    ├── get_product_info: memoryService.searchSimilar → top-5 fragmentos
    ├── llmService.buildPrompt(systemPrompt, context, userMessage)
    ├── llmService.chat()
    ├── (si aplica) generate_promo_copy: prompt especializado
    └── Retorna { response, sources? }
```

### Security

- **Prompt injection**: `sanitizeInput()` remueve caracteres de control; `defensiveFramePrompt()` wrappea user input en `<user_message>` tags; `buildPrompt()` agrega delimiters `[USER_INPUT_START]/[USER_INPUT_END]`
- **Auth**: JWT via `jwtAuthMiddleware` en la ruta; handler verifica `requestingUserId === userId`
- **Acceso al producto**: validar que el usuario compró el producto O es afiliado aprobado con link activo
- **Rate limiting**: `aiChatLimiter` (ya existe en `rateLimit.ts`)
- **Errores**: `AppError` con mensajes genéricos, sin stack traces
- **Zod**: schema de input validation, nunca `any`

## Affected Areas

| Area | Impact | Descripción |
|------|--------|-------------|
| `backend/src/services/ai/affiliate-chat.service.ts` | New | Servicio principal |
| `backend/src/services/ai/index.ts` | Modified | Registrar `affiliate.chat` capability |
| `backend/src/routes/ai.routes.ts` | Modified | Agregar endpoint `POST /api/ai/affiliate/chat` |
| `docs/project/reusable-resources.md` | Modified | Agregar `affiliateChatService` al catálogo |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Prompt injection vía productId o mensaje | Med | `sanitizeInput` + `defensiveFramePrompt` + `buildPrompt` delimiters; Zod validation en handler |
| Hallucinación sobre producto | Med | RAG con `memoryService.searchSimilar` sobre contenido real; system prompt instruye "solo responde con datos del contexto" |
| Abuso de créditos (afiliado genera copy infinito) | Alto | Rate limiting (`aiChatLimiter`) + creditService descuenta por operación |
| Afiliado sin acceso pregunta sobre producto ajeno | Bajo | Validación de acceso: compra confirmada O afiliado con link activo al producto |
| LLM timeout o no disponible | Bajo | Timeout 30s, retry 2, si falla → `AppError` genérico |

## Rollback Plan

1. Comentar el bloque de registro en `backend/src/services/ai/index.ts` (capability `affiliate.chat`)
2. Comentar la ruta en `routes/ai.routes.ts`
3. El servicio queda inactivo; sin efecto en otros capabilities
4. Deshacer con revert de commit si es necesario

## Alternatives Considered

1. **Extender ConciergeService con un parámetro `productId` opcional**: No — dominios distintos (soporte vs marketing), modelos de costo distintos (Crema paga vs usuario paga), skills distintos. Acoplar ambos en un solo servicio viola SRP.
2. **Crear un "ProductChatService" genérico para Tutor + Afiliado + QA**: No — aunque comparten RAG, los system prompts y skills son radicalmente distintos (enseñar vs vender vs responder FAQs). Cada dominio merece su agente.
3. **Skills externos en archivos separados**: No para v1 — los 3 skills son simples wrappers de servicios existentes; inline en el handler mantiene el patrón del proyecto (ver `concierge.chat` handler).

## Success Criteria

- [ ] `affiliate.chat` registrado en Orchestrator y verificable vía `skillsRegistry.listCapabilities()`
- [ ] Afiliado puede preguntar sobre un producto que promociona y recibir respuesta contextualizada
- [ ] Comprador puede preguntar sobre un producto comprado y recibir respuesta contextualizada
- [ ] Usuario sin acceso al producto recibe 403
- [ ] Input validation con Zod rechaza campos inválidos o faltantes
- [ ] Prompt injection bloqueado: delimiters en input → sanitizados o rechazados
- [ ] `pnpm tsc --noEmit` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` pasa (tests unitarios para AffiliateChatService + integración para el handler)
