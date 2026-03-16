# Endpoints: Auth

## Overview

Módulo de autenticación y gestión de sesiones.

## Endpoints

---

### Registro de Usuario

```
POST /api/auth/register
```

Registra un nuevo usuario en la plataforma.

**Autenticación:** No requerida

**Request Body:**

```json
{
  "username": "creador01",
  "email": "creador@email.com",
  "password": "Password123",
  "fullname": "Juan Pérez",
  "tax_id": "20-12345678-9",
  "tax_condition": "monotax"
}
```

**Response (201):**

```json
{
  "success": true,
  "message": "Usuario registrado. Verifica tu email."
}
```

---

### Verificar Email

```
GET /api/auth/verify-email?token=xxx
```

**Autenticación:** No requerida

**Response (200):**

```json
{
  "success": true,
  "message": "Email verificado correctamente"
}
```

---

### Login

```
POST /api/auth/login
```

Inicia sesión y configura cookies con tokens.

**Autenticación:** No requerida

**Request Body:**

```json
{
  "email": "usuario@email.com",
  "password": "Password123"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Login exitoso"
}
```

---

### Refresh Token

```
POST /api/auth/refresh
```

Rota los tokens de acceso.

**Autenticación:** Requiere `refresh_token` cookie

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

Cierra sesión actual.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "message": "Logout exitoso"
}
```

---

### Forgot Password

```
POST /api/auth/forgot-password
```

Solicita link de recuperación de contraseña.

**Autenticación:** No requerida

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

---

### Reset Password

```
POST /api/auth/reset-password
```

Restablece la contraseña con el token del email.

**Autenticación:** No requerida

**Request Body:**

```json
{
  "token": "token-del-email",
  "newPassword": "NuevaPassword456"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Contraseña actualizada correctamente"
}
```

---

### Change Password (First Login)

```
POST /api/auth/change-password-first-login
```

Cambia contraseña obligatoriamente en primer login.

**Autenticación:** Requiere access token

**Request Body:**

```json
{
  "currentPassword": "PasswordTemporal123",
  "newPassword": "NuevaPassword456"
}
```

---

### Login 2FA

```
POST /api/auth/login/2fa
```

Completa login con código 2FA.

**Autenticación:** Requiere JWT temporal

**Request Body:**

```json
{
  "temporary_token": "token-temporal",
  "code": "123456"
}
```

**Response (200):**

```json
{
  "success": true,
  "message": "Login exitoso con 2FA"
}
```

---

### Setup 2FA

```
POST /api/auth/2fa/setup
```

Inicia configuración de 2FA.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "qrCode": "data:image/png;base64,..."
  }
}
```

---

### Verify 2FA

```
POST /api/auth/2fa/verify
```

Activa 2FA después de verificar código.

**Autenticación:** Requiere access token

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
  "message": "2FA activado",
  "backupCodes": ["ABC123", "DEF456", ...]
}
```

---

### Get Activity

```
GET /api/auth/activity
```

Obtiene historial de actividad de seguridad.

**Autenticación:** Requiere access token

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

---

### Get Sessions

```
GET /api/auth/sessions
```

Lista sesiones activas.

**Autenticación:** Requiere access token

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

---

### Revoke Other Sessions

```
DELETE /api/auth/sessions/other
```

Cierra todas las sesiones excepto la actual.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "message": "Sesiones cerradas"
}
```

---

### Revoke Session

```
DELETE /api/auth/sessions/:sessionId
```

Cierra una sesión específica.

**Autenticación:** Requiere access token

**Response (200):**

```json
{
  "success": true,
  "message": "Sesión cerrada"
}
```

---

## Ver También

- [Autenticación](../authentication.md)
- [Errores](../errors.md)
