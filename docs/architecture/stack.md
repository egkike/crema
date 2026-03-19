# Stack Tecnológico

## Runtime y Lenguaje

| Tecnología | Versión | Justificación |
|------------|---------|---------------|
| **Node.js** | 20+ | LTS actual, soporte nativo de promises (Express 5) |
| **TypeScript** | 5.9+ | Tipado estático para maintainability |

## Backend

| Paquete | Versión | Propósito |
|---------|---------|------------|
| express | ^5.2.1 | Framework web con soporte nativo de promesas |
| zod | ^4.3.5 | Validación de esquemas de datos |
| jsonwebtoken | ^9.0.3 | Manejo de JWT (access + refresh tokens) |
| bcrypt | ^6.0.0 | Hashing de contraseñas |
| otplib | ^13.3.0 | Autenticación de dos factores (2FA) |
| bullmq | ^5.69.3 | Sistema de colas con Redis |
| ioredis | ^5.9.3 | Cliente Redis |
| mercadopago | ^2.12.0 | Integración con pasarela de pagos |
| nodemailer | ^8.0.0 | Envío de emails |
| qrcode | ^1.5.4 | Generación de QR codes |
| slugify | ^1.6.6 | Creación de slugs URL-friendly |
| pino | ^10.3.1 | Logging estructurado |
| axios | ^1.13.4 | Cliente HTTP para APIs externas |

### Seguridad

| Paquete | Propósito |
|---------|-----------|
| helmet | Headers de seguridad HTTP |
| express-rate-limit | Rate limiting |
| cookie-parser | Parseo de cookies |
| cors | Cross-Origin Resource Sharing |

### Build y Desarrollo

| Paquete | Propósito |
|---------|-----------|
| esbuild | Compilación ultrarrápida |
| tsx | Ejecución de TypeScript en desarrollo |
| vitest | Testing framework |
| eslint + prettier | Linting y formatting |

## Base de Datos

| Tecnología | Versión | Propósito |
|------------|---------|------------|
| **PostgreSQL** | 18 | Base de datos relacional principal |
| **pg** | ^8.16.3 | Driver nativo de PostgreSQL |
| **Redis** | Latest | Colas y caché |

## Servicios Externos

| Servicio | Propósito |
|----------|-----------|
| **Mercado Pago** | Pasarela de pagos (Argentina) |
| **Mux Video** | Streaming de video seguro |
| **Cloudflare Stream** | Alternativa de streaming |
| **SMTP** | Envío de emails transaccionales |

## Frontend (Próximamente)

### Frontend Main
- **Astro** + **React** - Interfaz principal para usuarios
- **Tailwind CSS** - Estilos

### Frontend Admin
- **Astro** + **React** - Panel de administración
- **Tailwind CSS** - Estilos

### Stack Compartido
- **TypeScript** - Tipado estático
- **TanStack Query** - Gestión de estado servidor

## Herramientas de Desarrollo

| Herramienta | Propósito |
|-------------|-----------|
| **pnpm** | Package manager (workspaces) |
| **Docker** | Containerización |
| **Vitest** | Testing |
| **ESLint + Prettier** | Code quality |

## Diagrama de Dependencias

```
                    ┌─────────────────┐
                    │   Node.js 20+   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌───────────┐  ┌──────────┐
        │ Express  │  │ TypeScript│  │  BullMQ  │
        │    5     │  │   5.9+    │  │   5.x    │
        └────┬─────┘  └───────────┘  └────┬─────┘
             │                             │
    ┌────────┼────────┐             ┌──────┴──────┐
    ▼        ▼        ▼             ▼             ▼
┌──────┐ ┌──────┐ ┌──────┐    ┌─────────┐  ┌───────────┐
│ Zod  │ │ JWT  │ │ pg   │    │  Redis  │  │MercadoPago│
└──────┘ └──────┘ └──────┘    └─────────┘  └───────────┘
```

## Variables de Entorno Principales

```
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Auth
SECRET_JWT_KEY=...
SECRET_REFRESH_JWT_KEY=...
PASSWORD_PEPPER=...

# Mercado Pago
MERCADOPAGO_ACCESS_TOKEN=...

# Mux (Video)
MUX_SIGNING_KEY=...
MUX_SECRET_KEY=...

# Email
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
```

---

## Documentación Relacionada

- [Setup Local](../development/setup.md)
- [Visión General](./overview.md)
- [Estructura de Directorios](./directory-structure.md)
