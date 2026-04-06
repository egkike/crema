# Análisis de Factibilidad Técnica - Frontends Crema

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Proyecto**: frontend-main + frontend-admin  
**Owner**: Kike García

---

## 1. Visión General

Este documento analiza la factibilidad técnica de desarrollar los dos frontends de Crema (frontend-main y frontend-admin) basándose en la implementación existente del backend.

---

## 2. Stack Tecnológico Recomendado

### 2.1 Stack Principal

| Capa | Tecnología | Justificación |
|------|------------|---------------|
| **Framework** | Astro + React | Islands architecture, SSG/SSR híbrido |
| **Styling** | Tailwind CSS | Dark mode, warm palette (crema/naranja/café) |
| **Icons** | Tabler Icons | Según AGENTS.md |
| **State** | Zustand | Simple, TypeScript-native, atomic |
| **Forms** | React Hook Form + Zod | Validación client-side |
| **Charts** | Recharts | Popular, fácil integración |
| **Tables** | TanStack Table | Pagination, sorting, filtering |

### 2.2 Servicios Externos

| Servicio | Plan | Costo inicial |
|----------|------|---------------|
| **Video (Mux)** | Free tier | $0 hasta scale |
| **Hosting (Vercel)** | Free tier | $0 |
| **DB (PostgreSQL)** | Localhost/Docker | $0 |
| **Redis** | Localhost/Docker | $0 |
| **AI (OpenAI)** | Pay-as-you-go | ~$1-5/mes |

---

## 3. Análisis por Frontend

### 3.1 frontend-main (Tienda + Dashboard Creator)

#### Endpoints Requeridos

| Área | Endpoints |
|------|------------|
| **Auth** | `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/2fa/*` |
| **Usuario** | `/api/users/me`, PATCH, DELETE |
| **Productos** | `/api/products/*` (CRUD, marketplace) |
| **Pagos** | `/api/payments/create-preference`, webhook, subscribe |
| **Learning** | `/api/learning/*` (dashboard, contenido, progreso) |
| **Balance** | `/api/balances/*` (me, stats, history) |
| **Payouts** | `/api/payouts/*` (create, me, cancel) |
| **Afiliados** | `/api/affiliates/*` (portfolio) |
| **AI** | `/api/ai/*` (credits, embeddings, qa, tutor, insights) |

#### Viabilidad

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Endpoints | ✅ Completos | Todos los needed existen |
| Auth JWT | ✅ Soportado | Access + Refresh tokens |
| 2FA | ✅ Soportado | Flow requerido en frontend |
| Video streaming | ✅ Mux | URLs firmadas |
| AI streaming | ✅ SSE | Q&A, Tutor, Insights |
| Guest checkout | ✅ Se auto-registra | Según spec |

#### Challenges

- **2FA Flow**: Login → 2FA required → verify → redirect
- **Video**: Integrar player con URLs firmadas
- **AI**: Chat interfaces con streaming SSE

---

### 3.2 frontend-admin (Panel de Administración)

#### Endpoints Requeridos

| Área | Endpoints |
|------|------------|
| **Dashboard** | `/api/admin/dashboard`, `/api/admin/financial-health` |
| **Usuarios** | `/api/admin/users`, PATCH level/ban |
| **Productos** | `/api/admin/products`, CRUD |
| **Órdenes** | `/api/admin/orders`, refunds |
| **Balance** | `/api/admin/balance`, `/api/admin/ledger` |
| **Payouts** | `/api/admin/payouts/pending`, approve/reject |
| **AI Stats** | `/api/ai/credits/stats`, `/api/admin/ai-usage` |
| **Config** | `/api/admin/config` |
| **Export** | `/api/admin/export/audit` |

#### Viabilidad

| Aspecto | Estado | Notas |
|---------|--------|-------|
| Endpoints | ✅ Completos | Todos los needed existen |
| Gráficos | ✅ Viables | Recharts funciona bien |
| Tablas grandes | ✅ Viables | TanStack Table con pagination |
| Export CSV | ✅ Disponible | Backend genera |
| Real-time | ⚠️ No disponible | No hay WebSocket |

#### Módulos MVP

| Módulo | Prioridad |
|--------|-----------|
| Dashboard + charts | 🔴 Critical |
| Gestión usuarios | 🔴 Critical |
| Gestión productos | 🔴 Critical |
| Órdenes + refunds | 🔴 Critical |
| Balance + ledger | 🟡 Alta |
| Payouts workflow | 🟡 Alta |
| AI Stats | 🟢 Media |
| Configuración | 🟢 Media |

#### Timeline Estimado

| Módulo | Días |
|--------|------|
| Setup + Auth | 1 |
| Dashboard + charts | 1-2 |
| Usuarios CRUD | 1-2 |
| Productos CRUD | 1-2 |
| Órdenes + refunds | 1-2 |
| Balance + ledger | 1-2 |
| Payouts | 1-2 |
| AI Stats | 1 |
| Config | 1 |
| **Total MVP** | **10-15 días** |

---

## 4. Auth - JWT + 2FA

### Flujo en Frontend SPA

```
1. User → POST /api/auth/login
2. If 2FA required:
   - Show 2FA input
   - POST /api/auth/login/2fa
   - Set access_token in memory
   - Set refresh_token in httpOnly cookie
3. Else:
   - Set access_token in memory
   - Set refresh_token in httpOnly cookie

4. For API calls:
   - Use access_token from memory
   - If 401 → call /api/auth/refresh silently
   - If refresh fails → redirect to login
```

### Implementación Recomendada

- **Access token**: Zustand store (memory)
- **Refresh**: Custom hook con automatic retry
- **2FA**: Component separate del login

---

## 5. Video Streaming

### Proveedor: Mux

| Aspecto | Detalle |
|---------|---------|
| **Setup** | Cuenta gratuita ya disponible |
| **Playback** | URLs firmadas desde backend |
| **Frontend** | Mux Player React component |
| **Signed URLs** | Backend genera, frontend consume |

### Flujo

```
1. Frontend → GET /api/learning/content/:lessonId
2. Backend → Verifica acceso + genera signed URL
3. Frontend → Reproduce en Mux Player
```

---

## 6. AI Integration

### Endpoints con Streaming SSE

| Feature | Endpoint |
|---------|----------|
| Q&A Agent | `/api/ai/agents/qa/chat/stream` |
| Tutor | `/api/ai/products/:id/tutor/chat/stream` |
| Insights | `/api/ai/insights/query/stream` |

### Frontend Implementation

```typescript
// Ejemplo de consumo SSE
const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${token}` }
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  // Parsear eventos SSE
}
```

---

## 7. Pagos

### MercadoPago

| Paso | Frontend |
|------|----------|
| 1. Checkout | POST /api/payments/create-preference |
| 2. Redirect | Usuario va a MP |
| 3. Return | Volver a /checkout/success |
| 4. Webhook | Backend notifica |

### Blockonomics (USDT)

| Paso | Frontend |
|------|----------|
| 1. Generar | POST /api/payments/create-crypto-order |
| 2. Mostrar wallet | Dirección USDT |
| 3. Esperar | Pending state |
| 4. Confirmación | Webhook notifica |

---

## 8. Conclusiones

### Factibilidad General

| Frontend | Estado | Timeline |
|----------|--------|----------|
| **frontend-admin** | ✅ Viable | 2-3 semanas |
| **frontend-main** | ✅ Viable | 3-4 semanas |

### Recomendaciones

1. **Orden de desarrollo**: Admin primero → Main después
2. **Dev environment**: Localhost con Docker (DB + Redis)
3. **Testing**: Vitest + Playwright
4. **CI/CD**: GitHub Actions + Vercel

---

## 9. Documentos Relacionados

- `docs/project/brand-product-spec.md` - Spec de producto
- `docs/project/ai-features/PRD.md` - AI Features
- `docs/project/ai-streaming-sse/PRD.md` - Streaming SSE
- `backend/README.md` - API Reference

---

**Documento preparado**: Abril 2026  
**Versión**: 1.0  
**Próximo paso**: SDD del frontend-admin