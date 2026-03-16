# Endpoints: Products

## Overview

Gestión de productos digitales (cursos, ebooks, membresías, etc.)

## Endpoints

---

### Get Product by ID

```
GET /api/products/:productId
```

Obtiene un producto público.

**Autenticación:** Opcional (para tracking de afiliados)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Curso de TypeScript",
    "description": "Aprende TypeScript desde cero",
    "type": "course",
    "price": 4999,
    "currency": "ARS",
    "thumbnail_url": "https://...",
    "creator": {
      "id": "uuid",
      "username": "creador01",
      "fullname": "Juan Pérez"
    }
  }
}
```

---

### Validate Coupon

```
POST /api/products/validate-coupon
```

Valida un cupón en el checkout.

**Autenticación:** No requerida

**Request Body:**

```json
{
  "product_id": "uuid-del-producto",
  "coupon_code": "DESCUENTO20"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "discount_type": "percentage",
    "discount_value": 20,
    "final_price": 3999
  }
}
```

---

### Get My Available Marketplace

```
GET /api/products/marketplace/compatible
```

Lista productos disponibles en el marketplace para el usuario.

**Autenticación:** Requiere access token

**Query Params:**

| Param | Tipo | Descripción |
|-------|------|-------------|
| `category` | string | Filtrar por categoría |
| `search` | string | Buscar por título |
| `page` | number | Página |
| `limit` | number | Items por página |

**Response (200):**

```json
{
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 20, "total": 100 }
}
```

---

### Join Product Program

```
POST /api/products/:productId/join
```

Se une como afiliado a un producto.

**Autenticación:** Requiere access token + rol AFFILIATE

**Response (200):**

```json
{
  "success": true,
  "message": "Te uniste al programa de afiliados"
}
```

---

### Create Product

```
POST /api/products/create
```

Crea un nuevo producto.

**Autenticación:** Requiere access token + rol CREATOR

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `title` | string | Título del producto |
| `description` | string | Descripción |
| `type` | string | `course`, `ebook`, `membership`, etc. |
| `price` | number | Precio |
| `currency` | string | Moneda |
| `file` | file | Archivo (opcional) |

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Nuevo Curso",
    "status": "draft"
  }
}
```

---

### Update Product

```
PATCH /api/products/:productId
```

Actualiza un producto existente.

**Autenticación:** Requiere access token + rol CREATOR (dueño del producto)

**Content-Type:** `multipart/form-data`

**Response (200):**

```json
{
  "success": true,
  "data": { ... }
}
```

---

### Delete Product

```
DELETE /api/products/:productId
```

Elimina un producto.

**Autenticación:** Requiere access token + rol CREATOR

**Response (200):**

```json
{
  "success": true,
  "message": "Producto eliminado"
}
```

---

### Get Product Coupons

```
GET /api/products/:productId/coupons
```

Lista cupones de un producto.

**Autenticación:** Requiere access token + rol CREATOR

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "code": "DESCUENTO20",
      "discount_type": "percentage",
      "discount_value": 20,
      "usage_limit": 100,
      "used_count": 25,
      "expires_at": "2024-12-31T23:59:59Z"
    }
  ]
}
```

---

### Create Coupon

```
POST /api/products/:productId/coupons
```

Crea un cupón de descuento.

**Autenticación:** Requiere access token + rol CREATOR

**Request Body:**

```json
{
  "code": "NAVIDAD15",
  "discount_type": "percentage",
  "discount_value": 15,
  "usage_limit": 50,
  "expires_at": "2024-12-31T23:59:59Z"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "code": "NAVIDAD15",
    "discount_type": "percentage",
    "discount_value": 15
  }
}
```

---

### Upsert Quiz

```
POST /api/products/quiz/manage
```

Crea o actualiza un quiz para una lección.

**Autenticación:** Requiere access token + rol CREATOR

**Request Body:**

```json
{
  "lesson_id": "uuid",
  "questions": [
    {
      "question": "¿Qué es TypeScript?",
      "options": [
        { "text": "Un lenguaje", "is_correct": true },
        { "text": "Un framework", "is_correct": false }
      ]
    }
  ]
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Quiz guardado"
}
```

---

### Get My Products

```
GET /api/products/my-products
```

Lista productos propios del creador.

**Autenticación:** Requiere access token + rol CREATOR

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Mi Curso",
      "status": "published",
      "sales_count": 150,
      "revenue": 749850
    }
  ]
}
```

---

## Tipos de Productos

| Tipo | Descripción |
|------|-------------|
| `course` | Curso online |
| `ebook` | Libro electrónico |
| `membership` | Membresía |
| `podcast` | Podcast premium |
| `software` | Software/Acceso |

---

## Ver También

- [Errores](../errors.md)
- [Features: LMS](../../features/lms.md)
