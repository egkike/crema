# Roadmap del Proyecto

## Estado Actual

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend API | ✅ Completo | ~95% de funcionalidades implementadas |
| Frontend | ❌ Pendiente | Por desarrollar |
| AI Features Backend | ✅ Completo | Phases 1-7 implementadas |
| AI Features Frontend | ❌ Pendiente | UI components por desarrollar |

---

## Fase 1: Backend Core (Completado)

###已完成 ✅
- [x] Autenticación JWT con refresh tokens
- [x] 2FA (autenticación de dos factores)
- [x] Gestión de usuarios (CRUD)
- [x] Sistema de productos (cursos, ebooks, membresías)
- [x] Sistema de módulos y lecciones
- [x] LMS básico (progreso, quizzes)
- [x] Certificados automáticos
- [x] Sistema de pagos (Mercado Pago)
- [x] Sistema de afiliados
- [x] Comisiones automáticas
- [x] Balances (pending, available)
- [x] Payouts (retiros)
- [x] Reembolsos con Safe-Guard
- [x] Streaming de video (Mux/Cloudflare)
- [x] Cumplimiento LEC
- [x] Documentación Swagger/OpenAPI

---

## Fase 2: AI Features - Backend (Completado) ⭐

### Phase 1: Foundation (Memory + Credits) ✅
- [x] pgvector extensión instalada
- [x] Tablas: ai_embeddings, ai_credits, ai_credit_transactions, ai_credit_packages
- [x] Repositories: credits.repository.ts, memory.repository.ts
- [x] Services: credits.service.ts, memory.service.ts, embedding.service.ts
- [x] API endpoints para gestión de créditos
- [ ] Integración con MercadoPago webhooks (pendiente)

### Phase 2: Q&A System ✅
- [x] Tablas: product_questions, question_votes, product_faqs
- [x] Repository: qa.repository.ts
- [x] Service: qa.service.ts
- [x] API endpoints completos
- [ ] UI FAQ en frontend (pendiente)

### Phase 3: Reviews/Ratings ✅
- [x] Tablas: product_reviews, review_votes, product_review_settings
- [x] Repository: review.repository.ts
- [x] Service: review.service.ts
- [x] API endpoints completos
- [ ] UI Reviews en frontend (pendiente)

### Phase 4: Denunciations ✅
- [x] Tablas: reports, report_reasons, report_actions, content_policies
- [x] Repository: denomination.repository.ts
- [x] Service: denomination.service.ts
- [x] API endpoints completos
- [x] Políticas de contenido precargadas
- [ ] Fund retention logic (pendiente)
- [ ] UI Denunciations en frontend (pendiente)

### Phase 5: AI Agents (Basic) ✅
- [x] Tablas: product_qa_agent_config, agent_conversations, agent_messages
- [x] Service: qaAgentService en phases-5-7.service.ts
- [x] API endpoints para chat y configuración
- [ ] LLM Integration real (pendiente)

### Phase 6: Analytics Dashboard ✅
- [x] Tablas: creator_daily_metrics
- [x] Service: analyticsService en phases-5-7.service.ts
- [x] API endpoints para métricas
- [ ] Metrics aggregation job (pendiente)

### Phase 7: Advanced AI (Tutor + Insights) ✅
- [x] Tablas: product_tutor_config, tutor_insights, creator_dashboards, insights_history
- [x] Services: tutorService, insightsService en phases-5-7.service.ts
- [x] API endpoints completos
- [ ] UI Tutor + Insights en frontend (pendiente)

### Phase 8: Testing + Integration (Pendiente)
- [ ] Unit tests para AI services
- [ ] Integration tests para AI routes
- [ ] E2E tests
- [ ] Rate limiting middleware
- [ ] Swagger documentation

---

## Fase 3: Frontend (Pendiente)

### Planificado
- [ ] Interfaz de usuario (Astro + React)
- [ ] Dashboard de Creator
- [ ] Dashboard de Afiliado
- [ ] Checkout de pagos
- [ ] Player de video
- [ ] Portal de estudiante (LMS)
- [ ] Panel de administración
- [ ] **UI AI Features** (FAQ, Reviews, Denunciations, Tutor, Insights)

---

## Fase 3: Funcionalidades Avanzadas (Parcialmente Completado)

### Sistema de Membresías
- [ ] Suscripciones recurrentes
- [ ] Acceso a contenido por nivel
- [ ] Renovación automática

### Comunidad ✅ (Parcial)
- [x] Reviews/Ratings de productos (Backend completo, Frontend pendiente)
- [ ] Comentarios en lecciones
- [ ] Foro de estudiantes

### Marketing
- [ ] Emails transaccionales
- [ ] Sequences automatizadas
- [ ] Landing pages

### Analytics ✅ (Backend completo, Frontend pendiente)
- [x] Dashboard de métricas avanzado (Backend)
- [ ] Heatmaps de estudiantes
- [x] Reports de conversión (Backend)

---

## Fase 4: Escalabilidad (Planificado)

### Infraestructura
- [ ] Docker/Kubernetes setup
- [ ] CI/CD pipelines
- [ ] Load balancing
- [ ] Cache con Redis
- [ ] CDN para assets

### Monitoreo
- [ ] Logs centralizados
- [ ] Métricas (Prometheus/Grafana)
- [ ] Alerts
- [ ] Health checks

---

## Fase 5: Marketplace (Planificado)

### Plataforma
- [ ] Búsqueda avanzada
- [ ] Categorías y filtros
- [ ] Featured products
- [ ] Descuentos globales

### Descubrimiento
- [ ] Recomendaciones
- [ ] "Products similar to..."
- [ ] Best sellers

---

## Lista de Espera (Backlog)

### Nice to Have
- [ ] App móvil (React Native)
- [ ] Webinars integrados
- [ ] Comunidad/Foro
- [ ] Chat con creador
- [ ] Gamificación (logros, badges)

###未来 (Futuro)
- [ ] Multi-idioma
- [ ] White-label
- [ ] API pública para terceros

---

## Timeline Tentativo

```
2026
├── Q1: Backend Core + AI Features Backend ⭐ (Completado)
├── Q2: Frontend v1 (Dashboard + Checkout + AI UI)
├── Q3: Frontend v2 (LMS + Player + AI Features)
└── Q4: Escalabilidad + Marketplace
```

---

## Cómo Contribuir

¿Querés ayudar? Mirá nuestra [Guía de Contribuciones](../development/contributing.md).

---

## Ver También

- [Setup Local](../development/setup.md)
- [Arquitectura](../architecture/overview.md)
