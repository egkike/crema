# Códigos de Error

La API de Crema usa un formato consistente para todos los errores.

## Formato de Error

```json
{
  "success": false,
  "error": "Mensaje descriptivo del error"
}
```

En desarrollo, también se incluye el stack trace:

```json
{
  "success": false,
  "error": "Mensaje del error",
  "stack": "Error stack trace..."
}
```

## Códigos de Error Comunes

### Errores de Autenticación

| Código | HTTP | Descripción |
|--------|------|-------------|
| `NO_TOKEN_PROVIDED` | 401 | No se envió token de acceso |
| `INVALID_TOKEN` | 401 | Token inválido o corrupto |
| `TOKEN_EXPIRED` | 401 | El token de acceso expiró |
| `REFRESH_TOKEN_EXPIRED` | 401 | El token de refresh expiró |
| `INVALID_CREDENTIALS` | 401 | Email o contraseña incorrectos |
| `ACCOUNT_NOT_VERIFIED` | 403 | Cuenta no verificada |
| `2FA_REQUIRED` | 401 | Se requiere código 2FA |
| `INVALID_2FA_CODE` | 401 | Código 2FA inválido |

### Errores de Autorización

| Código | HTTP | Descripción |
|--------|------|-------------|
| `FORBIDDEN` | 403 | No tienes permisos |
| `INSUFFICIENT_ROLE` | 403 | Tu rol no tiene permisos suficientes |
| `PLAN_LIMIT_EXCEEDED` | 403 | Excediste el límite de tu plan |
| `ACCESS_DENIED` | 403 | No tienes acceso a este recurso |

### Errores de Validación

| Código | HTTP | Descripción |
|--------|------|-------------|
| `VALIDATION_FAILED` | 400 | Datos de entrada inválidos |
| `INVALID_EMAIL` | 400 | Email con formato inválido |
| `WEAK_PASSWORD` | 400 | Contraseña muy débil |
| `EMAIL_ALREADY_EXISTS` | 400 | El email ya está registrado |
| `USERNAME_TAKEN` | 400 | El username ya está en uso |

### Errores de Recursos

| Código | HTTP | Descripción |
|--------|------|-------------|
| `NOT_FOUND` | 404 | Recurso no encontrado |
| `PRODUCT_NOT_FOUND` | 404 | Producto no existe |
| `USER_NOT_FOUND` | 404 | Usuario no existe |
| `ORDER_NOT_FOUND` | 404 | Orden no encontrada |

### Errores de Pago

| Código | HTTP | Descripción |
|--------|------|-------------|
| `PAYMENT_FAILED` | 402 | El pago falló |
| `PAYMENT_PENDING` | 402 | Pago pendiente |
| `PAYMENT_EXPIRED` | 402 | Pago expirado |
| `INSUFFICIENT_BALANCE` | 402 | Saldo insuficiente |
| `INVALID_PAYMENT_METHOD` | 400 | Método de pago inválido |
| `REFUND_FAILED` | 402 | El reembolso falló |
| `REFUND_NOT_ALLOWED` | 403 | No se permite el reembolso |

### Errores de Productos

| Código | HTTP | Descripción |
|--------|------|-------------|
| `PRODUCT_NOT_PUBLISHED` | 400 | Producto no está publicado |
| `PRODUCT_INACTIVE` | 400 | Producto está inactivo |
| `COUPON_EXPIRED` | 400 | Cupón vencido |
| `COUPON_LIMIT_REACHED` | 400 | Límite de uso del cupón alcanzado |
| `INVALID_COUPON` | 400 | Cupón inválido |

### Errores de LMS/Learning

| Código | HTTP | Descripción |
|--------|------|-------------|
| `COURSE_NOT_PURCHASED` | 403 | No has comprado este curso |
| `LESSON_NOT_FOUND` | 404 | Lección no encontrada |
| `QUIZ_ALREADY_COMPLETED` | 400 | Ya completaste este quiz |
| `CERTIFICATE_NOT_FOUND` | 404 | Certificado no encontrado |

### Errores de Rate Limiting

| Código | HTTP | Descripción |
|--------|------|-------------|
| `RATE_LIMIT_EXCEEDED` | 429 | Demasiadas solicitudes |

### Errores del Servidor

| Código | HTTP | Descripción |
|--------|------|-------------|
| `INTERNAL_ERROR` | 500 | Error interno del servidor |
| `DATABASE_ERROR` | 500 | Error de base de datos |
| `EXTERNAL_SERVICE_ERROR` | 502 | Error de servicio externo |

## Ejemplos de Respuestas de Error

### 401 - Token Expirado

```json
{
  "success": false,
  "error": "Token expired",
  "code": "TOKEN_EXPIRED"
}
```

### 403 - Forbidden

```json
{
  "success": false,
  "error": "Access denied",
  "code": "ACCESS_DENIED"
}
```

### 404 - Not Found

```json
{
  "success": false,
  "error": "Producto no encontrado",
  "code": "PRODUCT_NOT_FOUND"
}
```

### 422 - Validation Error

```json
{
  "success": false,
  "error": "Validation failed",
  "details": {
    "email": {
      "_errors": [
        {
          "code": "invalid_email",
          "message": "Invalid email format"
        }
      ]
    }
  }
}
```

### 429 - Rate Limit

```json
{
  "success": false,
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

---

## Manejo de Errores en Cliente

### Recomendaciones

1. **401 Token Expired**: Intentar refresh token automáticamente
2. **401 Invalid Credentials**: Mostrar mensaje de error al usuario
3. **403 Forbidden**: Redirigir a página de acceso denegado
4. **404 Not Found**: Mostrar mensaje "No encontrado"
5. **429 Rate Limit**: Esperar el tiempo indicado y reintentar
6. **500 Error**: Mostrar mensaje genérico y reportar

### Pseudocódigo

```javascript
try {
  const response = await api.get('/resource');
} catch (error) {
  switch (error.code) {
    case 'TOKEN_EXPIRED':
      await refreshToken();
      return retryRequest();
    case 'RATE_LIMIT_EXCEEDED':
      await sleep(error.retryAfter * 1000);
      return retryRequest();
    case 'ACCESS_DENIED':
      redirect('/access-denied');
      break;
    default:
      showError(error.message);
  }
}
```

---

## Ver También

- [Autenticación](./authentication.md)
- [Endpoints](./endpoints/)
