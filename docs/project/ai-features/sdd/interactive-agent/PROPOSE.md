# SDD Proposal: Interactive Agent (Talleres Dinámicos)

**Change**: interactive-agent
**Type**: AI Feature (Phase 2 — Analytics + IA Avanzada)
**SDD Phase**: Proposal
**Status**: Draft
**Date**: Mayo 2026
**Owner**: Kike García
**PRD Ref**: AI-FEATURES-PRD.md §2.5

---

## 1. Intent

Permitir que el comprador cargue sus datos específicos (caso práctico) en cada módulo de un producto y reciba análisis personalizado de la IA basado en SU realidad. Transforma cursos pasivos en **herramientas de implementación**.

> **Del PRD (§2.5):** "Curso 'Cómo montar una cafetería' → Módulo 1: alumno carga su ubicación, costo de alquiler → Módulo 2: IA analiza y da punto de equilibrio personalizado → Al final: Business Plan listo, no solo un certificado."

## 2. Scope

### In Scope
- Tablas `user_course_data` y `product_module_fields`
- Servicio `interactiveAgentService` (CRUD + análisis IA)
- Repository para acceso a datos
- API endpoints REST para:
  - Comprador: guardar datos, pedir análisis, ver progreso
  - Creador: configurar campos por módulo, ver tendencias (anonimizado)
- Credit consumption (3-5 créditos por análisis completo)
- Rate limiting específico (`interactiveAgentLimiter`: 10/min)

### Out of Scope
- Análisis advanced que requieran procesamiento async pesado (BullMQ inicial no requerido)
- Frontend (queda para el frontend team)
- Integración con Orchestrator (futuro, no en esta versión)

## 3. Approach

### Arquitectura

```
Backend: src/services/ai/interactive-agent.service.ts
         src/repositories/ai/interactive-agent.repository.ts
         src/routes/interactive.routes.ts
         db/init/12-interactive-agent.sql

DB Tables:
  - user_course_data (datos del usuario por módulo)
  - product_module_fields (config de campos por módulo)
```

### Patrones a Reutilizar

Ver `docs/project/reusable-resources.md`:
- **Singleton service** → `interactiveAgentService` pattern como `qaAgentService` / `tutorService`
- **Repository** → Singleton como `memoryRepository`
- **Config access** → `ConfigService` para futuras keys (límites, TTL de cache)
- **LLMService** → Para generar análisis personalizados
- **AI credit consumption** → `aiCreditService.useCredits()` pattern
- **Rate limiting** → `interactiveAgentLimiter` usando patrón de `aiChatLimiter`
- **Error handling** → `AppError` + `globalErrorHandler`

### API Design

```
# Usuario (comprador)
GET    /api/interactive/fields/:productId          → campos configurados por creator
POST   /api/interactive/data/:productId            → guardar input data
PUT    /api/interactive/data/:productId/:moduleKey  → actualizar input data
GET    /api/interactive/data/:productId            → obtener mis datos guardados
POST   /api/interactive/analyze/:productId/:moduleKey → solicitar análisis IA

# Creador (owner)
GET    /api/interactive/fields/:productId          → ver campos configurados (mismo endpoint)
POST   /api/interactive/fields/:productId          → crear/actualizar campos
GET    /api/interactive/analytics/:productId        → tendencias agregadas (anonimizado)
```

### Credit Model

| Operación | Costo |
|-----------|-------|
| Guardar datos (input) | 1 crédito |
| Análisis completo | 3-5 créditos |
| Consulta historial | 0 créditos |

### Security Considerations

- Validación de ownership: comprador solo ve sus propios datos, creator solo ve sus productos
- Input validation con Zod (moduleKey regex, input_data size limit 50KB)
- Rate limiting: 10 análisis/min por usuario
- No loggear `input_data` en errores (sensitive user data)
- SQL injection prevention: parameterized queries siempre

## 4. Risks

| Risk | Mitigation |
|------|------------|
| LLM genera análisis incorrectos | Mantener `output_analysis` opcional (puede estar vacío), no guardar análisis sin user confirmation |
| Credit abuse | Rate limiter + verificar balance antes de generar |
| Large input_data | Limitar a 50KB por module |
| Concurrent updates | UNIQUE constraint (user_id, product_id, module_key) + ON CONFLICT DO UPDATE |

## 5. Alternatives Considered

1. **Sin IA (solo almacenamiento)**: No — el diferenciador es el análisis personalizado
2. **Usar Orchestrator** (futuro): Por ahora no se integra — el servicio es standalone y self-contained
3. **Async con BullMQ para análisis**: No en v1 — análisis es simple y rápido, sync es aceptable

---

## Next Step

Pasar a **SPEC.md** con los requisitos funcionales detallados.