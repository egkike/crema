# SDD - SPEC: frontend-admin

**Change**: frontend-admin  
**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión

---

## 1. User Stories - Dashboard

### US-DASH-001: Ver métricas del dashboard

**Como** Administrador  
**Quiero** ver las métricas principales del dashboard  
**Para** tener una visión rápida del estado de la plataforma

**Criterios de Aceptación:**
- [ ] Mostrar total de usuarios registrados
- [ ] Mostrar total de productos activos
- [ ] Mostrar total de ventas del período seleccionado
- [ ] Mostrar revenue total por moneda (ARS/USDT)
- [ ] Mostrar retención de impuestos (IVA/IIBB)
- [ ] Mostrar payout pending amount
- [ ] Permitir filtrar por rango de fechas (from/to)
- [ ] Permitir filtrar por moneda (ARS/USDT)
- [ ] Gráficos actualizados al cambiar filtros

---

### US-DASH-002: Ver financial health

**Como** Administrador  
**Quiero** ver el estado de salud financiera de la plataforma  
**Para** saber si la plataforma está generando profit

**Criterios de Aceptación:**
- [ ] Mostrar total_paid_volume
- [ ] Mostrar total_platform_earnings (bruto y neto)
- [ ] Mostrar total_payouts_completed
- [ ] Mostrar pending_balance (garantías)
- [ ] Mostrar discrepancies_count (debe ser 0)
- [ ] Mostrar gráficos de tendencia

---

### US-DASH-003: Ver retention summary

**Como** Administrador  
**Quiero** ver el resumen de retenciones impositivas  
**Para** conocer los impuestos acumulados

**Criterios de Aceptación:**
- [ ] Mostrar total de IVA retenido
- [ ] Mostrar total de IIBB retenido
- [ ] Mostrar gráfico de torta por tipo de retención
- [ ] Filtrable por moneda

---

## 2. User Stories - Usuarios

### US-USER-001: Listar usuarios

**Como** Administrador  
**Quiero** ver una lista de todos los usuarios  
**Para** gestionar la base de usuarios

**Criterios de Aceptación:**
- [ ] Mostrar tabla con: nombre, email, nivel, estado, fecha registro
- [ ] Pagination (20 por página)
- [ ] Buscar por nombre o email
- [ ] Filtrar por nivel (ADMIN, STAFF, CREATOR, AFFILIATE, USER)
- [ ] Filtrar por estado (active, suspended, banned)
- [ ] Ordenar por columna (nombre, fecha, nivel)
- [ ] Exportar a CSV

### US-USER-002: Ver detalle de usuario

**Como** Administrador  
**Quiero** ver el detalle de un usuario específico  
**Para** tomar decisiones de gestión

**Criterios de Aceptación:**
- [ ] Mostrar datos del usuario (nombre, email, nivel, estado)
- [ ] Mostrar fecha de registro y último login
- [ ] Mostrar productos creados (si es CREATOR)
- [ ] Mostrar balance actual (pending/available)
- [ ] Mostrar historial de órdenes
- [ ] Mostrar comisiones ganadas

### US-USER-003: Editar usuario

**Como** Administrador  
**Quiero** editar el nivel de un usuario  
**Para** cambiar permisos y acceso

**Criterios de Aceptación:**
- [ ] Cambiar nivel (ADMIN, STAFF, CREATOR, AFFILIATE, USER)
- [ ] Guardar cambio con confirmación
- [ ] Mostrar feedback de éxito/error
- [ ] Loggear el cambio

### US-USER-004: Suspender/Banear usuario

**Como** Administrador  
**Quiero** suspender o banear un usuario  
**Para** manejar usuarios problemáticos

**Criterios de Aceptación:**
- [ ] Cambiar estado a suspended (temporal)
- [ ] Cambiar estado a banned (permanente)
- [ ] Solicitar motivo de suspensión
- [ ] Mostrar warning antes de ban
- [ ] El usuario no puede hacer login
- [ ] Loggear la acción

---

## 3. User Stories - Productos

### US-PROD-001: Listar todos los productos

**Como** Administrador  
**Quiero** ver una lista de todos los productos de la plataforma  
**Para** gestionar el catálogo

**Criterios de Aceptación:**
- [ ] Mostrar tabla con: nombre, creador, tipo, precio, estado, fecha
- [ ] Pagination (20 por página)
- [ ] Buscar por nombre
- [ ] Filtrar por tipo (course, ebook, membership, etc)
- [ ] Filtrar por estado (draft, published, archived)
- [ ] Filtrar por creador

### US-PROD-002: Ver detalle de producto

**Como** Administrador  
**Quiero** ver el detalle de un producto  
**Para** entender su configuración

**Criterios de Aceptación:**
- [ ] Mostrar datos del producto (nombre, descripción, precio)
- [ ] Mostrar creador (nombre, email)
- [ ] Mostrar tipo y configuración
- [ ] Mostrar número de ventas
- [ ] Mostrar rating promedio
- [ ] Mostrar lecciones (si es course)

### US-PROD-003: Editar producto

**Como** Administrador  
**Quiero** editar la información de un producto  
**Para** corregir errores o ajustar configuraciones

**Criterios de Aceptación:**
- [ ] Editar nombre y descripción
- [ ] Editar precio
- [ ] Cambiar estado (draft/published/archived)
- [ ] Guardar con confirmación
- [ ] Notificar al creador del cambio

---

## 4. User Stories - Órdenes

### US-ORD-001: Listar órdenes

**Como** Administrador  
**Quiero** ver todas las órdenes de la plataforma  
**Para** auditar ventas

**Criterios de Aceptación:**
- [ ] Mostrar tabla con: ID, usuario, producto, monto, estado, fecha
- [ ] Pagination (20 por página)
- [ ] Buscar por ID de orden
- [ ] Filtrar por estado (pending, paid, cancelled, refunded)
- [ ] Filtrar por moneda
- [ ] Filtrar por rango de fechas

### US-ORD-002: Ver detalle de orden

**Como** Administrador  
**Quiero** ver el detalle de una orden específica  
**Para** resolver problemas

**Criterios de Aceptación:**
- [ ] Mostrar datos de la orden (ID, monto, estado, fecha)
- [ ] Mostrar datos del comprador (nombre, email)
- [ ] Mostrar datos del producto
- [ ] Mostrar datos del afiliado (si aplica)
- [ ] Mostrar desglose de comisiones
- [ ] Mostrar historial de estados

---

## 5. User Stories - Refunds

### US-REF-001: Listar refunds

**Como** Administrador  
**Quiero** ver los pedidos de reembolso  
**Para** procesarlos

**Criterios de Aceptación:**
- [ ] Mostrar tabla con: orden, usuario, monto, estado, fecha
- [ ] Filtrar por estado (pending, approved, rejected)
- [ ] Filtrar por rango de fechas

### US-REF-002: Aprobar/Rechazar refund

**Como** Administrador  
**Quiero** aprobar o rechazar un reembolso  
**Para** gestionar la política de refunds

**Criterios de Aceptación:**
- [ ] Ver detalle de la orden original
- [ ] Ver consumo del usuario (para Safe-Guard)
- [ ] Aprobar con confirmación
- [ ] Rechazar con motivo
- [ ] Si aprobado: reversar comisiones y saldo
- [ ] Loggear la acción

---

## 6. User Stories - Balance

### US-BAL-001: Ver balance de plataforma

**Como** Administrador  
**Quiero** ver el balance de la plataforma  
**Para** conocer la salud financiera

**Criterios de Aceptación:**
- [ ] Mostrar balance pending (en garantía)
- [ ] Mostrar balance available (disponible)
- [ ] Mostrar balance total
- [ ] Mostrar por moneda (ARS/USDT)
- [ ] Actualizar manualmente (polling no real-time)

### US-BAL-002: Ver ledger

**Como** Administrador  
**Quiero** ver el libro de caja  
**Para** auditar ingresos y egresos

**Criterios de Aceptación:**
- [ ] Mostrar lista de transacciones
- [ ] Mostrar tipo (earning, withdrawal, refund, etc)
- [ ] Mostrar monto y fecha
- [ ] Filtrar por rango de fechas
- [ ] Filtrar por tipo de transacción
- [ ] Totales acumulados

---

## 7. User Stories - Payouts

### US-PAY-001: Listar payouts pending

**Como** Administrador  
**Quiero** ver los retiros pendientes de aprobar  
**Para** procesarlos

**Criterios de Aceptación:**
- [ ] Mostrar tabla con: usuario, monto, método, fecha solicitud
- [ ] Ver datos bancarios del usuario
- [ ] Ver balance del usuario
- [ ] Filtrar por moneda

### US-PAY-002: Aprobar payout

**Como** Administrador  
**Quiero** aprobar un retiro  
**Para** ejecutar el pago

**Criterios de Aceptación:**
- [ ] Ver detalle del payout
- [ ] Marcar como completed
- [ ] Adjuntar comprobante (opcional)
- [ ] Confirmar acción
- [ ] Actualizar balance del usuario
- [ ] Loggear la acción

### US-PAY-003: Rechazar payout

**Como** Administrador  
**Quiero** rechazar un retiro  
**Para** manejar retiros inválidos

**Criterios de Aceptación:**
- [ ] Solicitar motivo de rechazo
- [ ] Marcar como rejected
- [ ] Devolver saldo al usuario
- [ ] Notificar al usuario
- [ ] Loggear la acción

---

## 8. User Stories - Comisiones

### US-COMM-001: Ver stats de comisiones

**Como** Administrador  
**Quiero** ver estadísticas de comisiones  
**Para** analizar el rendimiento del programa de afiliados

**Criterios de Aceptación:**
- [ ] Mostrar total comisiones pagadas
- [ ] Mostrar total comisiones pending
- [ ] Top productos con más ventas de afiliados
- [ ] Top afiliados por comisión

---

## 9. User Stories - AI Stats

### US-AI-001: Ver usage de credits

**Como** Administrador  
**Quiero** ver el uso de credits de AI  
**Para** entender el consumo

**Criterios de Aceptación:**
- [ ] Mostrar total credits consumidos
- [ ] Mostrar credits por feature (Q&A, Tutor, Insights)
- [ ] Top usuarios por consumo
- [ ] Tendencia de uso (gráfico)

### US-AI-002: Ver performance de AI

**Como** Administrador  
**Quiero** ver la performance de los servicios AI  
**Para** identificar problemas

**Criterios de Aceptación:**
- [ ] Mostrar tasa de errores por servicio
- [ ] Mostrar tiempo de respuesta promedio
- [ ] Mostrar uso por provider (OpenAI, Ollama, etc)

---

## 10. User Stories - Reports/Export

### US-REP-001: Exportar reporte financiero

**Como** Administrador  
**Quiero** exportar reportes financieros en CSV  
**Para** análisis externo

**Criterios de Aceptación:**
- [ ] Exportar tax-report (IVA Ventas)
- [ ] Exportar audit (conciliación)
- [ ] Exportar refunds
- [ ] Exportar payouts
- [ ] Exportar LEC report
- [ ] Descargar archivo CSV

---

## 11. User Stories - Configuración

### US-CFG-001: Ver configuración de plataforma

**Como** Administrador  
**Quiero** ver la configuración actual de la plataforma  
**Para** conocer los parámetros

**Criterios de Aceptación:**
- [ ] Mostrar comisión de plataforma por moneda
- [ ] Mostrar fees fijos
- [ ] Mostrar límites de payout
- [ ] Mostrar métodos de pago habilitados

### US-CFG-002: Editar configuración

**Como** Administrador  
**Quiero** modificar la configuración de la plataforma  
**Para** ajustar parámetros

**Criterios de Aceptación:**
- [ ] Editar comisión de plataforma
- [ ] Editar fees fijos
- [ ] Editar límites de payout
- [ ] Confirmar cambios
- [ ] Loggear la acción

---

## 12. User Stories - LEC (Ley Economía del Conocimiento)

### US-LEC-001: Ver proyectos I+D

**Como** Administrador  
**Quiero** ver los proyectos de innovación  
**Para** gestionar el cumplimiento LEC

**Criterios de Aceptación:**
- [ ] Listar proyectos registrados
- [ ] Ver presupuesto de cada proyecto
- [ ] Ver estado (active, completed)

### US-LEC-002: Registrar actividad I+D

**Como** Administrador  
**Quiero** registrar horas de desarrollo  
**Para** justificar el beneficio fiscal

**Criterios de Aceptación:**
- [ ] Seleccionar proyecto
- [ ] Ingresar horas
- [ ] Descripción de actividad
- [ ] Guardar registro

### US-LEC-003: Ver compliance status

**Como** Administrador  
**Quiero** ver el estado de cumplimiento LEC  
**Para** saber si cumple el 3%

**Criterios de Aceptación:**
- [ ] Mostrar ratio actual (debe ser >= 3%)
- [ ] Mostrar horas I+D acumuladas
- [ ] Mostrar facturación bruta
- [ ] Mostrar semáforo (verde/rojo)

---

## 13. Requisitos No Funcionales

### 13.1 Performance

- Las páginas deben cargar en menos de 2 segundos
- Pagination debe ser server-side
- Gráficos deben tener loading states

### 13.2 Seguridad

- Solo usuarios con rol ADMIN pueden acceder
- JWT token en memoria (no localStorage)
- Refresh token automático
- **2FA obligatorio para admins**
- **Timeout de sesión: 30 minutos de inactividad**
- **Auditoría de todas las acciones administrativas**
- **Rate limiting específico para endpoints admin**
- CSRF protection en mutations
- XSS sanitization en inputs

### 13.3 UX

- Dark mode con colores warm (crema/naranja/café)
- Feedback visual para todas las acciones (loading, success, error)
- Confirmación para acciones destructivas

### 13.4 Responsive

- Funcionar en desktop (1024px+)
- Tablas scrollables en mobile

---

## 14. Dependencias (Backend)

Para implementar estas historias de usuario, se necesitan los siguientes endpoints:

| Endpoint | Descripción | Priority |
|----------|-------------|----------|
| GET /api/admin/products | Listar todos productos (filtros: search, type, status, creator_id) | 🔴 Critical |
| GET /api/admin/products/:id | Ver detalle producto | 🔴 Critical |
| PATCH /api/admin/products/:id | Editar producto (title, description, status, affiliate_commission_percent) | 🟡 Alta |
| GET /api/admin/orders | Listar todas órdenes (filtros: status, currency, from, to, buyer_id, product_id) | 🔴 Critical |
| GET /api/admin/orders/:id | Ver detalle orden (incluye buyer, product, affiliate, comisiones) | 🔴 Critical |
| GET /api/admin/commissions/stats | Stats comisiones (totalPaid, totalPending, totalRefunded, por tipo) | 🟢 Media |
| GET /api/admin/commissions/top-products | Top productos por ventas de afiliados | 🟢 Media |
| GET /api/admin/refunds | Listar refunds | 🟡 Alta |
| PATCH /api/admin/refunds/:id | Procesar refund | 🟡 Alta |
| GET /api/admin/audit-logs | Logs de auditoría | 🟡 Alta |
| GET /api/admin/security/2fa-status | Estado 2FA de admins | 🟡 Alta |

---

## 16. User Stories - Seguridad (Addendum)

### US-SEC-001: Auditoría de acciones admin

**Como** Administrador  
**Quiero** que todas mis acciones queden registradas en un log de auditoría  
**Para** auditar cambios, detectar anomalías y cumplir requisitos legales

**Criterios de Aceptación:**
- [ ] Cada CRUD de producto registra: admin_id, acción, recurso_id, old_value, new_value, timestamp, IP, User-Agent
- [ ] Cada cambio de status de payout/refund registra el motivo
- [ ] Los logs son inmutables (no se pueden editar ni eliminar)
- [ ] Endpoint para exportar logs filtrados por rango de fechas y acción
- [ ] Panel de auditoría visible en Admin

---

### US-SEC-002: Sesión segura de admin con timeout

**Como** Administrador  
**Quiero** que mi sesión expire después de inactividad  
**Para** prevenir acceso no autorizado si dejo la sesión abierta

**Criterios de Aceptación:**
- [ ] Timeout de 30 minutos de inactividad
- [ ] Warning a los 25 minutos ofreciendo extender sesión
- [ ] Auto-logout al vencer timeout
- [ ] Refresh token de admin tiene duración de 2 horas máximo

---

### US-SEC-003: 2FA obligatorio para admins

**Como** Administrador  
**Quiero** que el acceso al panel admin requiera autenticación de dos factores  
**Para** asegurar que solo yo pueda acceder con mi identidad verificada

**Criterios de Aceptación:**
- [ ] 2FA obligatorio para usuarios con rol ADMIN
- [ ] Admin sin 2FA configurado no puede acceder al panel
- [ ] Configuración de 2FA visible en perfil de admin
- [ ] Codes de backup disponibles para recuperación

---

### US-SEC-004: Rate limiting específico para admin

**Como** Administrador  
**Quiero** que los endpoints del panel admin tengan límites de requests más estrictos  
**Para** prevenir ataques de fuerza bruta y abuso de la API

**Criterios de Aceptación:**
- [ ] Endpoints de lectura: 100 req/min
- [ ] Endpoints de escritura: 50 req/min
- [ ] Headers de rate limit visibles en respuestas (X-RateLimit-Limit, Remaining, Reset)
- [ ] Bloqueo temporal al superar límite (429 Too Many Requests)

## 17. Definition of Done

Una User Story se considera completa cuando:
- [ ] El código está implementado
- [ ] Los tests unitarios pasan
- [ ] La funcionalidad fue probada manualmente
- [ ] Los criterios de aceptación se cumplen
- [ ] El código fue revisado (code review)

---

**SPEC preparado**: Abril 2026  
**Versión**: 1.0  
**Próximo paso**: Design - Diseño Técnico