# Documentación de Crema

Bienvenido a la documentación oficial de **Crema** - Plataforma all-in-one para creadores y emprendedores.

## Tabla de Contenidos

### Introducción
- [Introducción al Proyecto](./index.md)

### Arquitectura
- [Visión General](./architecture/overview.md)
- [Stack Tecnológico](./architecture/stack.md)
- [Estructura de Directorios](./architecture/directory-structure.md)
- [Patrones de Diseño](./architecture/patterns.md)

### API
- [Introducción a la API](./api/index.md)
- [Autenticación](./api/authentication.md)
- [Códigos de Error](./api/errors.md)
- Endpoints:
  - [Auth](./api/endpoints/auth.md)
  - [Products](./api/endpoints/products.md)
  - [Payments](./api/endpoints/payments.md)
  - [Learning](./api/endpoints/learning.md)
  - [Affiliates](./api/endpoints/affiliates.md)
  - [Admin](./api/endpoints/admin.md)
  - [Balance](./api/endpoints/balance.md)
  - [Payout](./api/endpoints/payout.md)
  - [Refund](./api/endpoints/refund.md)

### Base de Datos
- [Esquema de Base de Datos](./database/schema.md)
- [Políticas de Migraciones](./database/migrations.md)

### Features
- [Sistema de Pagos](./features/payments.md)
- [Sistema de Afiliados](./features/affiliates.md)
- [Streaming de Video](./features/streaming.md)
- [LMS (Learning Management System)](./features/lms.md)
- [Cumplimiento Fiscal (LEC)](./features/compliance.md)
- [Safe-Guard (Anti-Fraude)](./features/safeguard.md)
- [AI Features](./project/ai-features/PRD.md) ⭐ Nuevo

### Desarrollo
- [Setup Local](./development/setup.md)
- [Guía de Contribuciones](./development/contributing.md)
- [Guía de Estilo](./development/style-guide.md)

### Proyecto
- [Glosario de Términos](./project/common/glossary.md)
- [Roadmap](./project/common/roadmap.md)

---

## Estado del Proyecto (Mayo 2026)

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend API Core | ✅ Completo | ~95% funcionalidades |
| AI Features Backend | ✅ Completo | Phases 1-9 implementadas + Interactive Agent + Reports Agent |
| Frontend | ❌ Pendiente | Por desarrollar |
| AI Features Frontend | ❌ Pendiente | Por desarrollar |

### AI Features Implementadas

- **Phase 1**: Memory Service (pgvector) + Credits System
- **Phase 2**: Q&A System + FAQs
- **Phase 3**: Reviews/Ratings
- **Phase 4**: Denunciations + Content Policies + Reports Agent (Triage IA)
- **Phase 5**: AI Agents (QA)
- **Phase 6**: Analytics Dashboard
- **Phase 7**: Tutor AI + Insights
- **Phase 8**: AI Content Assistant (Content Analysis, Quizzes, Transcription)
- **Phase 9**: Interactive Agent (Talleres Dinámicos con análisis personalizado)

## Recursos Externos

- [Repositorio GitHub](https://github.com/egkike/crema)
- [Swagger/OpenAPI Docs](/api-docs) - En backend running
- [PRD: AI Features](./project/ai-features/PRD.md)

---

*Última actualización: Junio 2026*
