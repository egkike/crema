# Sistema de Afiliados

## Overview

El sistema de afiliados permite que cualquier usuario promocione productos y gane comisiones por cada venta referida.

## Conceptos Fundamentales

| Término | Descripción |
|---------|-------------|
| **Afiliado** | Usuario que promociona productos de otros |
| **Creador** | Usuario que crea y vende productos |
| **Comisión** | Porcentaje del precio que recibe el afiliado |
| **Tracking** | Seguimiento de ventas referidas |
| **Portfolio** | Lista de productos en los que un usuario es afiliado |

## Flujo del Sistema de Afiliados

```
1. CREADOR → Configura comisión en su producto
           → Activa programa de afiliados

2. AFILIADO → Explora marketplace
           → Se une al programa (POST /api/products/:id/join)
           → Obtiene link de referido único

3. AFILIADO → Comparte link: https://crema.com/?ref=afiliado123
           → O comparte su slug: https://crema.com/@afiliado123

4. COMPRADOR → Hace click en link
             → Cookie de tracking (30 días)
             → Navega y compra

5. SISTEMA → Detecta cookie de afiliado
           → Registra order con affiliate_id
           → Calcula comisión

6. AFILIADO → Gana comisión
           → Recibe en su balance
           → Puede solicitar retiro
```

## Tracking de Afiliados

### Affiliate Slug

Cada usuario tiene un `affiliate_slug` único:

```
https://crema.com/@tu-slug
```

### Cookie de Tracking

Cuando un comprador hace click en un link de afiliado:

```typescript
// Se guarda cookie por 30 días
cookie: {
  affiliate_id: "uuid-del-afiliado",
  expires: 30 days
}
```

### Middleware de Tracking

```typescript
// affiliateTracking.middleware.ts
export const affiliateTracking = (req, res, next) => {
  const ref = req.query.ref || req.params.affiliate_slug;
  
  if (ref) {
    // Buscar usuario por slug
    const affiliate = await userRepository.findBySlug(ref);
    
    if (affiliate) {
      // Guardar en cookie
      res.cookie('ref', affiliate.id, { 
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 días
      });
    }
  }
  
  next();
};
```

---

## Comisiones

### Porcentaje por Producto

Cada producto tiene su propio porcentaje de comisión configurado por el creador:

```sql
-- products table
affiliate_commission_percent DECIMAL(18,8) DEFAULT 5.00
```

### Ejemplo

| Producto | Precio | Comisión Afiliado |
|----------|--------|-------------------|
| Curso JS | $10.000 | 30% = $3.000 |
| Ebook | $2.000 | 20% = $400 |
| Membresía | $5.000 | 25% = $1.250 |

### Límites

- **Mínimo**: 5% (configurable por plan)
- **Máximo**: 50%

---

## Tablas Relacionadas

### affiliate_portfolio

```sql
CREATE TABLE affiliate_portfolio (
    affiliate_id UUID REFERENCES users(id),
    product_id UUID REFERENCES products(id),
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (affiliate_id, product_id)
);
```

Un afiliado puede unirse a múltiples productos.

### commissions

```sql
CREATE TABLE commissions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    order_id UUID REFERENCES orders(id),
    amount DECIMAL(18,8),      -- Monto bruto
    fee_applied DECIMAL(18,8), -- Fee de plataforma
    net_amount DECIMAL(18,8), -- Monto neto al afiliado
    currency VARCHAR(10),
    type VARCHAR(20) DEFAULT 'affiliate',
    status VARCHAR(50) DEFAULT 'pending'
);
```

---

## Estados de Comisión

| Estado | Descripción |
|--------|-------------|
| `pending` | Pendiente de liberación (en garantía) |
| `paid` | Pagada al afiliado |
| `refunded` | Revertida (por reembolso de orden) |
| `cancelled` | Cancelada |

---

## Liberación de Comisiones

Las comisiones se liberan junto con los fondos del creador:

```
commission_release_at = MAX(
    orden.guarantee_days (default 7),
    gateway.liquidity_delay_days
)
```

---

## Endpoints del Afiliado

### Unirse a Programa

```
POST /api/products/:productId/join
```

### Ver Mi Portfolio

```
GET /api/affiliates/my-portfolio
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "product_title": "Curso de React",
      "commission_rate": 30,
      "total_sales": 45,
      "total_earnings": 67485
    }
  ]
}
```

### Abandonar Programa

```
DELETE /api/affiliates/portfolio/:productId
```

---

## Panel del Afiliado

El afiliado puede ver:
- Productos en su portfolio
- Ventas por producto
- Ganancias totales
- Comisiones pendientes
- Historial de pagos

---

## Calculadora de Ganancias

```typescript
// Ejemplo de cálculo
const price = 10000;           // Precio
const discount = 1000;         // Descuento aplicado
const base = price - discount; // Base imponible

const affiliatePercent = 30;   // % del producto
const platformFee = 10;        // % fee de plataforma

const grossCommission = base * (affiliatePercent / 100); // 2,700
const netCommission = grossCommission - (grossCommission * (platformFee / 100)); // 2,430
```

---

## Políticas

### Reglas de Afiliación

1. **Unirse**: Cualquier usuario puede unirse a cualquier producto público
2. **Abandonar**: El afiliado puede abandonar en cualquier momento
3. **Cookie**: 30 días de duración
4. **Pago**: Se paga junto con el siguiente retiro

### Restricciones

- Un creador no puede ser afiliado de su propio producto
- Las comisiones se anulan si la orden es reembolsada

---

## Ver También

- [API: Afiliados](../api/endpoints/affiliates.md)
- [API: Balance](../api/endpoints/balance.md)
- [API: Payouts](../api/endpoints/payout.md)
- [Features: Payments](./payments.md)
