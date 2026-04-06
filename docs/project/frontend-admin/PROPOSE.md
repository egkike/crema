# SDD - Propuesta: frontend-admin

**Change**: frontend-admin  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## 1. Objetivo

Desarrollar el panel de administración (frontend-admin) de la plataforma Crema para gestionar la plataforma, usuarios, productos, órdenes, pagos y reportes.

---

## 2. Scope

### 2.1 Módulos Incluidos (Full - según selección del usuario)

| Módulo | Descripción | Prioridad |
|--------|-------------|-----------|
| **Dashboard** | Métricas, gráficos, health check, retention summary | 🔴 Critical |
| **Usuarios** | Listar, crear, editar, banear, cambiar nivel, stats | 🔴 Critical |
| **Productos** | Listar todos, ver detalle, editar, eliminar | 🔴 Critical |
| **Órdenes** | Listar todas, ver detalle, historial | 🔴 Critical |
| **Refunds** | Listar refunds, aprobar/rechazar | 🔴 Critical |
| **Balance** | Balance plataforma, ledger, earnings | 🟡 Alta |
| **Payouts** | Pending, aprobar/rechazar, historial | 🟡 Alta |
| **Comisiones** | Stats de comisiones por producto/usuario | 🟡 Alta |
| **AI Stats** | Usage de credits, AI performance | 🟢 Media |
| **Reports** | Export CSV (tax, audit, refunds, payouts, LEC) | 🟢 Media |
| **Config** | Platform settings | 🟢 Media |
| **LEC** | Proyectos I+D, RD logs, compliance status | 🟢 Media |

### 2.2 Excluido del Scope

- **Gestión de contenido del cliente**: Los creadores gestionan sus propios productos
- **Frontend-main**: No es parte de este change
- **Módulo de pagos**: Solo gestión, no procesamiento

---

## 3. Gaps Identificados (Backend)

Para lograr el scope Full, se necesitan los siguientes endpoints que **NO existen actualmente**:

| Gap | Endpoint Necesario | Impacto | Solución Propuesta |
|-----|-------------------|---------|-------------------|
| **G1** | `GET /api/admin/products` | Alto | Crear nuevo endpoint en backend |
| **G2** | `GET /api/admin/products/:id` | Alto | Crear nuevo endpoint |
| **G3** | `PATCH /api/admin/products/:id` | Alto | Crear nuevo endpoint |
| **G4** | `GET /api/admin/orders` | Alto | Crear nuevo endpoint |
| **G5** | `GET /api/admin/orders/:id` | Medio | Crear nuevo endpoint |
| **G6** | `GET /api/admin/commissions` | Medio | Usar existente o crear |

### Priorización de Gaps

| Fase | Gaps | work |
|------|------|------|
| **Fase 1 (MVP)** | G1, G2, G4, G5 | Crear endpoints críticos |
| **Fase 2** | G3, G6 | Endpoints de edición |

---

## 4. Riesgos Identificados

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **R1**: Endpoints no listos a tiempo | Media | Alto | Desarrollar en paralelo backend + frontend |
| **R2**: Datos muy grandes (pagination) | Alta | Medio | Implementar pagination server-side desde el inicio |
| **R3**: Performance con gráficos | Media | Medio | Usar loading states, virtualización |
| **R4**: Autenticación 2FA flow | Baja | Alto | Login normal → si 2FA → verify → redirect |
| **R5**: Balance en tiempo real | Media | Bajo | Polling cada 30s o manual refresh |

---

## 5. Alternativas Evaluadas

### Alternativa A: Crear todos los endpoints primero (RECOMENDADA)

**Descripción**: Desarrollar los endpoints de gestión (G1-G6) en el backend antes de iniciar el frontend.

| Pros | Contras |
|------|---------|
| Frontend consume APIs ready | Retrasa inicio del frontend |
| Menos cambios en frontend | Más trabajo upfront |
| APIs diseñadas para frontend | - |

### Alternativa B: Frontend mock + luego conectar

**Descripción**: Usar datos mock en frontend hasta que los endpoints estén listos.

| Pros | Contras |
|------|---------|
| Frontend puede avanzar | Mucho refactor después |
| Testing rápido | mocks no reflejan realidad |

### Alternativa C: Usar endpoints existentes de creators

**Descripción**: Reutilizar los endpoints de productos/órdenes de creators agregando filtro admin.

| Pros | Contras |
|------|---------|
| Menos endpoints nuevos | Security risk si no se filtra bien |
| Rápido | Puede ser ineficiente |

---

## 6. Recomendación

**Elegir: Alternativa A** - Crear endpoints primero

### Justificación:
- El frontend depende de los endpoints
- Es más eficiente desarrollar backend y frontend en paralelo
- Reduces refactoring posterior

### Plan de trabajo paralelo:

```
Backend (Gaps G1-G6)     Frontend-admin
    │                        │
    ├─ G1,G2 (products)     ├─ Setup project
    ├─ G4,G5 (orders)        ├─ Dashboard
    ├─ G3 (edit product)    ├─ Users (existing)
    └─ G6 (commissions)      ├─ Products (mock)
                             ├─ Orders (mock)
                             ├─ Balance/Payouts
                             ├─ Connect APIs
```

---

## 7. Estimación

| Fase | Tarea | Estimación |
|------|-------|------------|
| **Backend** | Crear 6 endpoints (G1-G6) | 2-3 días |
| **Frontend** | Setup + Auth | 1 día |
| **Frontend** | Dashboard + Charts | 1-2 días |
| **Frontend** | Users CRUD (existente) | 0.5 días |
| **Frontend** | Products CRUD | 1-2 días |
| **Frontend** | Orders CRUD | 1-2 días |
| **Frontend** | Balance + Payouts | 1-2 días |
| **Frontend** | AI Stats + Config + LEC | 2 días |
| **Frontend** | Testing + Fixes | 2 días |
| **Total** | | **10-15 días** |

---

## 8. Dependencies

- **Backend**: Endpoints G1-G6 deben estar listos antes de conectar Products/Orders
- **Frontend-main**: No tiene dependencias con este change
- **DB**: No hay cambios de schema necesarios

---

## 9. Criterios de Éxito

- [ ] Dashboard con gráficos funcionales
- [ ] Gestión de usuarios (CRUD) operativa
- [ ] Gestión de productos visible y editable
- [ ] Órdenes visibles con historial
- [ ] Balance y ledger muestran datos correctos
- [ ] Payouts workflow completo (approve/reject)
- [ ] Export CSV funcionando
- [ ] LEC compliance visible
- [ ] Dark mode con colores warm (crema/naranja/café)
- [ ] Tests unitarios de componentes críticos

---

## 10. Próximo Paso

**Ejecutar**: Phase SPEC - User Stories + Acceptance Criteria

---

**Propuesta preparada**: Abril 2026  
**Versión**: 1.0  
**Aprobación**: Pendiente