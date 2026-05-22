# Proposal: SEO Optimizer

**Change**: seo-optimizer
**Type**: AI Feature
**Phase**: A (weeks 1-2)
**Date**: Mayo 2026
**PRD Ref**: PRD.md §4.12

---

## Intent

Dar al **Creador** meta tags optimizados automáticamente para las páginas de productos. La IA analiza el contenido del producto y genera: meta title, meta description, Open Graph tags, y Schema markup (JSON-LD). Esto mejora el SEO y la apariencia del producto en redes sociales sin que el creador necesite conocimientos técnicos.

> **Del PRD (§4.12):** "Genera meta tags automáticos para las páginas de productos."

## Scope

### In Scope
- `SeoOptimizerService` — nuevo servicio singleton en `services/ai/`
- Registro como capability `seo.optimizer` en Orchestrator (skillsRegistry)
- Generación de 4 tipos de meta tags: meta title, meta description, OG tags, Schema markup
- Almacenamiento en tabla `product_seo_configs` (ya definida en PRD §8.3.1)
- API endpoint `POST /api/ai/product/seo/generate`
- Input validation con Zod (nunca `any`)
- Defensa contra prompt injection (reutiliza `sanitizeInput` + delimiters)
- Rate limiting con `aiContentLimiter` (ya existe)
- Consumo de créditos AI (creador paga)

### Out of Scope
- Frontend (panel de editor SEO para el creador) — se maneja en otro SDD de frontend
- Actualización manual de meta tags — la generación es automática, no editable por v1
- A/B testing de meta tags — requiere analytics, se posterga
- Integración con Google Search Console — requiere OAuth, se posterga
- Actualización de productos externos via API — sin alcance en v1

## Capabilities

### New Capabilities
- `seo.optimizer`: Generación de meta tags SEO y Open Graph para productos

### Modified Capabilities
None — es un capability nuevo, no modifica los existentes.

## Approach

### ¿Extender ContentAssistantService o crear SeoOptimizerService?

**Crear `SeoOptimizerService` nuevo.** Aunque comparte el uso de LLM con ContentAssistantService, el dominio es distinto (SEO/meta tags vs análisis de contenido). Además:
- ContentAssistantService analiza contenido existente; SeoOptimizerService genera meta tags para presentación externa
- El Schema markup requiere formato JSON-LD específico que no tiene ContentAssistant
- Los outputs son radicalmente distintos (resumen/temas/preguntas vs meta title/OG tags)

### Ubicación del código

| Capa | Archivo | Acción |
|------|---------|--------|
| Service | `backend/src/services/ai/seo-optimizer.service.ts` | **Nuevo** |
| Repository | `backend/src/repositories/seo-config.repository.ts` | **Nuevo** |
| Orchestrator | `backend/src/services/ai/index.ts` | Agregar registro |
| Routes | `backend/src/routes/ai.routes.ts` | Agregar endpoint `POST /api/ai/product/seo/generate` |
| Schema | `backend/src/schemas/ai.schema.ts` | Agregar Zod schema |
| DB Init | `db/init/` (si se requiere) | Verificar que `product_seo_configs` ya existe en init scripts |

### API Real de Servicios Existentes

```typescript
// llmService — llamada al modelo
llmService.chat({ messages, model?, temperature?, maxTokens? }): Promise<LLMResponse>
llmService.buildPrompt(systemPrompt, context, userQuestion): LLMMessage[]

// configService — config tiered (Redis → DB → .env → default)
configService.getBoolean(key, default?): Promise<boolean>
configService.getNumber(key, default?): Promise<number>
configService.get(key, default?): Promise<string | null>

// aiCreditService — créditos AI del creador
aiCreditService.hasSufficientCredits(userId, amount): Promise<boolean>
aiCreditService.useCredits(userId, amount, description, referenceId?): Promise<void>

// productRepository — obtener contenido del producto
productRepository.getProductById(id: string): Promise<Product | null>

// memoryService — búsqueda semántica sobre contenido del producto
memoryService.searchSimilar(userId, query, limit, sourceTypes?): Promise<EmbeddingSearchResult[]>

// sanitizeInput (reutilizado de concierge/affiliate)
sanitizeInput(input: string): string
```

### Patrón de Registro (basado en affiliate-chat)

```typescript
// En backend/src/services/ai/index.ts
{
  id: 'seo-optimizer',
  name: 'SEO Optimizer',
  capability: 'seo.optimizer',
  description: 'Genera meta tags SEO y Open Graph para productos',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'productId', type: 'string', required: true },
    { name: 'language', type: 'string', required: false },
  ],
  options: { timeout: 30000, retries: 2, cacheable: false },
  handler: async (input: unknown) => { /* validación + llamada a SeoOptimizerService */ }
}
```

### Outputs del SEO Optimizer

| Output | Descripción | Límite |
|--------|-------------|--------|
| **Meta title** | Título SEO (max 60 chars) | 60 caracteres |
| **Meta description** | Descripción para meta tag (max 160 chars) | 160 caracteres |
| **OG title** | Título para Open Graph | 70 caracteres |
| **OG description** | Descripción para Open Graph | 160 caracteres |
| **OG image URL** | Imagen sugerida (opcional, usa thumbnail del producto) | URL |
| **Schema markup** | JSON-LD para Rich Snippets | JSON válido |
| **Keywords** | Array de keywords relevantes | 10 keywords |
| **Canonical URL** | URL canónica del producto | URL |

### Flujo de Generación

```
Creador solicita generación de SEO para productId
    │
    ▼
POST /api/ai/product/seo/generate  ← aiContentLimiter (reutilizado)
    │
    ▼
seo.optimizer handler
    ├── Validación Zod del input
    ├── Verificar propiedad del producto (productRepository)
    ├── Verificar créditos suficientes (aiCreditService)
    ├── Obtener contenido del producto (productRepository + memoryService)
    ├── Generar prompts SEO con system prompt especializado
    ├── llmService.chat() → generar todos los meta tags
    ├── Parsear respuesta JSON
    ├── Guardar en product_seo_configs (upsert)
    └── Retornar { metaTitle, metaDescription, ogTags, schemaMarkup, keywords }
```

### Schema Markup (JSON-LD) para Productos

```json
{
  "@context": "https://schema.org/",
  "@type": "Product",
  "name": "[product_name]",
  "description": "[meta_description]",
  "image": "[product_image_url]",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "ARS",
    "price": "[product_price]",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[avg_rating]",
    "reviewCount": "[total_reviews]"
  }
}
```

### Security

- **Prompt injection**: `sanitizeInput()` remueve caracteres de control; delimiters `[USER_INPUT_START]/[USER_INPUT_END]` en buildPrompt
- **Auth**: JWT via `jwtAuthMiddleware` en la ruta
- **Producto ownership**: Validar que `requestingUserId === userId` y el usuario es dueño del producto
- **Rate limiting**: `aiContentLimiter` (ya existe)
- **Errores**: `AppError` con mensajes genéricos, sin stack traces
- **Zod**: schema de input validation, nunca `any`

## Affected Areas

| Area | Impact | Descripción |
|------|--------|-------------|
| `backend/src/services/ai/seo-optimizer.service.ts` | New | Servicio principal de generación SEO |
| `backend/src/repositories/seo-config.repository.ts` | New | Repository para `product_seo_configs` |
| `backend/src/services/ai/index.ts` | Modified | Registrar `seo.optimizer` capability |
| `backend/src/routes/ai.routes.ts` | Modified | Agregar endpoint `POST /api/ai/product/seo/generate` |
| `backend/src/schemas/ai.schema.ts` | Modified | Agregar Zod schema para SEO request/response |
| `db/init/` | Verified | Verificar que `product_seo_configs` ya existe |
| `docs/project/reusable-resources.md` | Modified | Agregar `seoOptimizerService` al catálogo |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Meta tags genéricos sin contexto real del producto | Alto | Usar `memoryService.searchSimilar` para recuperar contenido relevante; system prompt instruye "basado únicamente en el contenido proporcionado" |
| JSON-LD mal formado | Medio | Parsear respuesta y validar con schema Zod antes de guardar; si falla, retornar error al usuario |
| LLM timeout o no disponible | Bajo | Timeout 30s, retry 2, si falla → `AppError` genérico |
| Abuso de créditos (generación múltiple) | Medio | Rate limiting (`aiContentLimiter`) + creditService descuenta por operación |
| Título/descripción demasiado largos para SEO | Alto | Validación post-generación con límites estrictos (60/160 chars) + truncate si necesario |

## Rollback Plan

1. Comentar el bloque de registro en `backend/src/services/ai/index.ts` (capability `seo.optimizer`)
2. Comentar la ruta en `routes/ai.routes.ts`
3. El servicio queda inactivo; sin efecto en otros capabilities
4. La tabla `product_seo_configs` permanece (no se borra en rollback; es harmless)
5. Deshacer con revert de commit si es necesario

## Alternatives Considered

1. **Extender ContentAssistantService con un nuevo `analysisType: 'seo'`**: No — dominios distintos (resumen/temas vs meta tags), outputs estructurales distintos, y el Schema markup JSON-LD requiere lógica especializada que no tiene ContentAssistant.
2. **Generar meta tags sin RAG (solo del título y descripción del producto)**: No — los meta tags de calidad requieren contexto del contenido real del producto, no solo metadatos. Sin RAG, los outputs serán genéricos.
3. **Permitir edición manual de meta tags**: Postergado — v1 genera automáticamente. La edición manual requiere frontend de editor SEO que está fuera del scope.
4. **Integrar con Google Search Console para sugerencias**: Postergado — requiere OAuth y API de GSC, complejidad adicional innecesaria para v1.

## Success Criteria

- [ ] `seo.optimizer` registrado en Orchestrator y verificable vía `skillsRegistry.listCapabilities()`
- [ ] Creador puede generar meta tags para un producto que posee y recibe respuesta válida
- [ ] Meta title generado tiene máximo 60 caracteres
- [ ] Meta description generada tiene máximo 160 caracteres
- [ ] OG tags incluyen title, description, e image
- [ ] Schema markup es JSON válido y cumple con schema.org/Product
- [ ] Keywords contiene máximo 10 keywords relevantes
- [ ] `pnpm tsc --noEmit` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` pasa (tests unitarios para SeoOptimizerService + integración para el handler)