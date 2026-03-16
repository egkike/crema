# Setup Local

## Prerequisites

Antes de comenzar, asegúrate de tener instalado:

| Herramienta | Versión Mínima | Notas |
|------------|----------------|-------|
| **Node.js** | 20+ | LTS recomendado |
| **pnpm** | 10+ | Package manager del proyecto |
| **Docker** | Latest | Para servicios externos |
| **Docker Compose** | 2.0+ | Para orquestar servicios |
| **Git** | 2.0+ | Control de versiones |

---

## Clonar el Proyecto

```bash
git clone https://github.com/crema/crema.git
cd crema
```

---

## Instalación de Dependencias

```bash
# Instalar dependencias con pnpm
cd backend
pnpm install
```

---

## Configuración de Variables de Entorno

### 1. Copiar el archivo de ejemplo

```bash
cp backend/.env.example backend/.env
```

### 2. Editar las variables

Edita `backend/.env` con tus valores:

```env
# --- ENTORNO ---
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000
APP_URL=http://localhost:5173

# --- BASE DE DATOS ---
POSTGRES_USER=app_user
POSTGRES_PASSWORD=tu_password_seguro
POSTGRES_DB=crema_db
DB_HOST=localhost
DB_PORT=5432

# --- REDIS ---
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# --- JWT (Generar con: openssl rand -base64 64) ---
SECRET_JWT_KEY=tu_key_de_64_caracteres_minimo
SECRET_REFRESH_JWT_KEY=tu_refresh_key_de_64_caracteres
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
PASSWORD_PEPPER=tu_pepper_de_32_caracteres

# --- CORS ---
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

---

## Iniciar Servicios con Docker

### Iniciar PostgreSQL y Redis

```bash
cd backend
docker-compose up -d db redis
```

### Verificar que estén corriendo

```bash
docker-compose ps
```

Deberías ver:
```
crema-db      Running   postgres:18-alpine   healthy
crema-redis   Running   redis:7-alpine      healthy
```

---

## Inicializar la Base de Datos

### Opción 1: Manualmente (primera vez)

Los scripts de inicialización están en `backend/db/init/`:
- `01-create-tables.sql` - Tablas
- `02-create-indexes.sql` - Índices
- `03-create-seeds.sql` - Datos iniciales

### Opción 2: La app crea las tablas automáticamente

Al iniciar la app en desarrollo, las tablas se crean si no existen (solo desarrollo).

---

## Iniciar el Servidor de Desarrollo

```bash
cd backend
pnpm dev
```

Deberías ver:
```
>tsx watch src/index.ts

🔎 Listening on http://localhost:3000
🗄️ Database connected
🔴 Redis connected
```

---

## Verificar que Funciona

### Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "success": true,
  "status": "ok",
  "environment": "development",
  "uptime": 12.34
}
```

### Documentación Swagger

```
http://localhost:3000/api-docs
```

---

## Comandos Disponibles

### Desarrollo

```bash
pnpm dev          # Iniciar con hot-reload
pnpm build        # Compilar para producción
pnpm start        # Iniciar compilación
pnpm start:prod   # Iniciar en modo producción
```

### Testing

```bash
pnpm test         # Ejecutar tests
pnpm test:watch   # Ejecutar en watch mode
pnpm test:coverage# Coverage report
pnpm test:ci      # Tests en Docker (para CI)
```

### Calidad de Código

```bash
pnpm lint         # Verificar errores
pnpm lint:fix     # Auto-fix
pnpm format       # Formatear código
pnpm typecheck    # Verificar tipos
```

---

## Configuración de Mercado Pago (Opcional)

Para testing de pagos:

1. Crea una cuenta en [Mercado Pago Developers](https://developers.mercadopago.com/)
2. Obtén tus credenciales de test
3. Actualiza el `.env`:

```env
MERCADO_PAGO_ACCESS_TOKEN=APP_USR-xxxx-xxxx-xxxx
MERCADO_PAGO_PUBLIC_KEY=APP_USR-xxxx-xxxx-xxxx
```

---

## Configuración de Video Streaming (Opcional)

### Mux

```env
MUX_TOKEN_ID=your_id
MUX_TOKEN_SECRET=your_secret
MUX_SIGNING_KEY=your_key
```

### Cloudflare Stream

```env
CLOUDFLARE_ACCOUNT_ID=your_id
CLOUDFLARE_STREAM_KEY_ID=your_key_id
CLOUDFLARE_STREAM_KEY_SECRET=your_secret
```

---

## Configuración de Email (Opcional)

### Para desarrollo, usa Mailtrap

1. Regístrate en [Mailtrap](https://mailtrap.io/)
2. Actualiza las credenciales:

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=tu_user
SMTP_PASS=tu_password
```

---

## Ngrok (Para Webhooks)

Si necesitas recibir webhooks de Mercado Pago en local:

```bash
# Con Docker
docker-compose up -d ngrok

# O manualmente
ngrok http 3000
```

---

## Estructura de Archivos en Desarrollo

```
backend/
├── logs/              # Archivos de log
├── uploads/           # Archivos subidos
└── postgres-data/    # Datos de PostgreSQL (persistente)
```

---

## Troubleshooting

### "Connection refused" a PostgreSQL

```bash
# Verificar que Docker esté corriendo
docker ps

# Ver logs
docker-compose logs db
```

### "Connection refused" a Redis

```bash
# Verificar que Redis esté corriendo
docker ps | grep redis

# Probar conexión
redis-cli ping
```

### Error de permisos en Unix

```bash
# Si hay error de permisos en postgres-data
sudo chown -R $USER postgres-data
```

### Resetear la base de datos

```bash
# Detener servicios
docker-compose down

# Borrar datos
rm -rf backend/postgres-data

# Reiniciar
docker-compose up -d db
```

---

## Shutdown

```bash
# Detener servicios de Docker
docker-compose down

# O detener todo (incluyendo datos)
docker-compose down -v
```

---

## Ver También

- [Guía de Contribuciones](./contributing.md)
- [Guía de Estilo](./style-guide.md)
- [Arquitectura](../architecture/overview.md)
