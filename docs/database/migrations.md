# Políticas de Migraciones

## Overview

Este documento describe las políticas y prácticas para gestionar el esquema de base de datos de Crema.

## Estructura de Archivos SQL

```
backend/db/
└── init/
    ├── 01-create-tables.sql   # Esquema base (tablas)
    ├── 02-create-indexes.sql   # Índices
    └── 03-create-seeds.sql     # Datos iniciales
```

---

## Principios

### 1. Inmutabilidad
Los archivos en `init/` **nunca se modifican** después de ser ejecutados en producción.
- Si necesitas un cambio, creas una nueva migración
- Los archivos `init/` son solo para schema inicial

### 2. Migration Files (Próximamente)
Cuando el proyecto crezca, se usará un sistema de migraciones:

```
backend/db/migrations/
├── 001_add_new_column.sql
├── 002_create_new_table.sql
└── 003_update_constraints.sql
```

### 3. Rollbacks
Cada migración debe incluir:
- `UP`: El cambio a aplicar
- `DOWN`: El cambio inverso (para rollback)

---

## Convenciones de Nombres

### Tablas
- **Nombre**: snake_case plural
- **Ejemplos**: `users`, `user_balances`, `product_lessons`

### Columnas
- **Nombre**: snake_case
- **Ejemplos**: `created_at`, `user_id`, `is_active`

### Constraints
- **PK**: `pk_{tabla}` (ej: `pk_users`)
- **FK**: `fk_{tabla}_{columna}` (ej: `fk_orders_buyer_id`)
- **UK**: `uk_{tabla}_{columna}` (ej: `uk_users_email`)
- **Check**: `chk_{tabla}_{descripcion}`

### Índices
- **Nombre**: `idx_{tabla}_{columna}` (ej: `idx_orders_user_id`)

---

## Tipos de Datos

### UUIDs
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

### Timestamps
```sql
created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
```

### Monetary (Dinero)
```sql
amount DECIMAL(18,8)
```
- 18 dígitos totales
- 8 decimales para precisión en conversiones de moneda

### JSONB
```sql
data JSONB DEFAULT '{}'
features JSONB NOT NULL DEFAULT '{}'
```

---

## Patrones Utilizados

### Foreign Keys
```sql
-- Con DELETE CASCADE
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE

-- Con SET NULL
affiliate_id UUID REFERENCES users(id) ON DELETE SET NULL
```

### Timestamps Automáticos
```sql
-- Trigger para updated_at
CREATE TRIGGER trg_upd_users 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

### Check Constraints
```sql
-- Enum simulado
status VARCHAR(50) DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'archived')
)
```

---

## Buenas Prácticas

### 1. Always Use IF NOT EXISTS
```sql
CREATE TABLE IF NOT EXISTS users (...);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### 2. Add Comments
```sql
COMMENT ON COLUMN orders.gateway_fee 
    IS 'Comisión bruta cobrada por la pasarela';
```

### 3. Use Domains cuando sea apropiado
```sql
CREATE DOMAIN email AS VARCHAR(100)
    CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
```

### 4. FK con índices
Siempre crear índice en columnas FK para mejor performance:
```sql
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
```

---

## Proceso de Cambio de Schema

### Paso 1: Análisis
- ¿Qué tabla se ve afectada?
- ¿Hay datos existentes?
- ¿Qué impacto tiene el cambio?

### Paso 2: Draft del SQL
Escribir el SQL de migración:
```sql
-- Migration: add_new_field
ALTER TABLE users ADD COLUMN new_field VARCHAR(100);
```

### Paso 3: Testing
- Probar en ambiente de desarrollo
- Verificar que no rompa queries existentes

### Paso 4: Deploy
1. Backup de la DB
2. Ejecutar migración
3. Verificar que la app funcione

### Paso 5: Rollback (si falla)
```sql
-- Rollback
ALTER TABLE users DROP COLUMN new_field;
```

---

## Políticas Específicas

### No modificar datos en migraciones
Las migraciones solo alteran estructura, no datos.
Para modificar datos, usar scripts separados o seeds.

### No eliminar columnas sin backup
Si hay datos importantes, respaldar antes de eliminar.

### Usar transactions
```sql
BEGIN;

-- Cambios
ALTER TABLE ...;

COMMIT; -- o ROLLBACK;
```

---

## Scripts de Seeds

Los datos iniciales van en `03-create-seeds.sql`:

```sql
-- Monedas
INSERT INTO enabled_currencies (code, name, symbol) VALUES 
    ('ARS', 'Peso Argentino', '$'),
    ('USD', 'Dólar Americano', '$'),
    ('USDT', 'Tether', '₿')
ON CONFLICT (code) DO NOTHING;

-- Tipos de productos
INSERT INTO product_types (id, name) VALUES 
    ('course', 'Curso Online'),
    ('ebook', 'E-Book'),
    ('membership', 'Membresía'),
    ('podcast', 'Podcast'),
    ('software', 'Software')
ON CONFLICT (id) DO NOTHING;

-- Gateways
INSERT INTO payment_gateways (id, name) VALUES 
    ('mercadopago', 'Mercado Pago'),
    ('simulator', 'Simulator')
ON CONFLICT (id) DO NOTHING;
```

---

## Ver También

- [Esquema de Base de Datos](./schema.md)
- [Features: Compliance](../../features/compliance.md)
