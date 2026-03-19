# Estructura de Directorios

## Vista General

```
crema/
├── backend/                 # API REST (Node.js + TypeScript)
│   ├── src/
│   │   ├── controllers/    # Controladores (manejo de requests)
│   │   ├── routes/         # Definición de rutas
│   │   ├── services/       # Lógica de negocio
│   │   ├── repositories/  # Abstracción de base de datos
│   │   ├── middlewares/    # Middlewares (auth, validation, etc.)
│   │   ├── schemas/        # Esquemas de validación Zod
│   │   ├── queues/         # Workers y schedulers de BullMQ
│   │   ├── utils/          # Utilidades helper
│   │   ├── config/         # Configuración del proyecto
│   │   ├── errors/         # Manejo de errores custom
│   │   ├── types/          # Tipos TypeScript globales
│   │   ├── db/             # Conexión a base de datos
│   │   ├── __tests__/     # Tests unitarios
│   │   ├── app.ts          # Configuración de Express
│   │   ├── index.ts        # Entry point
│   │   └── swagger.ts      # Definiciones OpenAPI
│   ├── db/
│   │   └── init/           # Scripts SQL de inicialización
│   ├── logs/               # Archivos de log
│   ├── uploads/            # Archivos subidos temporalmente
│   └── tests/              # Tests de integración
│
├── frontend-main/              # Frontend principal (Astro + React)
├── frontend-admin/             # Panel de administración (Astro + React)
├── shared/                     # Tipos y utils compartidos entre frontends
└── docs/                      # Documentación
```

## Backend - Detalle de src/

```
src/
├── controllers/            # Manejo de requests/responses
│   ├── admin.controller.ts
│   ├── affiliate.controller.ts
│   ├── auth.controller.ts
│   ├── balance.controller.ts
│   ├── content.controller.ts
│   ├── payment.controller.ts
│   ├── payout.controller.ts
│   ├── product.controller.ts
│   ├── refund.controller.ts
│   ├── subscription.controller.ts
│   └── user.controller.ts
│
├── routes/                # Definición de endpoints
│   ├── admin.routes.ts
│   ├── affiliate.routes.ts
│   ├── auth.routes.ts
│   ├── balance.routes.ts
│   ├── learning.routes.ts
│   ├── payments.routes.ts
│   ├── payout.routes.ts
│   ├── payout_method.routes.ts
│   ├── products.routes.ts
│   ├── refund.routes.ts
│   └── user.routes.ts
│
├── services/              # Lógica de negocio
│   ├── auth.service.ts
│   ├── user.service.ts
│   ├── product.service.ts
│   ├── payment.service.ts
│   ├── order.service.ts
│   ├── commission.service.ts
│   ├── payout.service.ts
│   ├── refund.service.ts
│   ├── subscription.service.ts
│   ├── email.service.ts
│   ├── access.service.ts
│   ├── release.service.ts
│   ├── stats.service.ts
│   ├── export.service.ts
│   ├── twoFactor.service.ts
│   ├── captcha.service.ts
│   └── payout_method.service.ts
│   └── payment/
│       ├── PaymentProvider.ts      # Interfaz abstracta
│       ├── PaymentProviderFactory.ts
│       └── providers/
│           ├── MercadoPagoProvider.ts
│           └── SimulatorProvider.ts
│
├── repositories/          # Abstracción de DB (SQL queries)
│   ├── admin.repository.ts
│   ├── affiliate.repository.ts
│   ├── balance.repository.ts
│   ├── commission.repository.ts
│   ├── config.repository.ts
│   ├── coupon.repository.ts
│   ├── gateway.repository.ts
│   ├── history.repository.ts
│   ├── order.repository.ts
│   ├── payout.repository.ts
│   ├── payout_method.repository.ts
│   ├── product.repository.ts
│   ├── refund.repository.ts
│   ├── subscription.repository.ts
│   ├── system.repository.ts
│   ├── user.repository.ts
│   └── platform_*
│       ├── platform_earnings.repository.ts
│       ├── platform_balance.repository.ts
│       └── platform_withdrawal.repository.ts
│
├── middlewares/           # Middlewares Express
│   ├── auth/
│   │   ├── jwt.middleware.ts
│   │   ├── role.middleware.ts
│   │   ├── validate.middleware.ts
│   │   ├── password.middleware.ts
│   │   └── checkPlanLimits.middleware.ts
│   ├── tracking/
│   │   └── affiliateTracking.middleware.ts
│   ├── storage/
│   │   └── upload.middleware.ts
│   ├── checkAccess/
│   │   └── checkAccess.middleware.ts
│   └── rateLimit/
│       └── rateLimit.ts
│
├── schemas/               # Esquemas Zod
│   ├── users.schema.ts
│   ├── products.schema.ts
│   ├── lesson-progress.schema.ts
│   ├── coupons.schema.ts
│   └── payout.schema.ts
│
├── queues/                # BullMQ
│   ├── main.worker.ts     # Worker principal
│   └── scheduler.ts       # Tareas programadas
│
├── utils/                 # Utilidades
│   ├── logger.ts          # Configuración de Pino
│   ├── jwt.util.ts        # Helpers JWT
│   ├── validators.util.ts # Validadores custom
│   ├── rounder.util.ts    # Redondeo de números
│   ├── streaming.util.ts  # Mux/Cloudflare
│   └── dev/               # Utilidades de desarrollo
│
├── config/                # Configuración
│   ├── index.ts
│   └── redis.ts
│
├── errors/                # Errores custom
│   └── AppError.ts
│
├── types/                 # Tipos globales
│   └── express.d.ts
│
├── db/
│   └── postgres.ts        # Conexión pg
│
├── __tests__/             # Tests unitarios
│   ├── auth.test.ts        # Tests de autenticación
│   ├── users.test.ts       # Tests de usuarios
│   ├── products.test.ts    # Tests de productos
│   ├── content.test.ts     # Tests de contenido
│   ├── quiz.test.ts        # Tests de quizzes
│   ├── balance.test.ts    # Tests de balance
│   ├── payouts.test.ts     # Tests de retiros
│   ├── payments.test.ts    # Tests de pagos
│   ├── refunds.test.ts     # Tests de reembolsos
│   ├── affiliates.test.ts  # Tests de afiliados
│   ├── admin.test.ts       # Tests de admin
│   ├── products-routes.test.ts # Tests de rutas de productos
│   ├── services/           # Tests de servicios
│   │   ├── auth.service.test.ts
│   │   ├── user.service.test.ts
│   │   ├── product.service.test.ts
│   │   ├── payment.service.test.ts
│   │   ├── payout.service.test.ts
│   │   ├── order.service.test.ts
│   │   ├── commission.service.test.ts
│   │   ├── refund.service.test.ts
│   │   ├── release.service.test.ts
│   │   ├── access.service.test.ts
│   │   ├── subscription.service.test.ts
│   │   ├── payout_method.service.test.ts
│   │   ├── email.service.test.ts
│   │   ├── twoFactor.service.test.ts
│   │   └── simulator.provider.test.ts
│   ├── setup.ts            # Mocks globales
│   └── vitest.setup.ts    # Configuración Vitest
│
├── app.ts                 # Configuración Express
├── index.ts               # Entry point
└── swagger.ts             # OpenAPI definitions
```

## Convenciones de Nomenclatura

| Tipo | Convención | Ejemplo |
|------|------------|---------|
| Archivos | kebab-case | `auth.controller.ts` |
| Clases/Interfaces | PascalCase | `AuthController` |
| Funciones | camelCase | `getUserById()` |
| Constantes | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Tablas DB | snake_case | `user_profiles` |
| Columnas DB | snake_case | `created_at` |

## Responsabilidades por Carpeta

### controllers/
Manejan el flujo request-response:
- Validan inputs básicos
- Llaman a servicios
- Retornan respuestas

### services/
Contienen la lógica de negocio:
- Reglas de negocio
- Coordinación entre repositorios
- Integración con servicios externos

### repositories/
Abstracción de datos:
- Consultas SQL puras
- Métodos CRUD
- Queries complejas

### middlewares/
Funciones que se ejecutan antes de los controllers:
- Autenticación
- Validación
- Rate limiting
- Logging

### schemas/
Definiciones Zod para validación:
- Request validation
- Response typing

---

## Documentación Relacionada

- [Visión General](./overview.md)
- [Stack Tecnológico](./stack.md)
- [Patrones de Diseño](./patterns.md)
- [API](../api/index.md)
