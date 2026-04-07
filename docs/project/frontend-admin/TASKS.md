# SDD - TASKS: frontend-admin

**Change**: frontend-admin  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## Enfoque de Desarrollo: Backend Primero

Las tareas del backend se completan ANTES de comenzar el desarrollo del frontend. Esto asegura que cuando el frontend necesite los datos, las APIs ya estén disponibles.

```
FASE 1: Backend (G1-G6)     →  FASE 2: Frontend
───────────────────────           ───────────────────
  G1: GET products               Setup proyecto
  G2: GET product/:id            Auth + Login
  G3: PATCH product/:id          Layout
  G4: GET orders                 Dashboard
  G5: GET order/:id              Users (existente)
  G6: GET commissions            Products ← G1,G2,G3ready!
                                  Orders ← G4,G5 ready!
                                  Balance
                                  Payouts
                                  etc...
```

---

## Fase 1: Backend - Endpoints para Admin

### Tarea B-001: Crear endpoint GET /api/admin/products

**Descripción**: Listar todos los productos de la plataforma con filtros y paginación.

**Archivo a modificar**: `backend/src/routes/admin.routes.ts` + crear repository method

**Implementación**:
- Crear método en `product.repository.ts` para listar todos los productos
- Crear endpoint en `admin.routes.ts`
- Soportar filtros: search, type, status, creator_id
- Soportar paginación: page, limit

**Criterios de aceptación**:
- [ ] Retorna lista de productos con datos completos
- [ ] Soporta filtros por nombre, tipo, estado
- [ ] Soporta paginación
- [ ] Solo accesible para ADMIN

**Estimación**: 2 horas

---

### Tarea B-002: Crear endpoint GET /api/admin/products/:id

**Descripción**: Ver detalle de un producto específico.

**Implementación**:
- Crear método en repository
- Crear endpoint

**Criterios de aceptación**:
- [ ] Retorna datos completos del producto
- [ ] Incluye datos del creador
- [ ] Incluye stats de ventas

**Estimación**: 1 hora

---

### Tarea B-003: Crear endpoint PATCH /api/admin/products/:id

**Descripción**: Editar información de un producto.

**Implementación**:
- Crear método de update en repository
- Crear endpoint PATCH
- Validar campos editables

**Criterios de aceptación**:
- [ ] Permite editar nombre, descripción, precio
- [ ] Permite cambiar estado (draft/published/archived)
- [ ] Loggear la acción

**Estimación**: 2 horas

---

### Tarea B-004: Crear endpoint GET /api/admin/orders

**Descripción**: Listar todas las órdenes de la plataforma.

**Implementación**:
- Crear método en `order.repository.ts`
- Crear endpoint en `admin.routes.ts`
- Soportar filtros: status, currency, from, to, search

**Criterios de aceptación**:
- [ ] Retorna lista de órdenes con datos completos
- [ ] Soporta filtros por estado, moneda, fecha
- [ ] Soporta paginación

**Estimación**: 2 horas

---

### Tarea B-005: Crear endpoint GET /api/admin/orders/:id

**Descripción**: Ver detalle de una orden específica.

**Implementación**:
- Crear método en repository
- Crear endpoint

**Criterios de aceptación**:
- [ ] Retorna datos completos de la orden
- [ ] Incluye datos del comprador, producto, afiliado
- [ ] Incluye desglose de comisiones

**Estimación**: 1 hora

---

### Tarea B-006: Crear endpoint GET /api/admin/commissions

**Descripción**: Obtener estadísticas de comisiones.

**Implementación**:
- Crear método en `commission.repository.ts`
- Crear endpoint

**Criterios de aceptación**:
- [ ] Retorna total comisiones pagadas
- [ ] Retorna total comisiones pending
- [ ] Retorna top productos por ventas de afiliados

**Estimación**: 2 horas

---

### Tarea B-007: Auditoría de acciones admin

**Descripción**: Sistema de logging de acciones administrativas para cumplimiento y seguridad.

**Implementación**:
- Middleware de auditoría en memoria (listo para persistir en DB)
- logs de acciones CRUD (products, payouts)
- Endpoint `/api/admin/audit-logs` para visualización

**Criterios de aceptación**:
- [x] Cada acción de escritura registra: admin_id, acción, recurso, old_value, new_value, timestamp, IP
- [x] Los logs no son editables ni eliminables
- [x] Endpoint para exportar logs por rango de fechas y acción
- [ ] Filtros de auditoría en el panel admin (pendiente frontend)

**Estimación**: 4 horas

---

### Tarea B-008: Timeout de sesión + 2FA obligatorio para admin

**Descripción**: Reforzar seguridad de autenticación para panel admin.

**Implementación**:
- Middleware `requireAdmin2FA` que verifica level >= 10
- Verifica `two_factor_enabled` antes de permitir acceso
- Rate limiting específico para endpoints admin

**Criterios de acceso**:
- [x] Admin sin 2FA no puede acceder al panel
- [ ] Sesión expira por inactividad (pendiente - requiere frontend)
- [ ] Access token de admin más corto (pendiente - configurable via env)

**Estimación**: 3 horas

---

### Tarea B-009: Rate limiting específico para admin

**Descripción**: Limitar requests agresivos en endpoints admin.

**Implementación**:
- `adminReadLimiter`: 100 req/min para operaciones de lectura
- `adminWriteLimiter`: 50 req/min para operaciones de escritura
- Aplicado a todas las rutas `/api/admin/*`

**Criterios de aceptación**:
- [x] Endpoints de lectura: 100 req/min
- [x] Endpoints de escritura: 50 req/min
- [x] Headers de rate limit visibles en respuestas (X-RateLimit-Limit, Remaining, Reset)
- [x] Bloqueo temporal al superar límite (429 Too Many Requests)

**Estimación**: 2 horas

**Criterios de aceptación**:
- [ ] Endpoints admin tienen límites menores que endpoints públicos
- [ ] Retorna headers X-RateLimit-Limit/Remaining/Reset
- [ ] Logs cuando se alcanza el límite

**Estimación**: 2 horas

---

## Resumen Tareas Backend

| # | Tarea | Estimación |
|---|-------|------------|
| B-001 | GET /api/admin/products | 2h |
| B-002 | GET /api/admin/products/:id | 1h |
| B-003 | PATCH /api/admin/products/:id | 2h |
| B-004 | GET /api/admin/orders | 2h |
| B-005 | GET /api/admin/orders/:id | 1h |
| B-006 | GET /api/admin/commissions | 2h |
| B-007 | Auditoría de acciones admin | 4h |
| B-008 | Timeout sesión + 2FA admin | 3h |
| B-009 | Rate limiting admin | 2h |
| | **Total Backend** | **~19 horas** |

---

## Fase 2: Frontend (Se define después de completar Backend)

Una vez completadas las tareas B-001 a B-006, se procederá con las tareas de frontend.

---

## Estado

| Tarea | Estado |
|-------|--------|
| B-001 | ✅ Completado |
| B-002 | ✅ Completado |
| B-003 | ✅ Completado |
| B-004 | ✅ Completado |
| B-005 | ✅ Completado |
| B-006 | ✅ Completado |
| B-007 | ✅ Completado (Auditoría) |
| B-008 | ✅ Completado (2FA obligatorio) |
| B-009 | ✅ Completado (Rate limiting) |
| Frontend | ⏳ Esperando Backend |

---

**Tareas Backend definidas**: Abril 2026  
**Próximo paso**: Ejecutar B-001 - Crear endpoint GET /api/admin/products