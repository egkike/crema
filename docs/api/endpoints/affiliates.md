# Endpoints: Affiliates

## Overview

Gestión del programa de afiliados.

## Endpoints

---

### Get My Portfolio

```
GET /api/affiliates/my-portfolio
```

Lista los productos en los que el usuario es afiliado.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "product_id": "uuid",
      "product_title": "Curso de React",
      "commission_rate": 30,
      "total_sales": 45,
      "total_earnings": 67485,
      "joined_at": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### Remove From Portfolio

```
DELETE /api/affiliates/portfolio/:productId
```

Abandona el programa de afiliados de un producto.

**Autenticación:** Requiere access token + rol AFFILIATE

**Response (200):**

```json
{
  "success": true,
  "message": "Abandonaste el programa de afiliados"
}
```

---

## Flujo de Afiliación

```
1. Usuario → Navega productos en marketplace
2. Usuario → Se registra como afiliado
3. Afiliado → Comparte link con código único: /?ref=afiliado123
4. Comprador →Hace click en link
5. Sistema → Tracking de cookie (30 días)
6. Comprador → Realiza compra
7. Sistema → Registra comisión para afiliado
8. Afiliado → Gana comisión
```

---

## Comisiones

- Las comisiones se calculan como porcentaje del precio del producto
- Se pagan junto con el siguiente retiro del afiliado
- El creador puede configurar diferentes porcentajes por producto

---

## Tracking

El tracking de afiliados se hace mediante:
1. **Affiliate slug**: URL del creador (ej: `crema.com/?ref=juan`)
2. **Cookie**: Se guarda por 30 días

---

## Ver También

- [Features: Afiliados](../../features/affiliates.md)
- [Errores](../errors.md)
