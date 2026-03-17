# Crema API Core 🍦

**Crema** es el motor de infraestructura para la economía de los creadores, permitiendo la comercialización, protección y escalabilidad de info-productos bajo normativas de transparencia financiera.

[![Node](https://img.shields.io/badge/node-20+-blue)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-orange)](https://pnpm.io/)
[![Database](https://img.shields.io/badge/PostgreSQL-18-blue)](https://www.postgresql.org/)
[![Queue](https://img.shields.io/badge/BullMQ-Redis-red)](https://docs.bullmq.io/)
[![LEC](https://img.shields.io/badge/Ley_Economía_del_Conocimiento-Cumplimiento-green)](https://www.argentina.gob.ar/servicio/acceder-los-beneficios-del-regimen-de-promocion-de-la-economia-del-conocimiento)

---

## 🚀 Endpoints de la API

### Autenticación
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Registro de usuario |
| POST | `/api/auth/login` | Inicio de sesión |
| POST | `/api/auth/refresh` | Refresh tokens |
| POST | `/api/auth/logout` | Cerrar sesión |
| POST | `/api/auth/forgot-password` | Solicitar recuperación |
| POST | `/api/auth/reset-password` | Resetear contraseña |
| POST | `/api/auth/2fa/setup` | Configurar 2FA |
| POST | `/api/auth/2fa/verify` | Verificar 2FA |
| GET | `/api/auth/sessions` | Ver sesiones activas |

### Usuarios
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/users/me` | Perfil del usuario |
| PATCH | `/api/users/me` | Actualizar perfil |
| DELETE | `/api/users/me` | Eliminar cuenta |

### Productos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/products/:id` | Ver producto |
| POST | `/api/products/create` | Crear producto |
| PATCH | `/api/products/:id` | Actualizar producto |
| DELETE | `/api/products/:id` | Eliminar producto |
| GET | `/api/products/my-products` | Productos propios |
| POST | `/api/products/validate-coupon` | Validar cupón |

### Pagos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/payments/checkout/create` | Crear preferencia |
| POST | `/api/payments/webhook/:gateway` | Webhook de pago |
| POST | `/api/payments/subscribe/:planId` | Suscribirse |

### Learning (LMS)
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/learning/my-dashboard` | Dashboard del estudiante |
| GET | `/api/learning/:productId/content` | Contenido del curso |
| POST | `/api/learning/progress` | Actualizar progreso |
| POST | `/api/learning/quiz/submit` | Enviar quiz |
| GET | `/api/learning/certificate/verify/:code` | Verificar certificado |

### Balance
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/balances/me` | Mi balance |
| GET | `/api/balances/stats` | Estadísticas |
| GET | `/api/balances/history` | Historial |

### Payouts
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/payouts` | Solicitar retiro |
| GET | `/api/payouts/me` | Mis retiros |
| DELETE | `/api/payouts/:id` | Cancelar retiro |

### Afiliados
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/affiliates/my-portfolio` | Mi portfolio |
| POST | `/api/affiliates/portfolio/:id/join` | Unirse a programa |
| DELETE | `/api/affiliates/portfolio/:id` | Abandonar programa |

### Admin
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/admin/financial-health` | Salud financiera |
| GET | `/api/admin/ledger` | Libro mayor |
| GET | `/api/admin/lec/compliance-status` | Estado LEC |
| GET | `/api/admin/export/tax-report` | Reporte fiscal |

---

## 🛠️ Stack Tecnológico

- **Runtime**: Node.js 20+ con Express 5
- **Lenguaje**: TypeScript 5.9+
- **Build**: esbuild
- **DB**: PostgreSQL 18 con driver `pg`
- **Colas**: BullMQ + Redis
- **Auth**: JWT + Refresh Tokens + 2FA
- **Validación**: Zod
- **Logging**: Pino

---

## 📁 Estructura

```
src/
├── controllers/      # Request/Response
├── repositories/    # SQL queries
├── services/        # Lógica de negocio
├── middlewares/     # Auth, validation, etc.
├── routes/         # Endpoints
├── schemas/         # Zod validation
├── queues/         # BullMQ workers
├── utils/          # Helpers
├── config/         # Configuración
└── errors/         # Custom errors
```

---

## ⚙️ Configuración

### Variables de Entorno

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
SECRET_JWT_KEY=...
SECRET_REFRESH_JWT_KEY=...

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN=...

# Mux
MUX_SIGNING_KEY=...
```

### Comandos

```bash
pnpm dev          # Desarrollo
pnpm build        # Build producción
pnpm test         # Tests
pnpm lint         # Lint
pnpm typecheck    # Tipos
```

---

## 🛡️ Seguridad

### Implementado
- ✅ JWT en cookies HttpOnly
- ✅ Rate limiting por endpoint
- ✅ Helmet security headers
- ✅ CORS configurado
- ✅ 2FA opcional
- ✅ Password hashing con bcrypt + pepper
- ✅ Validación de inputs con Zod

### Consideraciones
- Tokens JWT expiran en 15 min (access) y 7 días (refresh)
- Rate limiting: 5 login attempts / 15 min
- 2FA usa TOTP (Google Authenticator, etc.)

---

## 🧪 Testing

```bash
pnpm test              # Tests unitarios
pnpm test:coverage     # Coverage
pnpm test:ci           # Tests en Docker
```

### Cobertura de Tests (actual)

| Métrica | Porcentaje |
|---------|------------|
| Statements | ~27% |
| Functions | ~32% |
| Lines | ~27% |

**Total: 157 tests unitarios**

### Archivos de Test

- **Rutas**: auth, users, products, content, quiz, balance, payouts, payments, refunds, affiliates, admin, products-routes
- **Servicios**: auth, user, product, payment, payout, order, commission, refund, release, access, subscription, payout_method, email, twoFactor, simulator-provider
- **Setup**: setup.ts (mocks globales), vitest.setup.ts

---

## 📚 Documentación

- [Documentación completa](../docs/)
- [Swagger UI](http://localhost:3000/api-docs) (desarrollo)
- [Guía de desarrollo](../docs/development/setup.md)

---

*Diseñado por Kike Garcia - 2026*
