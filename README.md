# 🍦 Crema - Plataforma de Contenidos Digitales

Plataforma all-in-one para creadores y emprendedores.

**Crema** es el motor de infraestructura para la economía de los creadores, permitiendo la comercialización, protección y escalabilidad de info-productos (Cursos, E-books, Audiolibros, Podcasts, Membresías y Software-Accesos) bajo normativas globales de transparencia financiera.

---

## 🚀 Estado del Proyecto

| Componente | Estado | Descripción |
|------------|--------|-------------|
| **Backend API** | ✅ Completo | API REST con todas las funcionalidades core |
| **Frontend** | ❌ Pendiente | Interfaz en desarrollo |
| **Documentación** | 🔄 En Progreso | Documentación en desarrollo |

---

## 🛠️ Stack Tecnológico

[![Node](https://img.shields.io/badge/node-20+-blue)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10+-orange)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue)](https://www.typescriptlang.org/)
[![Database](https://img.shields.io/badge/PostgreSQL-18-blue)](https://www.postgresql.org/)
[![Queue](https://img.shields.io/badge/BullMQ-Redis-red)](https://docs.bullmq.io/)
[![LEC](https://img.shields.io/badge/Ley_Economía_del_Conocimiento-Cumplimiento-green)](https://www.argentina.gob.ar/servicio/acceder-los-beneficios-del-regimen-de-promocion-de-la-economia-del-conocimiento)

### Backend
- Node.js 20+ con Express 5
- TypeScript 5.9+
- PostgreSQL 18
- Redis + BullMQ
- JWT (Access + Refresh Tokens)
- Mercado Pago

---

## ✨ Features Implementados

### Productos Digitales
- ✅ Cursos online con módulos y lecciones
- ✅ E-books y audiolibros
- ✅ Membresías
- ✅ Podcasts premium
- ✅ Software y accesos

### Pagos y Finanzas
- ✅ Integración con Mercado Pago
- ✅ Comisiones automáticas para afiliados
- ✅ Sistema de balances (pending/available)
- ✅ Retiros (payouts)
- ✅ Reembolsos con Safe-Guard

### LMS (Learning Management System)
- ✅ Seguimiento de progreso
- ✅ Quizzes y evaluaciones
- ✅ Certificados automáticos

### Seguridad
- ✅ JWT con refresh tokens
- ✅ 2FA (autenticación de dos factores)
- ✅ Rate limiting
- ✅ Helmet security headers

### Cumplimiento Fiscal
- ✅ Ley de Economía del Conocimiento (LEC)
- ✅ Registro de proyectos I+D
- ✅ Reportes de auditoría

### Video Streaming
- ✅ Mux Video integration
- ✅ Cloudflare Stream
- ✅ Signed URLs (protección contra piratería)

---

## 📁 Estructura del Proyecto

```
crema/
├── backend/              # API REST (Node.js + TypeScript)
│   ├── src/
│   │   ├── controllers/ # Controladores
│   │   ├── services/    # Lógica de negocio
│   │   ├── repositories/# Abstracción de DB
│   │   ├── middlewares/ # Auth, validation, etc.
│   │   ├── routes/      # Endpoints
│   │   └── utils/       # Helpers
│   └── db/              # Scripts SQL
├── frontend/            # Interfaz (próximamente)
├── shared/              # Tipos compartidos
└── docs/               # Documentación
```

---

## 🏃‍♂️ Quick Start

### Prerrequisitos
- Node.js 20+
- pnpm 10+
- Docker (para PostgreSQL y Redis)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/crema/crema.git
cd crema

# Instalar dependencias
cd backend
pnpm install

# Configurar variables de entorno
cp .env.example .env
# Edita .env con tus credenciales

# Iniciar servicios con Docker
docker-compose up -d db redis

# Iniciar servidor de desarrollo
pnpm dev
```

### Verificar

```bash
curl http://localhost:3000/health
```

---

## 📚 Documentación

La documentación completa está en la carpeta `docs/`:

- 📖 [Introducción](./docs/index.md)
- 🏗️ [Arquitectura](./docs/architecture/overview.md)
- 💻 [API Reference](./docs/api/index.md)
- 🗄️ [Base de Datos](./docs/database/schema.md)
- 💰 [Features](./docs/features/)
- 🛠️ [Desarrollo](./docs/development/setup.md)

---

## 🤝 Contribuciones

¡Las contribuciones son bienvenidas! Ver [Guía de Contribuciones](./docs/development/contributing.md).

```bash
# Crear una rama
git checkout -b feature/mi-feature

# Hacer commit
git commit -m "feat: mi nuevo feature"

# Push y crear PR
git push -u origin feature/mi-feature
```

---

## 📄 Licencia

ISC - Ver archivo `LICENSE`

---

## 📬 Contacto

- Email: soporte@crema.com
- GitHub: https://github.com/crema

---

_🍦 Crema - La plataforma para la economía de los creadores_
