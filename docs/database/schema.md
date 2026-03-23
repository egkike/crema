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

---

## Tablas de AI Features (v1.2 - Marzo 2026)

> ⚠️ Estas tablas fueron implementadas en el backend. Requieren extensión `pgvector` instalada.

### AI Credits System

#### ai_credits
Créditos prepagos para features de IA.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `balance` | INT | No | Créditos disponibles |
| `expires_at` | TIMESTAMP | No | Fecha de expiración |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### ai_credit_transactions
Historial de transacciones de créditos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `amount` | INT | No | Cantidad (+ compra, - uso) |
| `type` | VARCHAR(20) | No | purchase, usage, refund, bonus |
| `description` | TEXT | Sí | Descripción |
| `reference_id` | UUID | Sí | Referencia opcional |
| `created_at` | TIMESTAMP | No | |

#### ai_credit_packages
Paquetes de créditos disponibles.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `name` | VARCHAR(100) | No | Starter, Professional, Enterprise |
| `credits` | INT | No | Créditos incluidos |
| `price_usd` | DECIMAL(18,8) | No | Precio en USD |
| `price_ars` | DECIMAL(18,8) | Sí | Precio en ARS |
| `is_active` | BOOLEAN | No | |

---

### Crema Memory Service (Embeddings)

#### ai_embeddings
Tabla unificada de embeddings para búsqueda semántica.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | Sí | FK → users.id |
| `source_type` | VARCHAR(50) | No | lesson, faq, policy, qa, review, insight |
| `source_id` | UUID | No | ID del objeto original |
| `content` | TEXT | No | Texto original |
| `embedding` | vector(1536) | Sí | Embedding de pgvector |
| `metadata` | JSONB | Sí | Metadatos específicos por tipo |
| `created_at` | TIMESTAMP | No | |

> 📝 **Nota**: Require índice IVFFlat para búsqueda de similitud coseno.

---

### Q&A System

#### product_questions
Preguntas de usuarios sobre productos.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `user_id` | UUID | No | FK → users.id |
| `question` | TEXT | No | Pregunta |
| `answer` | TEXT | Sí | Respuesta del creador |
| `answered_by` | UUID | Sí | FK → users.id (creator) |
| `answered_at` | TIMESTAMP | Sí | |
| `is_published` | BOOLEAN | No | Visible en producto |
| `is_ai_generated` | BOOLEAN | No | Generada por IA |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### question_votes
Votos de utilidad en preguntas.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `question_id` | UUID | No | FK → product_questions.id |
| `user_id` | UUID | No | FK → users.id |
| `vote_type` | VARCHAR(10) | No | helpful, not_helpful |

#### product_faqs
FAQs predefinidas por el creador.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `question` | VARCHAR(500) | No | Pregunta |
| `answer` | TEXT | No | Respuesta |
| `sort_order` | INT | No | Orden de显示 |
| `is_active` | BOOLEAN | No | |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

---

### Reviews/Ratings

#### product_reviews
Reviews de compradores.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `user_id` | UUID | No | FK → users.id |
| `rating` | INT | No | 1-5 estrellas |
| `title` | VARCHAR(200) | Sí | Título de la review |
| `content` | TEXT | No | Contenido |
| `is_verified_purchase` | BOOLEAN | No | Verificación de compra |
| `is_published` | BOOLEAN | No | Visible |
| `is_ai_generated` | BOOLEAN | No | Generada por IA |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### review_votes
Votos útiles en reviews.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `review_id` | UUID | No | FK → product_reviews.id |
| `user_id` | UUID | No | FK → users.id |
| `vote_type` | VARCHAR(10) | No | helpful, not_helpful |

#### product_review_settings
Configuración de reviews por producto.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `allow_reviews` | BOOLEAN | No | Permitir reviews |
| `require_verified_purchase` | BOOLEAN | No | Require compra verificada |
| `auto_publish` | BOOLEAN | No | Auto-publicar |
| `min_rating` | INT | No | Rating mínimo |
| `max_rating` | INT | No | Rating máximo |

---

### Denunciations

#### reports
Denuncias de contenido.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `reporter_id` | UUID | No | FK → users.id |
| `content_type` | VARCHAR(50) | No | product, review, question, etc. |
| `content_id` | UUID | No | ID del contenido reportado |
| `reason_code` | VARCHAR(50) | No | Código del motivo |
| `description` | TEXT | Sí | Descripción |
| `status` | VARCHAR(20) | No | pending, investigating, resolved, rejected |
| `resolved_by` | UUID | Sí | FK → users.id (admin) |
| `resolved_at` | TIMESTAMP | Sí | |
| `resolution_notes` | TEXT | Sí | |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### report_reasons
Catálogo de motivos de denuncia.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `content_type` | VARCHAR(50) | No | Tipo de contenido |
| `code` | VARCHAR(50) | No | Código único |
| `label_es` | VARCHAR(100) | No | Etiqueta español |
| `label_en` | VARCHAR(100) | No | Etiqueta inglés |
| `severity` | VARCHAR(20) | No | low, medium, high, critical |
| `is_active` | BOOLEAN | No | |

#### report_actions
Acciones tomadas sobre denuncias.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `report_id` | UUID | No | FK → reports.id |
| `action_type` | VARCHAR(50) | No | warning, suspend, ban, delete_content, etc. |
| `performed_by` | UUID | No | FK → users.id |
| `notes` | TEXT | Sí | |
| `created_at` | TIMESTAMP | No | |

#### content_policies
Políticas de contenido visibles a usuarios.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `title_es` | VARCHAR(200) | No | Título español |
| `title_en` | VARCHAR(200) | No | Título inglés |
| `content_es` | TEXT | No | Contenido español |
| `content_en` | TEXT | No | Contenido inglés |
| `content_type` | VARCHAR(50) | No | general, review, product, etc. |
| `is_active` | BOOLEAN | No | |
| `sort_order` | INT | No | |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

---

### AI Agents

#### product_qa_agent_config
Configuración del agente Q&A por producto.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `is_enabled` | BOOLEAN | No | Agente habilitado |
| `model` | VARCHAR(50) | No | gpt-4, etc. |
| `system_prompt` | TEXT | Sí | Prompt personalizado |
| `temperature` | FLOAT | No | 0-2 |
| `max_tokens` | INT | No | |
| `use_memory` | BOOLEAN | No | Usar embeddings |
| `use_faqs` | BOOLEAN | No | Usar FAQs |

#### agent_conversations
Conversaciones con agentes IA.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `agent_type` | VARCHAR(50) | No | qa, tutor, insights |
| `product_id` | UUID | Sí | FK → products.id |
| `user_id` | UUID | No | FK → users.id |
| `status` | VARCHAR(20) | No | active, completed, archived |
| `metadata` | JSONB | Sí | |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### agent_messages
Mensajes de conversaciones.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `conversation_id` | UUID | No | FK → agent_conversations.id |
| `role` | VARCHAR(20) | No | user, assistant, system |
| `content` | TEXT | No | |
| `tokens_used` | INT | No | |
| `created_at` | TIMESTAMP | No | |

---

### Analytics Dashboard

#### creator_daily_metrics
Métricas diarias agregadas por creador.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `creator_id` | UUID | No | FK → users.id |
| `date` | DATE | No | |
| `total_sales` | INT | No | |
| `total_revenue` | DECIMAL(18,8) | No | |
| `total_commissions` | DECIMAL(18,8) | No | |
| `new_customers` | INT | No | |
| `active_customers` | INT | No | |
| `product_views` | INT | No | |
| `conversion_rate` | FLOAT | No | |
| `ai_credits_used` | INT | No | |

---

### Advanced AI (Tutor + Insights)

#### product_tutor_config
Configuración del Tutor AI por producto.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `product_id` | UUID | No | FK → products.id |
| `is_enabled` | BOOLEAN | No | |
| `model` | VARCHAR(50) | No | |
| `system_prompt` | TEXT | Sí | |
| `temperature` | FLOAT | No | |
| `max_tokens` | INT | No | |

#### tutor_insights
Insights generados por el Tutor.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `product_id` | UUID | No | FK → products.id |
| `insight_type` | VARCHAR(50) | No | progress, recommendation, etc. |
| `content` | TEXT | No | |
| `is_read` | BOOLEAN | No | |
| `created_at` | TIMESTAMP | No | |

#### creator_dashboards
Dashboards guardados por creadores.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `creator_id` | UUID | No | FK → users.id |
| `name` | VARCHAR(100) | No | |
| `description` | TEXT | Sí | |
| `config` | JSONB | No | Configuración del dashboard |
| `is_default` | BOOLEAN | No | Dashboard por defecto |
| `created_at` | TIMESTAMP | No | |
| `updated_at` | TIMESTAMP | No | |

#### insights_history
Historial de queries de insights.

| Columna | Tipo | Nullable | Descripción |
|---------|------|----------|-------------|
| `id` | UUID | No | PK |
| `user_id` | UUID | No | FK → users.id |
| `query` | TEXT | No | Query en lenguaje natural |
| `sql_generated` | TEXT | Sí | SQL generado por IA |
| `results` | JSONB | Sí | Resultados |
| `created_at` | TIMESTAMP | No | |
