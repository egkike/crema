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

## Ver También

- [Features: Compliance](../../features/compliance.md)
- [Errores](../errors.md)
