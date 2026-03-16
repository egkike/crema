# API de Crema - Introducción

La API de Crema es una REST API que permite gestionar productos digitales, pagos, afiliados y más.

## Base URL

```
Development: http://localhost:3000
Production:  https://api.crema.com (pendiente)
```

## Formato de Respuesta

Todas las respuestas siguen un formato consistente:

### Respuesta Exitosa
```json
{
  "success": true,
  "data": { ... }
}
```

### Respuesta de Error
```json
{
  "success": false,
  "error": "Mensaje de error descriptivo"
}
```

## Autenticación

La API usa JWT (JSON Web Tokens) almacenados en cookies HttpOnly.

### Headers Requeridos

| Header | Valor | Descripción |
|--------|-------|-------------|
| `Content-Type` | `application/json` | Required para requests con body |

### Cookies

| Cookie | Tipo | Descripción |
|--------|------|-------------|
| `access_token` | HttpOnly | JWT de acceso (expira en 15 min) |
| `refresh_token` | HttpOnly | JWT de refresh (expira en 7 días) |

### Endpoints de Autenticación

Ver [Autenticación](./authentication.md) para detalles completos.

## Rate Limiting

La API implementa rate limiting por IP:

| Endpoint | Límite |
|----------|--------|
| `/api/auth/login` | 5 requests / 15 min |
| `/api/auth/refresh` | 10 requests / 15 min |
| `/api/*` (general) | 100 requests / 15 min |

## Paginación

Endpoints que retornan listas soportan paginación:

```
GET /api/products?page=1&limit=20
```

### Query Params

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | 1 | Número de página |
| `limit` | number | 20 | Items por página (max 100) |
| `sort` | string | - | Campo para ordenar |
| `order` | `asc`/`desc` | `asc` | Dirección del orden |

### Response Format

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Fechas

Todas las fechas se retornan en formato ISO 8601:

```
2024-03-15T14:30:00.000Z
```

## Monedas

La plataforma soporta múltiples monedas:

| Código | Símbolo | Descripción |
|--------|---------|-------------|
| `ARS` | $ | Pesos Argentinos |
| `USD` | $ | Dólares Estadounidenses |
| `USDT` | ₿ | Tether (cripto) |

## Versionado

La API当前 está en versión **v1**. No hay versionado en el URL por ahora.

## Documentación Interactiva

Swagger UI disponible en desarrollo:
```
http://localhost:3000/api-docs
```

## Códigos de Estado HTTP

| Código | Significado |
|--------|-------------|
| 200 | OK - Request exitoso |
| 201 | Created - Recurso creado |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado |
| 403 | Forbidden - No autorizado |
| 404 | Not Found - Recurso no encontrado |
| 422 | Unprocessable Entity - Validación fallida |
| 429 | Too Many Requests - Rate limit excedido |
| 500 | Internal Server Error - Error del servidor |

---

## Endpoints Disponibles

| Módulo | Prefijo | Descripción |
|--------|---------|-------------|
| Auth | `/api/auth` | Autenticación, login, registro, 2FA |
| Users | `/api/users` | Gestión de perfil de usuario |
| Products | `/api/products` | Productos digitales |
| Learning | `/api/learning` | LMS, progreso, certificados |
| Payments | `/api/payments` | Pagos, checkout, suscripciones |
| Balance | `/api/balances` | Consulta de saldos |
| Payouts | `/api/payouts` | Retiros de fondos |
| Refunds | `/api/refunds` | Reembolsos |
| Affiliates | `/api/affiliates` | Programa de afiliados |
| Admin | `/api/admin` | Administración (solo admin) |

---

## Ver También

- [Autenticación](./authentication.md)
- [Códigos de Error](./errors.md)
- [Endpoints de Auth](./endpoints/auth.md)
- [Endpoints de Products](./endpoints/products.md)
