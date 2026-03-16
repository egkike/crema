# Esquema de Base de Datos

## Overview

La base de datos de Crema usa PostgreSQL con un esquema relacional que soporta múltiples monedas, productos digitales, afiliados, pagos y cumplimiento fiscal.

## Diagrama de Relaciones

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    users    │     │   orders    │     │ commissions │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ id (PK)     │◄────│ buyer_id    │     │ id (PK)     │
│ username    │     │ creator_id  │     │ user_id     │
│ email       │     │ affiliate_id│     │ order_id    │
│ password    │     │ product_id  │     └──────┬──────┘
│ level       │     │ amount      │            │
│ tax_id      │     │ status      │            │
└──────┬──────┘     └──────┬──────┘            │
       │                   │                   │
       │            ┌──────▼──────┐            │
       │            │  products   │            │
       │            ├─────────────┤            │
       │            │ id (PK)     │            │
       └───────────►│ creator_id  │◄───────────┘
                    │ title       │
                    │ type        │
                    │ status      │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │  modules   │ │   prices   │ │  coupons   │
    ├────────────┤ ├────────────┤ ├────────────┤
    │ product_id │ │ product_id │ │ product_id │
    │ title      │ │ currency   │ │ code       │
    │ order_index│ │ amount     │ │ discount   │
    └─────┬──────┘ └────────────┘ └────────────┘
          │
          ▼
    ┌────────────┐     ┌────────────┐     ┌─────────────┐
    │  lessons   │     │ quizzes    │     │ certificates│
    ├────────────┤     ├────────────┤     ├─────────────┤
    │ module_id  │     │ lesson_id  │     │ user_id     │
    │ title      │     │ questions  │     │ product_id  │
    │ content    │     │ passing    │     │ code        │
    │ type       │     │ attempts   │     └─────────────┘
    └────────────┘     └────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│user_balances│     │  payouts    │     │   refunds   │
├─────────────┤     ├─────────────┤     ├─────────────┤
│ user_id     │     │ user_id     │     │ order_id    │
│ currency    │     │ amount      │     │ seller_id   │
│ available   │     │ status      │     │ buyer_id    │
│ pending     │     │ destination │     │ amount      │
└─────────────┘     └─────────────┘     └─────────────┘
```

---

## Tablas de Autenticación y Usuarios

### users

Tabla principal de usuarios.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK - Identificador único |
| `username` | VARCHAR(50) | No | Username único |
| `email` | VARCHAR(100) | No | Email único |
| `fullname` | VARCHAR(100) | Sí | Nombre completo |
| `password` | TEXT | No | Hash de contraseña |
| `level` | INT | No | Nivel de usuario (default 1) |
| `active` | INT | No | Estado de cuenta (0=inactivo, 1=activo) |
| `affiliate_slug` | VARCHAR(50) | Sí | Slug único para referidos |
| `tax_id` | VARCHAR(11) | Sí | CUIT/CUIL |
| `tax_condition` | VARCHAR(50) | No | Condición fiscal (ri, monotax, exempt) |
| `must_change_password` | BOOLEAN | No | Forzar cambio de contraseña |
| `verification_token` | TEXT | Sí | Token de verificación de email |
| `two_factor_secret` | TEXT | Sí | Secreto 2FA |
| `two_factor_enabled` | BOOLEAN | No | 2FA habilitado |
| `two_factor_backup_codes` | JSONB | No | Códigos de backup 2FA |

### refresh_tokens

Tokens de refresh para sesión.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `token_hash` | TEXT | No | Hash del token |
| `expires_at` | TIMESTAMP | No | Fecha de expiración |
| `revoked` | BOOLEAN | No | Token revocado |
| `ip_address` | VARCHAR(45) | Sí | IP del dispositivo |
| `device_type` | VARCHAR(50) | Sí | Tipo de dispositivo |

### activity_logs

Historial de actividad para auditoría.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `action` | VARCHAR(50) | No | Acción (LOGIN_SUCCESS, etc.) |
| `ip_address` | VARCHAR(45) | Sí | IP |
| `user_agent` | TEXT | Sí | User agent |

---

## Tablas de Productos

### products

Productos digitales.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `creator_id` | UUID | No | FK → users.id |
| `title` | VARCHAR(255) | No | Título |
| `description` | TEXT | Sí | Descripción |
| `type` | VARCHAR(50) | No | Tipo (course, ebook, etc.) |
| `content_url` | TEXT | Sí | URL del contenido |
| `affiliate_commission_percent` | DECIMAL(18,8) | No | % comisión afiliados |
| `slug` | VARCHAR(100) | Sí | URL amigable |
| `size_bytes` | BIGINT | No | Tamaño |
| `has_structured_content` | BOOLEAN | No | Tiene módulos/lecciones |
| `status` | VARCHAR(50) | No | draft, published, archived |
| `guarantee_days` | INT | Sí | Días de garantía |

### product_modules

Módulos/secciones del producto.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `title` | VARCHAR(255) | No | Título del módulo |
| `order_index` | INT | No | Orden |

### product_lessons

Lecciones dentro de módulos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `module_id` | UUID | No | FK → product_modules.id |
| `title` | VARCHAR(255) | No | Título |
| `content_type` | VARCHAR(20) | No | video, pdf, text, quiz, link |
| `content_url` | TEXT | Sí | URL del contenido |
| `duration_seconds` | INT | No | Duración en segundos |
| `body_text` | TEXT | Sí | Contenido de texto |
| `order_index` | INT | No | Orden |
| `is_preview` | BOOLEAN | No | Es lección gratuita |

### product_lessons_quizzes

Quizzes de lecciones.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `lesson_id` | UUID | No | FK → product_lessons.id |
| `questions` | JSONB | No | Array de preguntas |
| `passing_score` | INT | No | % mínimo para aprobar |
| `max_attempts` | INT | Sí | Intentos máximos (null=ilimitado) |

### product_coupons

Cupones de descuento.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `creator_id` | UUID | No | FK → users.id |
| `code` | VARCHAR(20) | No | Código del cupón |
| `discount_percent` | DECIMAL(18,8) | No | % de descuento (max 20%) |
| `max_uses` | INT | No | Usos máximos |
| `current_uses` | INT | No | Usos actuales |
| `expires_at` | TIMESTAMP | No | Fecha de expiración |

---

## Tablas de Órdenes y Pagos

### orders

Órdenes de compra.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `buyer_id` | UUID | No | FK → users.id |
| `product_id` | UUID | No | FK → products.id |
| `affiliate_id` | UUID | Sí | FK → users.id (referido) |
| `amount` | DECIMAL(18,8) | No | Monto final |
| `original_amount` | DECIMAL(18,8) | Sí | Monto sin descuento |
| `coupon_id` | UUID | Sí | FK → product_coupons.id |
| `discount_applied` | DECIMAL(18,8) | No | Descuento aplicado |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `commission_amount` | DECIMAL(18,8) | Sí | Monto de comisión |
| `status` | VARCHAR(50) | No | pending, paid, refunded |
| `payment_method` | VARCHAR(50) | Sí | Método de pago |
| `transaction_id` | TEXT | Sí | ID de transacción |
| `gateway_fee` | DECIMAL(18,8) | No | Fee del gateway |
| `gateway_tax` | DECIMAL(18,8) | No | Impuesto del gateway |
| `net_platform_profit` | DECIMAL(18,8) | No | Ganancia neta plataforma |
| `is_guarantee_eligible` | BOOLEAN | No | Elegible para garantía |
| `release_at` | TIMESTAMP | Sí | Fecha de liberación de fondos |

### refunds

Reembolsos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `order_id` | UUID | No | FK → orders.id |
| `seller_id` | UUID | No | FK → users.id |
| `buyer_id` | UUID | No | FK → users.id |
| `amount` | DECIMAL(18,8) | No | Monto |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `reason` | TEXT | Sí | Razón del reembolso |

---

## Tablas Financieras

### user_balances

Saldos de usuarios.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `user_id` | UUID | No | FK → users.id |
| `currency` | VARCHAR(10) | No | Moneda |
| `total_earned` | DECIMAL(18,8) | No | Total ganado |
| `available_balance` | DECIMAL(18,8) | No | Disponible para retiro |
| `pending_balance` | DECIMAL(18,8) | No | Pendiente (en garantía) |

**PK Compuesta:** (user_id, currency)

### balance_history

Historial de movimientos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `order_id` | UUID | Sí | FK → orders.id |
| `amount` | DECIMAL(18,8) | No | Monto |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `type` | VARCHAR(50) | No | Tipo de movimiento |
| `description` | TEXT | Sí | Descripción |

### commissions

Comisiones de creadores y afiliados.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `order_id` | UUID | No | FK → orders.id |
| `amount` | DECIMAL(18,8) | No | Monto bruto |
| `fee_applied` | DECIMAL(18,8) | No | Fee de plataforma |
| `net_amount` | DECIMAL(18,8) | No | Monto neto |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `type` | VARCHAR(20) | No | creator o affiliate |
| `status` | VARCHAR(50) | No | pending, paid, refunded |

### payouts

Solicitudes de retiro.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `amount` | DECIMAL(18,8) | No | Monto |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `status` | VARCHAR(20) | No | pending, processing, completed, rejected |
| `destination_account` | TEXT | No | CBU/CVU/Dirección crypto |
| `bank_name` | VARCHAR(100) | Sí | Banco |
| `account_holder` | VARCHAR(100) | Sí | Titular |
| `tax_id` | VARCHAR(50) | Sí | CUIT/CUIL |
| `transaction_receipt` | TEXT | Sí | Comprobante |

### platform_earnings

Ganancias de la plataforma.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `order_id` | UUID | Sí | FK → orders.id |
| `variable_amount` | DECIMAL(18,8) | No | % variable |
| `fixed_amount` | DECIMAL(18,8) | No | Monto fijo |
| `tax_amount` | DECIMAL(18,8) | No | Impuesto |
| `total_amount` | DECIMAL(18,8) | No | Total |
| `net_profit` | DECIMAL(18,8) | No | Ganancia neta |
| `currency` | VARCHAR(10) | Sí | Moneda |
| `status` | VARCHAR(20) | No | active, paid, refunded |

---

## Tablas de LMS

### user_lessons_progress

Progreso de estudiantes.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `user_id` | UUID | No | FK → users.id |
| `lesson_id` | UUID | No | FK → product_lessons.id |
| `product_id` | UUID | No | FK → products.id |
| `completed_at` | TIMESTAMP | Sí | Fecha de completitud |

**PK Compuesta:** (user_id, lesson_id)

### user_quiz_attempts

Intentos de quizzes.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `quiz_id` | UUID | No | FK → product_lesson_quizzes.id |
| `score` | INT | No | Puntaje (0-100) |
| `passed` | BOOLEAN | No | Aprobado |
| `answers` | JSONB | Sí | Respuestas |

### user_certificates

Certificados emitidos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `product_id` | UUID | No | FK → products.id |
| `certificate_code` | UUID | No | Código único |
| `issued_at` | TIMESTAMP | No | Fecha de emisión |

**PK Compuesta:** (user_id, product_id)

---

## Tablas de Configuración

### enabled_currencies

Monedas habilitadas.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `code` | VARCHAR(10) | No | PK (ARS, USD, USDT) |
| `name` | VARCHAR(50) | No | Nombre |
| `symbol` | VARCHAR(5) | No | Símbolo |
| `is_active` | BOOLEAN | No | Habilitada |

### payment_gateways

Pasarelas de pago.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | VARCHAR(50) | No | PK (mercadopago, simulator) |
| `name` | VARCHAR(100) | No | Nombre |
| `liquidity_delay_days` | INT | No | Días de retardo |
| `is_active` | BOOLEAN | No | Habilitada |

### platform_plans

Planes de la plataforma.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `name` | VARCHAR(50) | No | Nombre |
| `level_required` | INT | No | Nivel requerido |
| `is_free` | BOOLEAN | No | Es gratuito |
| `features` | JSONB | No | Beneficios JSON |

### product_types

Tipos de productos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | VARCHAR(50) | No | PK (course, ebook, etc.) |
| `name` | VARCHAR(100) | No | Nombre |
| `is_active` | BOOLEAN | No | Habilitado |

---

## Tablas LEC (Cumplimiento Fiscal)

### lec_rd_projects

Proyectos de I+D.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `project_name` | VARCHAR(100) | No | Nombre |
| `category` | VARCHAR(50) | No | Categoría |
| `description` | TEXT | Sí | Descripción |
| `start_date` | DATE | No | Fecha inicio |
| `end_date` | DATE | Sí | Fecha fin |

### lec_rd_logs

Logs de desarrollo I+D.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `project_id` | UUID | Sí | FK → lec_rd_projects.id |
| `developer_id` | UUID | Sí | FK → users.id |
| `hours_spent` | DECIMAL(5,2) | No | Horas invertidas |
| `task_description` | TEXT | Sí | Descripción |
| `code_commit_ref` | TEXT | Sí | Referencia de commit |

---

## Ver También

- [Políticas de Migraciones](./migrations.md)
- [Features: Compliance](../../features/compliance.md)
