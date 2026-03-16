# Autenticación

La API de Crema implementa un sistema de autenticación robusto con JWT (JSON Web Tokens) y soporte para 2FA (autenticación de dos factores).

## Flujo de Autenticación

```
┌──────────┐                           ┌───────────┐
│  Cliente │                           │   API     │
└────┬─────┘                           └─────┬─────┘
     │                                       │
     │  1. POST /api/auth/login              │
     │  { email, password }                  │
     ├──────────────────────────────────────►│
     │                                       │
     │  2. Validar credenciales              │
     │     + Verificar 2FA si está habilit.  │
     │                                       │
     │  3. Generar tokens                    │
     │     + access_token (15 min)           │
     │     + refresh_token (7 días)          │
     │◄──────────────────────────────────────┤
     │                                       │
     │  4. Cookie: access_token (HttpOnly)   │
     │     Cookie: refresh_token (HttpOnly)  │
     │                                       │
     │  5. requests con access_token         │
     ├──────────────────────────────────────►│
     │                                       │
     │  6. Token expira (15 min)             │
     │◄──────────────────────────────────────┤
     │  401 Token expired                    │
     │                                       │
     │  7. POST /api/auth/refresh            │
     │     (con refresh_token)               │
     ├──────────────────────────────────────►│
     │                                       │
     │  8. Nuevos tokens                     │
     │◄──────────────────────────────────────┤
```

## Endpoints de Autenticación

### Registro de Usuario

```
POST /api/auth/register
```

Registra un nuevo usuario (Creador o Afiliado).

**Request Body:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `username` | string | Sí | Username único (3-50 chars) |
| `email` | string | Sí | Email válido y único |
| `password` | string | Sí | Mínimo 8 chars, 1 mayúscula, 1 número |
| `fullname` | string | No | Nombre completo |
| `tax_id` | string | No | CUIT/CUIL (Argentina) |
| `tax_condition` | string | No | `ri`, `monotax`, `exempt` |

**Response (201):**

```json
{
  "success": true,
  "message": "Usuario registrado. Verifica tu email."
}
```

---

### Login

```
POST /api/auth/login
```

Inicia sesión y retorna tokens en cookies.

**Request Body:**

| Campo | Tipo | Requerido |
|-------|------|-----------|
| `email` | string | Sí |
| `password` | string | Sí |

**Response (200):**

```json
{
  "success": true,
  "message": "Login exitoso"
}
```

**Cookies设置:**

- `access_token`: JWT de 15 minutos
- `refresh_token`: JWT de 7 días

---

### Refresh Token

```
POST /api/auth/refresh
```

Rota los tokens cuando el access_token expira.

**Requiere:** Cookie `refresh_token`

**Response (200):**

```json
{
  "success": true,
  "message": "Tokens renovados"
}
```

---

### Logout

```
POST /api/auth/logout
```

Cierra sesión y revoca el refresh token.

**Requiere:** Access token válido

**Response (200):**

```json
{
  "success": true,
  "message": "Logout exitoso"
}
```

---

### Recuperación de Contraseña

#### Solicitar Reseteo

```
POST /api/auth/forgot-password
```

**Request Body:**

```json
{
  "email": "usuario@email.com"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Si el email existe, recibirás un link de recuperación"
}
```

#### Resetear Contraseña

```
POST /api/auth/reset-password
```

**Request Body:**

```json
{
  "token": "token-del-email",
  "newPassword": "NuevaPassword123"
}
```

---

## Autenticación de Dos Factores (2FA)

### Setup 2FA

```
POST /api/auth/2fa/setup
```

Inicia el proceso de configuración de 2FA.

**Requiere:** Access token

**Response (200):**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,...",
    "message": "Escanea el QR con tu app de autenticación"
  }
}
```

### Verificar y Activar 2FA

```
POST /api/auth/2fa/verify
```

**Request Body:**

```json
{
  "code": "123456"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "2FA activado correctamente",
  "backupCodes": ["ABC123", "DEF456", ...]
}
```

### Login con 2FA

```
POST /api/auth/login/2fa
```

Cuando el login detecta 2FA habilitado, retorna un token temporal.

**Request Body:**

```json
{
  "temporary_token": "token-temporal-del-login",
  "code": "123456"
}
```

---

## Gestión de Sesiones

### Ver Actividad

```
GET /api/auth/activity
```

Retorna el historial de acciones de seguridad.

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "action": "LOGIN_SUCCESS",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2024-03-15T14:30:00Z"
    }
  ]
}
```

### Ver Sesiones Activas

```
GET /api/auth/sessions
```

**Response (200):**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "device_type": "Desktop",
      "ip_address": "192.168.1.1",
      "last_active": "2024-03-15T14:30:00Z"
    }
  ]
}
```

### Revocar Otras Sesiones

```
DELETE /api/auth/sessions/other
```

Cierra todas las sesiones excepto la actual (Botón de pánico).

### Revocar Sesión Específica

```
DELETE /api/auth/sessions/:sessionId
```

---

## Seguridad

### Cookies

Los tokens se almacenan en cookies HttpOnly con las siguientes configuraciones:

```javascript
{
  httpOnly: true,
  secure: true, // solo en producción
  sameSite: 'strict',
  maxAge: 15 * 60 * 1000 // 15 minutos para access
}
```

### Password

Las contraseñas se hashean con bcrypt con salt generado automáticamente.

### Rate Limiting

- Login: 5 intentos / 15 minutos por IP
- Refresh: 10 intentos / 15 minutos

---

## Roles de Usuario

| Rol | Descripción |
|-----|-------------|
| `USER` | Usuario básico |
| `CREATOR` | Creador de productos |
| `AFFILIATE` | Afiliado |
| `ADMIN` | Administrador de la plataforma |

---

## Ver También

- [Códigos de Error](./errors.md)
- [Endpoints de Auth](./endpoints/auth.md)
