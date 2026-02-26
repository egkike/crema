# Crema API Core 🍦

**Crema** es una infraestructura integral para el ecosistema de e-learning, diseñada para ofrecer seguridad avanzada a creadores y una experiencia fluida para afiliados. Destaca por su sistema **Safe-Guard** y su integración nativa con streaming profesional mediante Mux Video.

[![Node](https://img.shields.io/badge/node-20+-blue)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-orange)](https://pnpm.io/)
[![Database](https://img.shields.io/badge/PostgreSQL-18-blue)](https://www.postgresql.org/)
[![Queue](https://img.shields.io/badge/BullMQ-Redis-red)](https://docs.bullmq.io/)

---

## 🚀 Funcionalidades Destacadas

### 🛡️ Safe-Guard (Protección Antifraude)
Implementado en `src/services/access.service.ts`, este sistema protege la propiedad intelectual del creador:
- **Validación de Garantía:** Invalida automáticamente la posibilidad de reembolso si el progreso del curso supera el **30%** o si se accede a un producto descargable (Ebooks/Software).
- **Control de Acceso:** Middleware especializado (`checkAccess.middleware.ts`) que verifica la propiedad, autoría o compra antes de servir cualquier contenido protegido.

### 🎥 Streaming de Video Seguro
Integración con **Mux Video** (vía `src/utils/streaming.util.ts`) para prevenir la piratería:
- **Firmas RS256:** Generación de tokens dinámicos para URLs de video con tiempo de expiración configurable.
- **Protección HLS:** El contenido se sirve en fragmentos cifrados, impidiendo la descarga directa del archivo fuente original.

### 💳 Sistema de Pagos y Comisiones
- **Multi-pasarela:** Arquitectura basada en el patrón *Factory* (`PaymentProviderFactory.ts`) preparada para Mercado Pago y futuros proveedores.
- **Gestión de Balances:** Lógica interna para separar saldo pendiente (en garantía), disponible (para retiro) y liberado (`balance.repository.ts`).
- **Afiliación:** Tracking de referidos mediante `affiliateTracking.middleware.ts` y reparto automático de comisiones parametrizables por producto.

### 🎓 Motor de Aprendizaje (LMS)
- **Progreso en tiempo real:** Registro detallado de lecciones, módulos y seguimiento de completitud.
- **Quizzes:** Calificación automática de exámenes con registro de intentos y puntajes.
- **Certificación:** Emisión automática de certificados con código único de verificación (UUID) al alcanzar el 100% del progreso.

---

## 🛠️ Stack Tecnológico

- **Core:** Node.js v20+ con Express v5 (Manejo nativo de promesas).
- **Lenguaje:** TypeScript v5.9+.
- **Build Tool:** Esbuild (Compilación ultrarrápida).
- **Base de Datos:** PostgreSQL con Pool de conexiones nativo (`pg`).
- **Procesamiento Asíncrono:** BullMQ con Redis para colas de emails, limpieza de tokens y tareas programadas.
- **Seguridad:** JWT (Access + Refresh Tokens con rotación), Helmet, Rate Limiting y 2FA (otplib).
- **Validación:** Zod para esquemas de datos e integridad de entrada.

---

## 📁 Estructura del Proyecto

```text
src/
├── controllers/    # Controladores: admin, affiliate, balance, payout, product, etc.
├── repositories/   # Capa de persistencia: Consultas SQL puras (Patrón Repository).
├── services/       # Lógica de negocio: auth, commission, release, payment, etc.
├── queues/         # Procesamiento en segundo plano con BullMQ (Workers/Schedulers).
├── middlewares/    # Seguridad y Negocio: Safe-Guard, Role, PlanLimits, Tracking.
├── utils/          # Herramientas: Streaming (Mux), JWT, Logger (Pino), Rounder.
├── schemas/        # Esquemas de validación Zod.
└── db/             # Conexión a Postgres y scripts de inicialización.
```

---

## ⚙️ Configuración Rápida

1- Instalación:

```Bash
pnpm install
```

2- Variables de Entorno:
Crea un archivo `.env` basándote en los requerimientos del sistema:

- PostgreSQL: Credenciales de acceso a la DB.

- Redis: Host y puerto para BullMQ.

- Mercado Pago: Access Tokens para la pasarela.

- Mux: Signing Keys e IDs para el streaming seguro.

3- Ejecución:

```Bash
pnpm dev   # Desarrollo con tsx watch
pnpm build # Compilación para producción con esbuild
pnpm start # Ejecución de la build generada
```

---

## 🧪 Testing y Calidad

El proyecto utiliza Vitest para garantizar la integridad de los flujos críticos:

```Bash
pnpm test          # Ejecutar suite de pruebas
pnpm test:coverage # Reporte de cobertura de código
pnpm lint          # Verificación de estilos y errores de sintaxis
```

---

## Diseñado por Kike Garcia para el ecosistema de creadores y afiliados de Crema. 🍦
