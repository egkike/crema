# Endpoints: Admin

## Overview

Endpoints de administración de la plataforma. **Requiere rol ADMIN.**

## Endpoints

---

### Financial Health

```
GET /api/admin/financial-health
```

Obtiene resumen de salud financiera de la plataforma.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "total_revenue": 5000000,
    "pending_payouts": 350000,
    "available_balance": 1500000,
    "refunds_this_month": 45000,
    "active_users": 1250
  }
}
```

---

### Platform Ledger

```
GET /api/admin/ledger
```

Libro mayor de la plataforma.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `from` | date | Fecha inicio |
| `to` | date | Fecha fin |
| `page` | number | Página |

---

### User Stats

```
GET /api/admin/user-stats/:userId
```

Estadísticas de un usuario específico.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "total_sales": 150,
    "total_purchases": 25,
    "total_earnings": 2250000,
    "total_spent": 125000
  }
}
```

---

### Retention Summary

```
GET /api/admin/retention-summary
```

Resumen de retenciones (IVA/IIBB).

**Autenticación:** Requiere access token + rol ADMIN

---

### Pending Payouts

```
GET /api/admin/payouts/pending
```

Lista retiros pendientes.

**Autenticación:** Requiere access token + rol ADMIN

---

### Process Payout

```
PATCH /api/admin/payouts/:id/status
```

Procesa un retiro.

**Autenticación:** Requiere access token + rol ADMIN

**Request Body:**

```json
{
  "status": "approved",
  "notes": "Aprobado para transferencia"
}
```

---

### Withdraw Platform

```
POST /api/admin/withdraw-platform
```

Registra retiro de fondos de la plataforma.

**Autenticación:** Requiere access token + rol ADMIN

**Request Body:**

```json
{
  "amount": 100000,
  "currency": "ARS",
  "description": "Retiro mensual",
  "transaction_receipt": "recibo-123.pdf"
}
```

---

### LEC: Get RD Projects

```
GET /api/admin/lec/projects
```

Lista proyectos de I+D para Ley de Economía del Conocimiento.

**Autenticación:** Requiere access token + rol ADMIN

---

### LEC: Log RD Activity

```
POST /api/admin/lec/rd-logs
```

Registra horas de desarrollo para auditoría LEC.

**Autenticación:** Requiere access token + rol ADMIN

**Request Body:**

```json
{
  "project_id": "uuid",
  "developer_id": "uuid",
  "hours_spent": 8,
  "task_description": "Implementación de API de pagos",
  "code_commit_ref": "https://github.com/..."
}
```

---

### LEC: Compliance Status

```
GET /api/admin/lec/compliance-status
```

Estado de cumplimiento de la Ley de Economía del Conocimiento.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "investment_ratio": 4.5,
    "required_ratio": 3.0,
    "status": "compliant",
    "total_hours": 1250,
    "total_investment": 1125000,
    "gross_revenue": 25000000
  }
}
```

---

### Export: Tax Report

```
GET /api/admin/export/tax-report
```

Reporte de impuestos (Libro IVA Ventas).

**Autenticación:** Requiere access token + rol ADMIN

**Response:** CSV file download

---

### Export: Financial Audit

```
GET /api/admin/export/audit
```

Reporte de conciliación financiera.

**Autenticación:** Requiere access token + rol ADMIN

---

### Export: Refunds

```
GET /api/admin/export/refunds
```

Historial de reembolsos.

**Autenticación:** Requiere access token + rol ADMIN

---

### Export: Payouts

```
GET /api/admin/export/payouts
```

Historial de retiros.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `currency` | string | Moneda (requerido) |
| `status` | string | Estado |
| `from` | date | Fecha inicio |
| `to` | date | Fecha fin |

---

### Export: LEC Report

```
GET /api/admin/export/lec-report
```

Reporte de cumplimiento LEC.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Default |
|-------|------|---------|
| `month` | number | Mes actual |
| `year` | number | Año actual |

---

## Roles de Admin

| Rol | Descripción |
|-----|-------------|
| `ADMIN` | Administrador general |
| `ADMIN_LEVEL_10` | Nivel máximo |

---

## Gestión de Productos

### List Products

```
GET /api/admin/products
```

Lista todos los productos de la plataforma con filtros y paginación.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `search` | string | Buscar por título |
| `type` | string | Tipo de producto (course, ebook, etc.) |
| `status` | string | Estado (draft, published, archived) |
| `creator_id` | uuid | Filtrar por creador |
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 20) |

**Response (200):**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

### Get Product

```
GET /api/admin/products/:id
```

Ver detalle de un producto específico.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Curso de React",
    "description": "...",
    "status": "published",
    "creator_id": "uuid",
    "creator": { "id": "uuid", "fullname": "Juan Pérez", "email": "juan@..." },
    "price": 25000,
    "currency": "ARS",
    "affiliate_commission_percent": 30,
    "stats": { "total_sales": 150, "total_revenue": 3750000 }
  }
}
```

---

### Update Product

```
PATCH /api/admin/products/:id
```

Editar información de un producto.

**Autenticación:** Requiere access token + rol ADMIN

**Request Body:**

```json
{
  "title": "Nuevo título",
  "description": "Nueva descripción",
  "status": "published",
  "affiliate_commission_percent": 35
}
```

**Campos editables:** `title`, `description`, `status`, `affiliate_commission_percent`

**Response (200):**

```json
{
  "success": true,
  "data": { ... },
  "message": "Producto actualizado correctamente"
}
```

---

## Gestión de Órdenes

### List Orders

```
GET /api/admin/orders
```

Lista todas las órdenes de la plataforma con filtros y paginación.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `status` | string | Estado (pending, paid, refunded, etc.) |
| `currency` | string | Moneda (ARS, USDT) |
| `from` | date | Fecha inicio |
| `to` | date | Fecha fin |
| `buyer_id` | uuid | Filtrar por comprador |
| `product_id` | uuid | Filtrar por producto |
| `page` | number | Página (default: 1) |
| `limit` | number | Items por página (default: 20) |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "buyer_id": "uuid",
      "product_id": "uuid",
      "amount": 25000,
      "currency": "ARS",
      "status": "paid",
      "payment_method": "mercadopago",
      "buyer": { "id": "uuid", "fullname": "Cliente X", "email": "cliente@..." },
      "product": { "id": "uuid", "title": "Curso de React", "type": "course" },
      "affiliate": { "id": "uuid", "fullname": "Afiliado Y" },
      "created_at": "2026-04-06T..."
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 500, "totalPages": 25 }
}
```

---

### Get Order

```
GET /api/admin/orders/:id
```

Ver detalle de una orden específica con todos los datos relacionados.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "buyer_id": "uuid",
    "product_id": "uuid",
    "affiliate_id": "uuid",
    "amount": 25000,
    "currency": "ARS",
    "original_amount": 25000,
    "discount_applied": 0,
    "commission_amount": 2500,
    "status": "paid",
    "payment_method": "mercadopago",
    "external_reference": "ref-123",
    "gateway_fee": 500,
    "gateway_tax": 200,
    "net_platform_profit": 1800,
    "transaction_id": "tx-456",
    "commissions_calculated": true,
    "balance_released": false,
    "is_guarantee_eligible": true,
    "release_at": "2026-04-13T...",
    "created_at": "2026-04-06T...",
    "buyer": { "id": "uuid", "fullname": "Cliente X", "email": "cliente@..." },
    "product": { "id": "uuid", "title": "Curso de React", "type": "course", "creator_id": "uuid" },
    "affiliate": { "id": "uuid", "fullname": "Afiliado Y", "email": "afiliado@..." },
    "creator_commission": { "id": "uuid", "user_id": "uuid", "type": "creator", "amount": 2500, "fee_applied": 250, "net_amount": 2250 },
    "affiliate_commission": { "id": "uuid", "user_id": "uuid", "type": "affiliate", "amount": 750, "fee_applied": 75, "net_amount": 675 }
  }
}
```

---

## Gestión de Comisiones

### Commission Stats

```
GET /api/admin/commissions/stats
```

Obtiene estadísticas de comisiones de la plataforma.

**Autenticación:** Requiere access token + rol ADMIN

**Response (200):**

```json
{
  "success": true,
  "data": {
    "totalPaid": 1500000,
    "totalPending": 250000,
    "totalRefunded": 50000,
    "totalCreatorCommissions": 1000000,
    "totalAffiliateCommissions": 500000
  }
}
```

---

### Top Products by Affiliate Sales

```
GET /api/admin/commissions/top-products
```

Obtiene el top de productos por ventas de afiliados.

**Autenticación:** Requiere access token + rol ADMIN

**Query Params:**

| Param | Tipo | Default |
|-------|------|---------|
| `limit` | number | 10 |

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "product_title": "Curso de Marketing",
      "product_type": "course",
      "order_count": 45,
      "affiliate_count": 12,
      "total_affiliate_earnings": 135000
    }
  ]
}
```

---

## Ver También

- [Features: Compliance](../../features/compliance.md)
- [Errores](../errors.md)
