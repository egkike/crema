# Proposal: AI Insights Expansion

**Change**: ai-insights-expansion
**Type**: AI Feature
**Phase**: A (weeks 1-2)
**Date**: Mayo 2026
**PRD Ref**: PRD.md §4.8

---

## Problem Statement

`insightsService` currently provides dashboards CRUD and NL→SQL query/streaming. However, the PRD §4.8 mandates three additional capabilities that are absent:

1. **Churn Prediction** — El creador no puede identificar alumnos en riesgo de abandono antes de que ocurra.
2. **Recovery Email Generation** — No existe generación automática de emails personalizados para recuperar alumnos en riesgo.
3. **A/B Comparatives** — El creador no puede comparar métricas entre períodos o productos sin formular manualmente múltiples consultas.

Sin estas capacidades, el creador reacciona a los abandonos en lugar de prevenirlos, y carece de herramientas de análisis comparativo que son estándar en plataformas competidoras.

---

## Intent

Expandir `insightsService` con tres capacidades net-new, reutilizando la infraestructura existente (LLM, credits, pool, schemas) y extendiendo el patrón de servicio singleton sin crear nuevos servicios:

| Capability | Registro Orchestrator | Endpoint REST |
|---|---|---|
| `insights.predict` | `insights-predict` | `POST /api/ai/insights/predict/churn` |
| `insights.compare` | `insights-compare` | `POST /api/ai/insights/compare` |
| `insights.recover` | `insights-recover` | `POST /api/ai/insights/recover/email` |

Cada capability consume créditos AI, está protegida por JWT + rate limiting, y utiliza Zod para validación de input.

---

## Scope

### In Scope

#### 1. Churn Prediction (`insights.predict`)

- Analizar datos históricos de actividad de alumnos (órdenes, acceso a productos, engagement)
- Calcular probabilidad de churn por alumno usando heurísticas + LLM reasoning
- Output: ranking de alumnos en riesgo con score 0-100%, factores de riesgo identificados, recomendación de acción
- Persistencia: tabla `churn_predictions` con historial de predicciones por creator_id
- Rate limiter: `churnPredictionLimiter` (5 req/min, operación costosa)

#### 2. Recovery Email Generation (`insights.recover`)

- Generar email personalizado basado en datos reales del alumno (progreso en el curso, último acceso, interacciones)
- Prompt incluye: nombre del alumno, producto, progreso %, días desde último acceso, factores de riesgo
- Output: subject + body HTML del email, tono configurable (empático/directo/motivacional)
- **No envía el email** — solo genera el contenido; el envío es responsabilidad del creador o de un futuro servicio de notificaciones
- Persistencia: tabla `recovery_emails` con historial de generaciones
- Rate limiter: `recoveryEmailLimiter` (10 req/min)

#### 3. A/B Comparatives (`insights.compare`)

- Comparar métricas entre dos entidades del mismo tipo:
  - Período A vs Período B (este mes vs mes anterior, Q1 vs Q2)
  - Producto A vs Producto B (ventas, conversión, reviews)
- Input: `entityType` (period/product), `entityA`, `entityB`, `metrics[]` (revenue, sales, conversion, engagement, reviews)
- LLM genera SQL para cada entidad, ejecuta ambos, y genera análisis comparativo en lenguaje natural
- Output: datos crudos de ambas entidades + insight narrativo + delta porcentual + recomendación
- Reutiliza el pipeline NL→SQL existente (`validateGeneratedSQL` + ejecución segura)
- Rate limiter: `compareLimiter` (10 req/min)

#### 4. Infraestructura Compartida

- Nuevas tablas en `db/init/05-ai-tables.sql`: `churn_predictions`, `recovery_emails`
- Nuevas capabilities en `backend/src/services/ai/index.ts`: `insights.predict`, `insights.compare`, `insights.recover`
- Nuevos schemas Zod en `backend/src/schemas/ai.schema.ts`
- Rate limiters dedicados en `backend/src/middlewares/rateLimit/rateLimit.ts`
- Unit tests (Vitest) para los tres nuevos métodos de `insightsService`
- Integration tests (Supertest) para los tres nuevos endpoints

### Out of Scope

- Envío automático de emails de recuperación (solo generación de contenido)
- Frontend de visualización de churn (panel en frontend-admin — SDD separado)
- Modelo ML real para churn (v1 usa heurísticas + LLM reasoning; v2 podría usar ML)
- Predicción a nivel de cohorte (solo alumno individual en v1)
- Comparativas con benchmarks externos (solo datos propios del creador)
- Streaming SSE para predict/compare/recover (solo necesario para NL→SQL queries largas)

---

## Capabilities

### New Capabilities

| Capability ID | Name | Description | Credits Cost |
|---|---|---|---|
| `insights.predict` | Churn Prediction | Predice probabilidad de abandono por alumno usando datos históricos + LLM | 5 créditos |
| `insights.compare` | A/B Comparatives | Compara métricas entre dos períodos o productos con insight narrativo | 3 créditos |
| `insights.recover` | Recovery Email Generator | Genera email personalizado para recuperar alumno en riesgo | 3 créditos |

### Modified Capabilities

None — las capabilities existentes (`insights.ask`, `insights.stream`) no se modifican. Los nuevos métodos se agregan al singleton `insightsService` existente.

---

## Approach

### ¿Extender `insightsService` o crear servicios separados?

**Extender `insightsService`.** Las tres capabilities comparten:
- El mismo dominio (analytics/insights para creadores)
- La misma infraestructura (`pool`, `getValidatedSchema()`, `aiCreditService`, `llmService`)
- El mismo patrón de autorización (creator ownership)
- La misma tabla de historial (`insights_history`) para auditoría

Crear servicios separados (`churnPredictionService`, `recoveryEmailService`, `compareService`) introduciría duplicación de:
- Validación de schema (`getValidatedSchema()`)
- Conexión a pool
- Manejo de créditos
- Logging y error handling
- Patrón de autorización

**Trade-off**: `insightsService` crece de ~300 líneas a ~700 líneas. Pero el código está organizado por método (cada capability es un método con su propia validación, prompt engineering, y ejecución), manteniendo cohesión sin necesidad de split prematuro.

### Decisiones de Diseño

| Decisión | Elección | Justificación |
|---|---|---|
| Heurísticas vs ML para churn | Heurísticas + LLM reasoning | v1 no tiene suficiente volumen de datos para ML; heurísticas (días desde último acceso, progreso, interacciones) + LLM para narrativa es suficiente para MVP |
| Generación vs envío de emails | Solo generación | Responsabilidad del creador enviar el email; futura integración con NotificationService |
| LLM vs SQL-only para comparativas | LLM genera SQL + insight narrativo | Reutiliza el pipeline NL→SQL existente; el LLM aporta el análisis narrativo que SQL solo no puede dar |
| Tablas nuevas vs JSON en `insights_history` | Tablas dedicadas (`churn_predictions`, `recovery_emails`) | Datos estructurados requieren queries; JSON en `insights_history` no permite filtrar por alumno, score, o fecha eficientemente |

### Ubicación del Código

| Capa | Archivo | Acción |
|------|---------|--------|
| Service | `backend/src/services/ai/agents.service.ts` | **Modify** — Agregar métodos `predictChurn`, `generateRecoveryEmail`, `compareEntities` |
| Orchestrator | `backend/src/services/ai/index.ts` | **Modify** — Agregar registros `insights-predict`, `insights-compare`, `insights-recover` |
| Routes | `backend/src/routes/ai.routes.ts` | **Modify** — Agregar endpoints `POST /insights/predict/churn`, `POST /insights/compare`, `POST /insights/recover/email` |
| Schema | `backend/src/schemas/ai.schema.ts` | **Modify** — Agregar `churnPredictionSchema`, `compareSchema`, `recoveryEmailSchema` |
| Rate Limit | `backend/src/middlewares/rateLimit/rateLimit.ts` | **Modify** — Agregar `churnPredictionLimiter`, `compareLimiter`, `recoveryEmailLimiter` |
| DB Init | `backend/db/init/05-ai-tables.sql` | **Modify** — Agregar `churn_predictions`, `recovery_emails` |
| Types | `backend/src/types/ai.types.ts` (o nuevo) | **Possibly modify** — Interfaces `ChurnPrediction`, `RecoveryEmail`, `CompareResult` |
| Tests | `backend/src/__tests__/ai/agents.service.test.ts` | **Modify** — Agregar tests para nuevos métodos |
| Tests | `backend/src/__tests__/ai/ai-boot.test.ts` | **Modify** — Agregar tests de validación de handlers |

### API Real de Servicios Existentes (reutilizados)

```typescript
// llmService
llmService.chat({ messages, temperature?, maxTokens? }): Promise<LLMResponse>
llmService.buildPrompt(systemPrompt, context, userQuestion): LLMMessage[]

// aiCreditService
aiCreditService.getOperationCost(operation: string): number
aiCreditService.getBalance(userId: string): Promise<{ balance: number } | null>
aiCreditService.useCredits(userId: string, amount: number, description: string): Promise<void>

// pool (pg)
pool.query(sql: string, params?: unknown[]): Promise<QueryResult>

// getValidatedSchema()
getValidatedSchema(): string // retorna el schema validado (ej. 'crema')

// validateGeneratedSQL(sql: string): { valid: boolean; reason?: string }
// (ya existente en agents.service.ts)

// insightsService (existente)
insightsService.getDashboards(userId): Promise<...>
insightsService.query(userId, query): Promise<...>
insightsService.chatStream(userId, query, onChunk, signal?): Promise<...>
```

### Flujo: Churn Prediction

```
Creador solicita predicción de churn para productId
    │
    ▼
POST /api/ai/insights/predict/churn  ← churnPredictionLimiter (5 req/min)
    │
    ▼
insights.predict handler
    ├── Zod validation (productId requerido, threshold opcional)
    ├── Verificar que el usuario es creator del producto (productRepository)
    ├── Verificar créditos (aiCreditService, 5 créditos)
    ├── Ejecutar queries de datos (orders, user access, engagement):
    │   ├── Alumnos del producto con última actividad y progreso
    │   ├── Días desde último acceso por alumno
    │   └── Interacciones (Q&A, reviews) por alumno
    ├── Calcular score de churn por heurística:
    │   ├── días_sin_acceso > 30 → +40% riesgo
    │   ├── progreso < 20% y días_sin_acceso > 14 → +30%
    │   ├── sin_interacciones en 60 días → +20%
    │   └── score = min(100, suma de factores)
    ├── LLM: generar narrativa y factores de riesgo por alumno
    ├── Guardar en churn_predictions
    ├── Descontar créditos
    └── Retornar { predictions: [{ userId, userName, churnScore, riskFactors, narrative, recommendedAction }] }
```

### Flujo: Recovery Email Generation

```
Creador solicita email de recuperación para alumno específico
    │
    ▼
POST /api/ai/insights/recover/email  ← recoveryEmailLimiter (10 req/min)
    │
    ▼
insights.recover handler
    ├── Zod validation (productId, targetUserId, tone opcional)
    ├── Verificar que el usuario es creator del producto
    ├── Verificar créditos (aiCreditService, 3 créditos)
    ├── Obtener datos del alumno:
    │   ├── Nombre, email (users table)
    │   ├── Progreso en el curso (user_progress o similar)
    │   ├── Último acceso
    │   └── Historial de interacciones
    ├── LLM: generar email personalizado
    │   ├── System prompt: "Eres un creador de cursos que quiere recuperar un alumno"
    │   ├── Context: datos reales del alumno + tono
    │   └── Output: { subject, bodyHtml, previewText }
    ├── Sanitizar HTML output (prevenir XSS en el body)
    ├── Guardar en recovery_emails
    ├── Descontar créditos
    └── Retornar { email: { subject, bodyHtml, previewText }, studentName, productName }
```

### Flujo: A/B Comparatives

```
Creador solicita comparativa (períodos o productos)
    │
    ▼
POST /api/ai/insights/compare  ← compareLimiter (10 req/min)
    │
    ▼
insights.compare handler
    ├── Zod validation (entityType, entityA, entityB, metrics[])
    ├── Verificar créditos (aiCreditService, 3 créditos)
    ├── Validar entityType ∈ { 'period', 'product' }
    ├── Para cada entidad (A y B):
    │   ├── Construir prompt NL→SQL específico
    │   ├── LLM genera SQL para las métricas solicitadas
    │   ├── Validar SQL con validateGeneratedSQL()
    │   ├── Ejecutar query
    │   └── Almacenar resultados
    ├── LLM: generar análisis comparativo
    │   ├── Input: resultados de A, resultados de B, métricas solicitadas
    │   ├── Output: { narrative, deltas: { metric: { a, b, delta, deltaPercent } }, recommendation }
    ├── Guardar en insights_history (ambas queries + resultados)
    ├── Descontar créditos
    └── Retornar { entityA: { label, data }, entityB: { label, data }, narrative, deltas, recommendation }
```

### Modelo de Datos (Nuevas Tablas)

```sql
-- 7.5 Churn Predictions Table
CREATE TABLE IF NOT EXISTS churn_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    churn_score INTEGER NOT NULL CHECK (churn_score >= 0 AND churn_score <= 100),
    risk_factors JSONB NOT NULL DEFAULT '[]',
    narrative TEXT,
    recommended_action TEXT,
    data_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_churn_predictions_creator ON churn_predictions(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_predictions_product ON churn_predictions(product_id);
CREATE INDEX IF NOT EXISTS idx_churn_predictions_target ON churn_predictions(target_user_id);

-- 7.6 Recovery Emails Table
CREATE TABLE IF NOT EXISTS recovery_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    preview_text VARCHAR(150),
    tone VARCHAR(20) NOT NULL DEFAULT 'empathic' CHECK (tone IN ('empathic', 'direct', 'motivational')),
    churn_prediction_id UUID REFERENCES churn_predictions(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recovery_emails_creator ON recovery_emails(creator_id, created_at DESC);
```

### Heurísticas de Churn (v1)

| Factor | Condición | Peso |
|---|---|---|
| Inactividad prolongada | Último acceso > 30 días | +40% |
| Bajo progreso + inactividad | Progreso < 20% Y último acceso > 14 días | +30% |
| Sin interacciones | Sin Q&A ni reviews en 60 días | +20% |
| Acceso frecuente sin progreso | Accesos > 10 en 7 días pero progreso < 10% | +10% |

Score total = `min(100, suma de factores)`. El LLM agrega narrativa cualitativa basada en los datos del alumno.

### Security

- **Auth**: JWT via `jwtAuthMiddleware` en todas las rutas
- **Authorization**: Verificar que el usuario es creator del producto (churn y recovery) o dueño de los datos (compare)
- **Rate limiting**: Dedicado por endpoint: 5 req/min (churn, costoso), 10 req/min (compare, recovery)
- **Input validation**: Zod schemas con tipos estrictos, nunca `any`
- **SQL injection**: `validateGeneratedSQL()` + reemplazo de caracteres nulos + sanitización de límites (mismo pipeline que `insightsService.query`)
- **XSS en email recovery**: Sanitizar HTML generado por LLM antes de retornar (DOMPurify o similar)
- **Prompt injection**: `buildPrompt()` con delimiters `[USER_INPUT_START]/[USER_INPUT_END]`
- **Errores**: `AppError` con mensajes genéricos, sin stack traces en producción

### Observabilidad

- `logger.info` al inicio de cada operación (userId, operation, params sanitizados)
- `logger.warn` en validaciones fallidas (SQL validation, créditos insuficientes)
- `logger.error` en fallos de LLM o DB con contexto (sin datos sensibles)

---

## Affected Areas

| Area | Impact | Descripción |
|------|--------|-------------|
| `backend/src/services/ai/agents.service.ts` | **Modified** | Agregar `predictChurn`, `generateRecoveryEmail`, `compareEntities` al singleton `insightsService` |
| `backend/src/services/ai/index.ts` | **Modified** | Registrar 3 capabilities: `insights.predict`, `insights.compare`, `insights.recover` |
| `backend/src/routes/ai.routes.ts` | **Modified** | Agregar 3 endpoints REST |
| `backend/src/schemas/ai.schema.ts` | **Modified** | Agregar `churnPredictionSchema`, `compareSchema`, `recoveryEmailSchema` |
| `backend/src/middlewares/rateLimit/rateLimit.ts` | **Modified** | Agregar `churnPredictionLimiter`, `compareLimiter`, `recoveryEmailLimiter` |
| `backend/db/init/05-ai-tables.sql` | **Modified** | Agregar `churn_predictions`, `recovery_emails` (secciones 7.5, 7.6) |
| `backend/src/types/ai.types.ts` | **Possibly Modified** | Interfaces para ChurnPrediction, RecoveryEmail, CompareResult |
| `backend/src/__tests__/ai/agents.service.test.ts` | **Modified** | Tests unitarios para nuevos métodos |
| `backend/src/__tests__/ai/ai-boot.test.ts` | **Modified** | Tests de validación de handlers nuevos |
| `docs/project/reusable-resources.md` | **Modified** | Actualizar `insightsService` descripción + §10 Init Script Inventory |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Predicciones de churn inexactas por falta de datos históricos | Alto | Medio | Heurísticas marcan "baja confianza" si < 30 días de datos. Transparencia: el score incluye confidence level |
| LLM genera email con tono inapropiado o contenido no alineado con la marca | Medio | Alto | System prompt restrictivo + validación post-generación; el creador revisa antes de enviar |
| Comparativas lentas (2 queries SQL + LLM narration) | Bajo | Medio | Timeout 30s; queries secuenciales optimizadas; si una entidad falla, retornar parcial |
| Abuso de créditos (múltiples predicciones para el mismo producto) | Medio | Bajo | Rate limiting + costo en créditos (5 por churn); cache de predicciones < 24h |
| SQL injection en queries generadas para comparativas | Bajo | Crítico | Reutilizar `validateGeneratedSQL()` existente + sanitización probada |
| Email HTML contiene XSS del LLM | Bajo | Alto | Sanitización HTML server-side antes de retornar; strip de <script>, onclick, etc. |
| `insightsService` crece demasiado (~700 líneas) | Medio | Bajo | Métodos autocontenidos con responsabilidad única; split futuro si supera 1000 líneas o 8 métodos |

---

## Rollback Plan

1. Comentar los 3 registros de capability en `backend/src/services/ai/index.ts` (ids: `insights-predict`, `insights-compare`, `insights-recover`)
2. Comentar los 3 endpoints en `routes/ai.routes.ts`
3. Las capabilities quedan inactivas; sin efecto en `insights.ask` ni `insights.stream` existentes
4. Las tablas `churn_predictions` y `recovery_emails` permanecen (no se borran en rollback; son harmless)
5. Rate limiters quedan definidos pero sin uso (sin impacto)
6. Deshacer con revert de commit si es necesario

---

## Alternatives Considered

1. **Crear `churnPredictionService`, `recoveryEmailService`, `compareService` como servicios separados**: No — comparten el mismo dominio (insights analytics), misma infraestructura (pool, credits, schema), y mismo patrón de autorización. La duplicación supera los beneficios de separación en este punto.
2. **Usar modelo ML (Random Forest/XGBoost) para churn**: No para v1 — requiere volumen de datos que no existe aún, infraestructura de entrenamiento, y mantenimiento de modelos. Las heurísticas + LLM son suficientes para MVP y pueden calibrarse.
3. **Integrar con servicio de email (SendGrid/Mailgun) para envío automático**: Postergado — v1 solo genera el contenido. El envío requiere consentimiento del creador, templates de email, y manejo de bounces. Futuro SDD de NotificationService.
4. **Comparativas usando solo SQL sin LLM**: No — SQL puede calcular deltas pero no puede generar narrativa cualitativa ("las ventas bajaron porque el producto B tuvo un 40% menos de reviews positivas"). El LLM aporta el valor diferencial.
5. **Un solo endpoint genérico con `action` parameter**: No — viola REST principles y complica rate limiting, validación, y documentación. Endpoints separados son más mantenibles.

---

## Success Criteria

- [ ] `insights.predict`, `insights.compare`, `insights.recover` registrados en Orchestrator y verificables vía `skillsRegistry.listCapabilities()`
- [ ] Creador puede solicitar predicción de churn para un producto y recibe ranking de alumnos con score + factores
- [ ] Score de churn es 0-100% con breakdown de factores contribuyentes
- [ ] Creador puede generar email de recuperación personalizado para un alumno específico
- [ ] Email generado incluye subject, body HTML válido, y preview text
- [ ] Creador puede comparar dos períodos o dos productos y recibe insight narrativo + deltas numéricos
- [ ] Comparativa incluye delta porcentual por métrica y recomendación accionable
- [ ] Rate limiters dedicados funcionan (churn: 5/min, compare: 10/min, recovery: 10/min)
- [ ] Créditos AI se descuentan correctamente por operación (predict: 5, compare: 3, recover: 3)
- [ ] Tablas `churn_predictions` y `recovery_emails` creadas con índices
- [ ] `pnpm tsc --noEmit` pasa
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` pasa (unit tests para métodos + integration tests para endpoints)
- [ ] No hay regresiones en `insights.ask`, `insights.stream`, ni dashboards CRUD

---

## References

- PRD: `docs/project/ai-features/PRD.md` §4.8
- Technical Spec: `docs/project/ai-features/TECHNICAL-SPEC.md` §3.3
- Current implementation: `backend/src/services/ai/agents.service.ts` (insightsService, lines ~927-1490)
- Current routes: `backend/src/routes/ai.routes.ts` (insights endpoints, lines ~1864-2080)
- DB init: `backend/db/init/05-ai-tables.sql` (tables 7.1-7.4, need 7.5-7.6)
- Orchestrator registration: `backend/src/services/ai/index.ts` (skill `insights-ask`, line ~658)
- Existing schemas: `backend/src/schemas/ai.schema.ts` (createDashboardSchema, updateDashboardSchema, insightsQuerySchema)
- Reusable resources: `docs/project/reusable-resources.md` §3 (AI Services), §10 (Init Script Inventory)
- OpenSpec config: `openspec/config.yaml` (strict_tdd: true, vitest runner)
