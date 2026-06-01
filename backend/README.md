# Crema API Core 🍦

**Crema** es el motor de infraestructura para la economía de los creadores, permitiendo la comercialización, protección y escalabilidad de info-productos bajo normativas de transparencia financiera.

[![Node](https://img.shields.io/badge/node-20+-blue)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-orange)](https://pnpm.io/)
[![Database](https://img.shields.io/badge/PostgreSQL-18-blue)](https://www.postgresql.org/)
[![VectorDB](https://img.shields.io/badge/pgvector-0.8-blue)](https://github.com/pgvector/pgvector)
[![Queue](https://img.shields.io/badge/BullMQ-Redis-red)](https://docs.bullmq.io/)
[![AI](https://img.shields.io/badge/OpenAI-GPT--4-orange)](https://openai.com/)
[![LEC](https://img.shields.io/badge/Ley_Economía_del_Conocimiento-Cumplimiento-green)](https://www.argentina.gob.ar/servicio/acceder-los-beneficios-del-regimen-de-promocion-de-la-economia-del-conocimiento)

---

## 🚀 Endpoints de la API

### Autenticación

| Método | Endpoint                    | Descripción            |
| ------ | --------------------------- | ---------------------- |
| POST   | `/api/auth/register`        | Registro de usuario    |
| POST   | `/api/auth/login`           | Inicio de sesión       |
| POST   | `/api/auth/refresh`         | Refresh tokens         |
| POST   | `/api/auth/logout`          | Cerrar sesión          |
| POST   | `/api/auth/forgot-password` | Solicitar recuperación |
| POST   | `/api/auth/reset-password`  | Resetear contraseña    |
| POST   | `/api/auth/2fa/setup`       | Configurar 2FA         |
| POST   | `/api/auth/2fa/verify`      | Verificar 2FA          |
| GET    | `/api/auth/sessions`        | Ver sesiones activas   |

### Usuarios

| Método | Endpoint        | Descripción        |
| ------ | --------------- | ------------------ |
| GET    | `/api/users/me` | Perfil del usuario |
| PATCH  | `/api/users/me` | Actualizar perfil  |
| DELETE | `/api/users/me` | Eliminar cuenta    |

### Productos

| Método | Endpoint                        | Descripción         |
| ------ | ------------------------------- | ------------------- |
| GET    | `/api/products/:id`             | Ver producto        |
| POST   | `/api/products/create`          | Crear producto      |
| PATCH  | `/api/products/:id`             | Actualizar producto |
| DELETE | `/api/products/:id`             | Eliminar producto   |
| GET    | `/api/products/my-products`     | Productos propios   |
| POST   | `/api/products/validate-coupon` | Validar cupón       |

### Pagos

| Método | Endpoint                          | Descripción       |
| ------ | --------------------------------- | ----------------- |
| POST   | `/api/payments/checkout/create`   | Crear preferencia |
| POST   | `/api/payments/webhook/:gateway`  | Webhook de pago   |
| POST   | `/api/payments/subscribe/:planId` | Suscribirse       |

### Learning (LMS)

| Método | Endpoint                                 | Descripción              |
| ------ | ---------------------------------------- | ------------------------ |
| GET    | `/api/learning/my-dashboard`             | Dashboard del estudiante |
| GET    | `/api/learning/:productId/content`       | Contenido del curso      |
| POST   | `/api/learning/progress`                 | Actualizar progreso      |
| POST   | `/api/learning/quiz/submit`              | Enviar quiz              |
| GET    | `/api/learning/certificate/verify/:code` | Verificar certificado    |

### Balance

| Método | Endpoint                | Descripción  |
| ------ | ----------------------- | ------------ |
| GET    | `/api/balances/me`      | Mi balance   |
| GET    | `/api/balances/stats`   | Estadísticas |
| GET    | `/api/balances/history` | Historial    |

### Payouts

| Método | Endpoint           | Descripción      |
| ------ | ------------------ | ---------------- |
| POST   | `/api/payouts`     | Solicitar retiro |
| GET    | `/api/payouts/me`  | Mis retiros      |
| DELETE | `/api/payouts/:id` | Cancelar retiro  |

### Afiliados

| Método | Endpoint                             | Descripción        |
| ------ | ------------------------------------ | ------------------ |
| GET    | `/api/affiliates/my-portfolio`       | Mi portfolio       |
| POST   | `/api/affiliates/portfolio/:id/join` | Unirse a programa  |
| DELETE | `/api/affiliates/portfolio/:id`      | Abandonar programa |

### Admin

| Método | Endpoint                           | Descripción      |
| ------ | ---------------------------------- | ---------------- |
| GET    | `/api/admin/financial-health`      | Salud financiera |
| GET    | `/api/admin/ledger`                | Libro mayor      |
| GET    | `/api/admin/lec/compliance-status` | Estado LEC       |
| GET    | `/api/admin/export/tax-report`     | Reporte fiscal   |

### AI Features ⭐ (v1.3)

#### Créditos

| Método | Endpoint                       | Descripción                |
| ------ | ------------------------------ | -------------------------- |
| GET    | `/api/ai/credits`              | Mi saldo de créditos       |
| GET    | `/api/ai/credits/packages`     | Paquetes disponibles       |
| POST   | `/api/ai/credits/purchase`     | Comprar créditos           |
| GET    | `/api/ai/credits/transactions` | Historial de transacciones |

#### Embeddings (Memory)

| Método | Endpoint                                   | Descripción        |
| ------ | ------------------------------------------ | ------------------ |
| POST   | `/api/ai/embeddings`                       | Crear embedding    |
| GET    | `/api/ai/embeddings/search`                | Búsqueda semántica |
| DELETE | `/api/ai/embeddings/:sourceType/:sourceId` | Eliminar embedding |

#### Q&A

| Método | Endpoint                                | Descripción        |
| ------ | --------------------------------------- | ------------------ |
| GET    | `/api/ai/products/:productId/questions` | Ver preguntas      |
| POST   | `/api/ai/products/:productId/questions` | Hacer pregunta     |
| PUT    | `/api/ai/questions/:questionId/answer`  | Responder pregunta |
| PUT    | `/api/ai/questions/:questionId/publish` | Publicar/ocultar   |
| DELETE | `/api/ai/questions/:questionId`         | Eliminar pregunta  |
| POST   | `/api/ai/questions/:questionId/vote`    | Votar pregunta     |

#### FAQs

| Método | Endpoint                                   | Descripción    |
| ------ | ------------------------------------------ | -------------- |
| GET    | `/api/ai/products/:productId/faqs`         | Ver FAQs       |
| POST   | `/api/ai/products/:productId/faqs`         | Crear FAQ      |
| PUT    | `/api/ai/faqs/:faqId`                      | Actualizar FAQ |
| DELETE | `/api/ai/faqs/:faqId`                      | Eliminar FAQ   |
| PUT    | `/api/ai/products/:productId/faqs/reorder` | Reordenar FAQs |

#### Reviews

| Método | Endpoint                                           | Descripción          |
| ------ | -------------------------------------------------- | -------------------- |
| GET    | `/api/ai/products/:productId/reviews`              | Ver reviews          |
| POST   | `/api/ai/products/:productId/reviews`              | Crear review         |
| PUT    | `/api/ai/reviews/:reviewId`                        | Actualizar review    |
| DELETE | `/api/ai/reviews/:reviewId`                        | Eliminar review      |
| POST   | `/api/ai/reviews/:reviewId/vote`                   | Votar review         |
| GET    | `/api/ai/products/:productId/reviews/settings`     | Configuración        |
| PUT    | `/api/ai/products/:productId/reviews/settings`     | Actualizar config    |
| GET    | `/api/ai/products/:productId/reviews/distribution` | Distribución ratings |

#### Denunciations (Reports Agent)

| Método | Endpoint                            | Descripción              |
| ------ | ----------------------------------- | ------------------------ |
| GET    | `/api/ai/reports/reasons`           | Motivos de denuncia      |
| POST   | `/api/ai/reports`                   | Crear denuncia           |
| GET    | `/api/ai/reports`                   | Listar denuncias (admin) |
| GET    | `/api/ai/reports/:reportId`         | Ver denuncia             |
| PUT    | `/api/ai/reports/:reportId/resolve` | Resolver denuncia        |
| POST   | `/api/ai/reports/:reportId/actions` | Aplicar acción           |
| GET    | `/api/ai/content/policies`          | Políticas de contenido   |

#### AI Agents

| Método | Endpoint                                      | Descripción        |
| ------ | --------------------------------------------- | ------------------ |
| GET    | `/api/ai/products/:productId/qa-agent/config` | Ver config         |
| PUT    | `/api/ai/products/:productId/qa-agent/config` | Actualizar config  |
| POST   | `/api/ai/agents/qa/chat`                      | Chatear con agente |
| GET    | `/api/ai/agents/conversations`                | Mis conversaciones |
| GET    | `/api/ai/agents/conversations/:id`            | Ver conversación   |

#### AI Content Assistant

| Método | Endpoint                     | Descripción             |
| ------ | ---------------------------- | ----------------------- |
| POST   | `/api/ai/content/analyze`    | Analizar contenido      |
| POST   | `/api/ai/content/summary`    | Resumir contenido       |
| POST   | `/api/ai/content/quiz`       | Generar quiz            |
| POST   | `/api/ai/content/topics`     | Extraer tópicos         |
| POST   | `/api/ai/content/transcribe` | Transcribir audio/video |

#### AI Affiliate Chat

| Método | Endpoint                 | Descripción                           |
| ------ | ------------------------ | ------------------------------------- |
| POST   | `/api/ai/affiliate/chat` | Chat contextual (2 créditos/consulta) |

#### AI Support (Concierge)

| Método | Endpoint               | Descripción                    |
| ------ | ---------------------- | ------------------------------ |
| POST   | `/api/ai/support/chat` | Soporte técnico con escalación |

#### Analytics

| Método | Endpoint                      | Descripción            |
| ------ | ----------------------------- | ---------------------- |
| GET    | `/api/ai/analytics/dashboard` | Métricas del dashboard |

#### Tutor + Insights

| Método | Endpoint                                     | Descripción          |
| ------ | -------------------------------------------- | -------------------- |
| GET    | `/api/ai/products/:productId/tutor/config`   | Ver config Tutor     |
| PUT    | `/api/ai/products/:productId/tutor/config`   | Actualizar config    |
| GET    | `/api/ai/products/:productId/tutor/insights` | Ver insights         |
| GET    | `/api/ai/insights/dashboards`                | Mis dashboards       |
| POST   | `/api/ai/insights/dashboards`                | Crear dashboard      |
| PUT    | `/api/ai/insights/dashboards/:id`            | Actualizar dashboard |
| DELETE | `/api/ai/insights/dashboards/:id`            | Eliminar dashboard   |
| POST   | `/api/ai/insights/query`                     | Query con IA         |
| POST   | `/api/ai/insights/predict/churn`             | Predicción de churn  |
| POST   | `/api/ai/insights/compare`                   | Comparativa A/B      |
| POST   | `/api/ai/insights/recover/email`             | Generar email recuperación |

#### Interactive Agent (Talleres Dinámicos)

| Método | Endpoint                                         | Descripción                 |
| ------ | ------------------------------------------------ | --------------------------- |
| GET    | `/api/interactive/fields/:productId`             | Ver campos configurados     |
| POST   | `/api/interactive/fields/:productId`             | Configurar campos (CREATOR) |
| GET    | `/api/interactive/data/:productId`               | Ver datos guardados         |
| POST   | `/api/interactive/data/:productId`               | Guardar datos (1 crédito)   |
| PUT    | `/api/interactive/data/:productId/:moduleKey`    | Actualizar datos            |
| POST   | `/api/interactive/analyze/:productId/:moduleKey` | Análisis IA (3 créditos)    |
| GET    | `/api/interactive/analytics/:productId`          | Analytics (CREATOR)         |

#### Orchestrator

| Método | Endpoint                         | Descripción                          |
| ------ | -------------------------------- | ------------------------------------ |
| GET    | `/api/orchestrator/capabilities` | Listar capabilities (18 registradas) |
| GET    | `/api/orchestrator/skills`       | Listar skills                        |
| POST   | `/api/orchestrator/query`        | Ejecutar capability                  |
| GET    | `/api/orchestrator/stream`       | Streaming SSE                        |

---

## 🛠️ Stack Tecnológico

- **Runtime**: Node.js 20+ con Express 5
- **Lenguaje**: TypeScript 5.9+
- **Build**: esbuild
- **DB**: PostgreSQL 18 con pgvector (búsqueda semántica)
- **Colas**: BullMQ + Redis
- **AI**: OpenAI GPT-4o-mini + text-embedding-3-small + Multi-provider (Ollama, Anthropic, Gemini)
- **Auth**: JWT + Refresh Tokens + 2FA
- **Validación**: Zod
- **Logging**: Pino

---

## 📁 Estructura

```
src/
├── controllers/      # Request/Response
├── repositories/    # SQL queries
│   └── ai/         # AI repositories (credits, memory, qa, review, denomination)
├── services/       # Lógica de negocio
│   └── ai/         # AI services (credits, memory, embedding, qa, review, denomination, phases-5-7)
├── middlewares/     # Auth, validation, etc.
├── routes/         # Endpoints
│   └── ai.routes.ts # AI endpoints
├── schemas/         # Zod validation
├── queues/         # BullMQ workers
├── utils/          # Helpers
├── config/         # Configuración
├── errors/         # Custom errors
└── types/          # TypeScript types
    └── ai.types.ts # AI types
```

---

## 🤖 AI Features

El backend incluye un sistema completo de AI Features basado en créditos prepagos:

### Servicios AI

- **credits.service.ts** - Gestión de créditos prepagos
- **memory.service.ts** - Crema Memory Service (embeddings + pgvector)
- **embedding.service.ts** - Generación de embeddings con OpenAI
- **qa.service.ts** - Sistema de Q&A con votos
- **review.service.ts** - Sistema de reviews/ratings
- **denunciation.service.ts** - Sistema de reportes + Reports Agent (triage IA)
- **phases-5-7.service.ts** - AI Agents, Analytics, Tutor, Insights
- **interactive-agent.service.ts** - Talleres dinámicos con análisis personalizado
- **credits.service.ts** - Sistema de créditos con useCredits idempotente

### Repositories AI

- **credits.repository.ts** - CRUD de créditos
- **memory.repository.ts** - Embeddings con búsqueda vectorial
- **qa.repository.ts** - Q&A + FAQs
- **review.repository.ts** - Reviews + Votes + Settings
- **denomination.repository.ts** - Reports + Reasons + Actions

### Tablas AI (21 tablas)

- ai_credits, ai_credit_transactions, ai_credit_packages
- ai_embeddings (con pgvector vector(1536))
- product_questions, question_votes, product_faqs
- product_reviews, review_votes, product_review_settings
- reports, report_reasons, report_actions, content_policies
- product_qa_agent_config, agent_conversations, agent_messages
- creator_daily_metrics
- product_tutor_config, tutor_insights
- creator_dashboards, insights_history

> ⚠️ **Nota**: Require extensión `pgvector` instalada en PostgreSQL.

---

## ⚙️ Configuración

### Variables de Entorno

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
SECRET_JWT_KEY=...
SECRET_REFRESH_JWT_KEY=...

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=...

# Mux
MUX_SIGNING_KEY=...

# OpenAI (AI Features)
OPENAI_API_KEY=...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

### Comandos

```bash
pnpm dev          # Desarrollo
pnpm build        # Build producción
pnpm test         # Tests
pnpm lint         # Lint
pnpm typecheck    # Tipos
```

---

## 🛡️ Seguridad

### Implementado

- ✅ JWT en cookies HttpOnly
- ✅ Rate limiting por endpoint
- ✅ Helmet security headers
- ✅ CORS configurado
- ✅ 2FA opcional
- ✅ Password hashing con bcrypt + pepper
- ✅ Validación de inputs con Zod

### Consideraciones

- Tokens JWT expiran en 15 min (access) y 7 días (refresh)
- Rate limiting: 5 login attempts / 15 min
- 2FA usa TOTP (Google Authenticator, etc.)

---

## 🧪 Testing

```bash
pnpm test              # Tests unitarios
pnpm test:coverage     # Coverage
pnpm test:ci           # Tests en Docker
```

### Cobertura de Tests (actual)

| Métrica    | Porcentaje |
| ---------- | ---------- |
| Statements | ~52%       |
| Functions  | ~55%       |
| Lines      | ~52%       |
| Branches   | ~41%       |

**Total: 1231 tests unitarios en 86 archivos de test** (1231 passed, 7 skipped)

### Archivos de Test

- **Rutas**: auth, users, products, content, quiz, balance, payouts, payments, refunds, affiliates, admin, products-routes, interactive
- **Servicios**: auth, user, product, payment, payout, order, commission, refund, release, access, subscription, payout_method, email, twoFactor, simulator-provider, ai (embedding, llm, tutor, agents, qa, review, interactive-agent)
- **Repositorios**: ai (interactive-agent, memory, credits)
- **Utils**: validators, jwt, params
- **Config/DB**: config, postgres
- **Setup**: setup.ts (mocks globales), vitest.setup.ts

---

## 📚 Documentación

- [Documentación completa](../docs/)
- [Swagger UI](http://localhost:3000/api-docs) (desarrollo)
- [Guía de desarrollo](../docs/development/setup.md)

---

_Diseñado por Kike Garcia - 2026_
