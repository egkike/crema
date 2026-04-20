# SDD Proposal: Orchestrator + Skills Registry

## Fase 2: Arquitectura de Orquestación de Agentes

---

## 1. Resumen del Cambio

### 1.1 Título
**Centralizar Orquestación de Agentes AI + Skills Registry**

### 1.2 Tipo de Cambio
Arquitectura - Nuevo subsistema

### 1.3 Resumen Ejecutivo

Crear una capa centralizada de orquestación que gestione todos los agentes AI del ecosistema Crema mediante:
- **Orchestrator**: Punto único de entrada para cualquier query de AI
- **Skills Registry**: Registro centralizado de capacidades (skills) de cada agente

### 1.4 Justificación del Cambio

| Problema Actual | Impacto | Solución Propuesta |
|---------------|---------|------------------|
| Queries AI dispersas en múltiples servicios | Difícil mantener y escalar | 1 solo punto de entrada |
| No hay registro centralizado de skills | Dificultad para descubrir capacidades | Registry con metadatos |
| Acoplamiento directo entre servicios | Cambios risky | Orquestador como intermediario |
| Sin estándar para agregar nuevos agentes | Código duplicate | Contrato definido |

---

## 2. Alcance

### 2.1 Scope (Incluye)
- Crear `Orchestrator` como punto de entrada
- Crear `SkillsRegistry` con metadata de skills
- Integrar servicios AI existentes (llm.service, embedding.service, qa.service, etc.)
- Definir contrato estándar para nuevos agentes
- Endpoints de descubrimiento de skills
- (Los servicios existentes se integran, no se modifican su lógica interna)

### 2.2 Scope (Excluye)
- Modificación de lógica interna de servicios AI existentes
- UI de administración (Fase 4)
- User Context Memory (Fase 5)

---

## 3. Análisis de Impacto

### 3.1 Componentes Afectados

| Componente | Tipo Cambio | Impacto |
|------------|-------------|---------|
| Routes AI existentes | Adaptación | Medio - agregar prefijo |
| LLMService | Integración | Bajo - registra su skill |
| EmbeddingService | Integración | Bajo - registra su skill |
| QAService | Integración | Bajo - registra su skill |
| MemoryService | Integración | Bajo - registra su skill |

### 3.2 Dependencias

- **Required**: ConfigService (Fase 1) ✅
- **Required**: Database (PostgreSQL)
- **Required**: Redis (caching)

### 3.3 Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|---------|
| Breaking changes en API | Baja | Alto | Versióning de endpoints |
| Performance por Routing | Media | Medio | Redis caching |
| Skills Registry no usado | Alta | Bajo | Incentivar uso con docs |

---

## 4. Success Criteria

### 4.1 Definición de Éxito

| Criterio | Métrica |
|----------|---------|
| Queries centralizadas | 100% pasan por Orchestrator |
| Registro de skills | ≥ 5 skills registradas |
| Descubrimiento | Endpoint /skills retorna todas las skills |
| Time to add new agent | ≤ 30 min con contrato definido |

### 4.2 Acceptance Criteria

- [ ] Orchestrator recibe cualquier query AI y la rutea al agente correcto
- [ ] Skills Registry expone metadata de todas las skills registradas
- [ ] Servicios AI existentes registrados como skills
- [ ] Nuevo agente puede agregarse con ≤ 30 min de código
- [ ] Documentación de API actualizada

---

## 5. Enfoque Propuesto

### 5.1 Arquitectura

```
User Request
     ↓
[API Routes] → /api/orchestrator/*
     ↓
[Orchestrator Service]
     ↓
[Skills Registry] ← Busca skill por capability
     ↓
[Agent Execution] → LLM | Embedding | QA | Memory | Review
     ↓
[Response]
```

### 5.2 Componentes a Crear

1. **Orchestrator Service** (`src/services/orchestrator.service.ts`)
   - Entry point para queries AI
   - Routing basado en capability
   - Manejo de errores centralizado

2. **Skills Registry** (`src/services/skills-registry.service.ts`)
   - Registro de metadata de skills
   - Capabilidades disponibles
   - Descubrimiento

3. **Orchestrator Routes** (`src/routes/orchestrator.routes.ts`)
   - `/orchestrator/query` - ejecutar skill
   - `/orchestrator/skills` - listar skills
   - `/orchestrator/capabilities` - listar capabilities

4. **Database Tables**
   - `skills` - metadata de skills

---

## 6. Roadmap Plan

| Fase | Timeline | Entregable |
|------|----------|------------|
| SDD | Semana 1 | Esta proposal + spec + design + tasks |
| Implementation | Semanas 3-4 | Orchestrator funcional |
| Integration | Semana 5 | Skills Registry completo |

---

## 7. Alternativas Consideradas

### Alternativa 1: Cada servicio路由直接的
- **Pros**: Simple, no hay capa extra
- **Cons**: No hay centralización, difícil escalar
- **Decision**: Descartado - no escala

### Alternativa 2: API Gateway externo
- **Pros**: Más robusto
- **Cons**: Overhead, más complejo
- **Decision**: Descartado - overkill para el scope actual

### Alternativa 3 (Seleccionada): Orchestrator como servicio
- **Pros**: Centralizado, simple de implementar, extensible
- **Cons**: Nueva capa de indirección
- **Decision**: Aceptado - mejor balance

---

## 8. Preguntas Abiertas

- [ ] ¿Usar WebSockets para streaming de respuestas?
- [ ] ¿Cómo manejar skills que requieren contexto largo?
- [ ] ¿Rate limiting por skill o global?

---

**Proposal Creado**: Abril 2026  
**Estado**: En revisión  
**Author**: SDD Workflow