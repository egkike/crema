# Deploy Strategy - Railway

**Última actualización**: Marzo 2026  
**Estado**: Listo para implementar cuando el proyecto esté completo

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis Comparativo](#análisis-comparativo)
3. [Proyecciones de Crecimiento](#proyecciones-de-crecimiento)
4. [Costos Estimados](#costos-estimados)
5. [Plan de Deploy](#plan-de-deploy)
6. [Configuración Técnica](#configuración-técnica)
7. [Checklist Pre-Deploy](#checklist-pre-deploy)

---

## Resumen Ejecutivo

### Decisión Tomada

**Plataforma**: Railway  
**Tipo**: PaaS (Platform as a Service)  
**Razón**: Cero DevOps, deploy automático desde GitHub, auto-scaling incluido

### Características Clave

| Aspecto | Detalle |
|---------|---------|
| **CI/CD automático** | Deploy desde GitHub en cada push a `main` |
| **Managed Services** | PostgreSQL + Redis incluidos |
| **Zero DevOps** | No requiere mantenimiento de servidores |
| **Auto-scaling** | Incluido en todos los planes |
| **Latencia desde Argentina** | ~40-50ms (São Paulo DC) |

---

## Análisis Comparativo

### Proveedores Evaluados

| Proveedor | Tipo | Costo Inicial | DevOps | CI/CD Auto | Latencia ARG |
|-----------|------|---------------|--------|------------|--------------|
| **Railway** ⭐ | PaaS | $5/mes | ✅ Zero | ✅ GitHub | ~40-50ms |
| **Render** | PaaS | $7/mes | ✅ Zero | ✅ GitHub | ~40-50ms |
| **Fly.io** | PaaS | $2/mes | ⚠️ Media | ✅ Docker | ~40-50ms |
| **FussionHost** | VPS | $15/mes | ❌ Alta | ❌ Manual | ~12-15ms |
| **AWS EC2** | IaaS | $10/mes | ❌ Muy Alta | ⚠️ Manual | ~40-50ms |

### ¿Por qué Railway?

| Factor | Railway | Render | Conclusión |
|--------|---------|--------|------------|
| **Developer Experience** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Railway wins |
| **Deploy Speed** | 30-60 seg | 60-90 seg | Railway wins |
| **Auto-scaling** | Incluido | $25+/mes | Railway wins |
| **Pay-per-use** | ✅ Flexible | ⚠️ Mínimo $7 | Railway wins |
| **Templates** | Node + Postgres pre-config | Básico | Railway wins |

### ¿Por qué NO las otras opciones?

| Opción | Razón de Descarto |
|--------|-------------------|
| **FussionHost** | Requiere configurar GitHub Actions + SSH manualmente |
| **AWS EC2** | Complejidad alta, requiere DevOps |
| **Fly.io** | Curva Docker más alta |
| **VPS Propio** | Mantenimiento manual, 0 horas disponibles |

---

## Proyecciones de Crecimiento

### Estimaciones de Usuarios

| Año | Usuarios Totales | Usuarios Plan Pro (30%) | Usuarios Plan Basic (70%) |
|-----|-----------------|------------------------|--------------------------|
| **Año 1** | 100 | 30 | 70 |
| **Año 2** | 500 | 150 | 350 |
| **Año 3** | 1.500 | 450 | 1.050 |

### Modelo de Ingresos

| Año | Usuarios Pro | Precio Pro/mes | Ingresos Pro/mes | Ingresos Pro/año |
|-----|-------------|----------------|------------------|------------------|
| **Año 1** | 30 | $30.000 ARS (~$20 USD) | $600 USD | $7.200 USD |
| **Año 2** | 150 | $30.000 ARS | $3.000 USD | $36.000 USD |
| **Año 3** | 450 | $30.000 ARS | $9.000 USD | $108.000 USD |

**Nota**: $30.000 ARS ≈ $20 USD (tipo de cambio marzo 2026)

### Recursos Técnicos Estimados

| Recurso | Año 1 | Año 2 | Año 3 |
|---------|-------|-------|-------|
| **RAM** | 1-2 GB | 2-4 GB | 4-8 GB |
| **CPU** | 1 vCPU | 2 vCPU | 2-4 vCPU |
| **Storage (Archivos)** | 25 GB | 50 GB | 100 GB |
| **PostgreSQL** | 5-10 GB | 20-40 GB | 50-100 GB |
| **Redis** | 0.5 GB | 1 GB | 2 GB |

### Latencia desde Mendoza

```
Mendoza → Buenos Aires: ~12-15ms
Mendoza → São Paulo (Railway DC): ~40-50ms
Mendoza → Miami: ~80-100ms
Mendoza → Europa: ~200-250ms
```

**Conclusión**: La latencia de ~40-50ms es perfectamente aceptable para una aplicación web.

---

## Costos Estimados

### Railway: Desglose por Servicio

| Servicio | Año 1 | Año 2 | Año 3 |
|----------|--------|--------|--------|
| **Web Service (API)** | $5-8/mes | $15-20/mes | $30-40/mes |
| **PostgreSQL** | $5-8/mes | $15-20/mes | $30-40/mes |
| **Redis** | $3-5/mes | $5-8/mes | $10-15/mes |
| **Storage (NFS)** | $2-5/mes | $10-15/mes | $20-30/mes |
| **Egress (Bandwidth)** | $2-5/mes | $5-10/mes | $10-20/mes |
| **Total/mes** | **$17-31** | **$50-73** | **$100-145** |

### Resumen de Costos 3 Años

| Período | Costo/mes | Costo/año |
|---------|-----------|-----------|
| **Año 1** | $17-31 USD | ~$300-400 USD |
| **Año 2** | $50-73 USD | ~$700-900 USD |
| **Año 3** | $100-145 USD | ~$1,400-1,800 USD |
| **Total 3 años** | - | **~$2,400-3,100 USD** |

### Relación Costo vs Ingresos

| Año | Costo Hosting/mes | Ingresos Pro/mes | % Hosting |
|-----|-------------------|-------------------|-----------|
| **Año 1** | $17-31 | $600 | 3-5% |
| **Año 2** | $50-73 | $3.000 | 1.7-2.4% |
| **Año 3** | $100-145 | $9.000 | 1.1-1.6% |

**Conclusión**: El hosting representa entre 1-5% de los ingresos según el año. Railway es altamente rentable.

---

## Plan de Deploy

### Fase 1: Preparación (Cuando el proyecto esté completo)

#### 1.1 Preparar el Repositorio

```bash
# Asegurarse de que el repo esté limpio
git status
git push origin main
```

#### 1.2 Configurar Variables de Entorno

Crear archivo `.env.production` con:

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# Auth
SECRET_JWT_KEY=generar-nueva-key-segura
SECRET_REFRESH_JWT_KEY=generar-nueva-key-segura
PASSWORD_PEPPER=generar-pepper-seguro

# Mercado Pago (PRODUCCIÓN)
MERCADOPAGO_ACCESS_TOKEN=tu-token-produccion
MERCADOPAGO_WEBHOOK_SECRET=tu-secret

# URLs
FRONTEND_URL=https://tu-dominio.com
API_BASE_URL=https://api.tu-dominio.com
```

#### 1.3 Crear archivo de configuración Railway

```yaml
# railway.toml (en la raíz del proyecto)
[build]
builder = "nixpacks"
builderVersion = "v1"

[deploy]
numReplicas = 1
restartPolicyType = "OnFailure"
restartPolicyMaxRetries = 10

[healthcheck]
Path = "/health"
Port = 3000
```

### Fase 2: Setup en Railway (15-30 minutos)

#### 2.1 Crear Cuenta

1. Ir a [railway.app](https://railway.app)
2. Registrarse con GitHub
3. Verificar email

#### 2.2 Nuevo Proyecto

1. Click "New Project"
2. Seleccionar "Deploy from GitHub repo"
3. Conectar repo `crema`
4. Railway detectará Node.js automáticamente

#### 2.3 Provisionar Servicios

```
Proyecto Crema
├── API (Web Service) ──────► puerto 3000
├── PostgreSQL ──────────────► Variable: DATABASE_URL
└── Redis ──────────────────► Variable: REDIS_URL
```

#### 2.4 Configurar Variables

En Railway dashboard, ir a cada servicio y configurar:

**API Service:**
```env
NODE_ENV=production
DATABASE_URL=${PostgreSQL.DATABASE_URL}
REDIS_URL=${Redis.REDIS_URL}
SECRET_JWT_KEY=<generar>
SECRET_REFRESH_JWT_KEY=<generar>
PASSWORD_PEPPER=<generar>
FRONTEND_URL=https://tu-dominio.com
API_BASE_URL=https://api.tu-dominio.com
MERCADOPAGO_ACCESS_TOKEN=<token-prod>
```

**PostgreSQL:**
- Puerto: 5432 (default)
- Zona: São Paulo (más cercana a Argentina)

**Redis:**
- Puerto: 6379 (default)

#### 2.5 Configurar Dominio (Opcional)

1. Ir a Settings → Networking → Add Domain
2. Agregar `api.tu-dominio.com`
3. Configurar DNS CNAME en tu proveedor
4. SSL se configura automáticamente

### Fase 3: Deploy Automático

#### 3.1 Trigger Manual

```bash
# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Link proyecto
railway link

# Deploy manual (también se puede hacer desde dashboard)
railway up
```

#### 3.2 Deploy Automático desde GitHub

Railway deploya automáticamente cuando:

1. Conectás el repo de GitHub
2. Hacés push a cualquier branch
3. **Solo deploya a producción si configurás trigger en `main`**

```bash
# Configurar producción en main
git checkout main
git merge develop  # o la branch de staging
git push origin main
# Railway detecta el push y deploya automáticamente
```

#### 3.3 Monitoreo

```bash
# Ver logs en tiempo real
railway logs

# Ver estado
railway status

# Abrir dashboard
railway open
```

### Fase 4: Post-Deploy

#### 4.1 Verificaciones

- [ ] Health check responde 200
- [ ] API responde correctamente
- [ ] Base de datos conectada
- [ ] Redis conectado
- [ ] Mercado Pago webhook configurado

#### 4.2 Configurar Mercado Pago Webhook

1. Ir a [Mercado Pago Developers](https://developers.mercadopago.com/)
2. Configurar URL de webhook:
   ```
   https://api.tu-dominio.com/api/payments/webhook/mercadopago
   ```

#### 4.3 Configurar ngrok (Opcional - para testing)

```bash
# Solo si necesitás exponer localhost temporalmente
ngrok http 3000
```

---

## Configuración Técnica

### Docker Support

Railway soporta `Dockerfile` nativo:

```dockerfile
# Dockerfile (ya existe en el proyecto)
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
```

### Health Check

El endpoint `/health` ya existe en el backend:

```typescript
// src/routes/health.ts (verificar que exista)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

### Variables de Entorno Requeridas

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `NODE_ENV` | Entorno | `production` |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `REDIS_URL` | Redis connection | `redis://...` |
| `SECRET_JWT_KEY` | JWT secret (generar) | 64 chars random |
| `SECRET_REFRESH_JWT_KEY` | Refresh JWT secret | 64 chars random |
| `PASSWORD_PEPPER` | Password pepper | 32 chars random |
| `FRONTEND_URL` | URL del frontend | `https://crema.com` |
| `API_BASE_URL` | URL de la API | `https://api.crema.com` |
| `MERCADOPAGO_ACCESS_TOKEN` | Token MP producción | `APP_USR-...` |
| `MERCADOPAGO_WEBHOOK_SECRET` | Webhook secret | `sha256=...` |

### Scripts Útiles

```bash
# Deploy manual
railway up

# Deploy con variables
railway up --variable KEY=value

# Ver logs
railway logs -f

# Abrir shell en el contenedor
railway shell

# Ver métricas
railway metrics
```

---

## Checklist Pre-Deploy

### Código

- [ ] Todos los tests pasan (`pnpm test`)
- [ ] Lint sin errores (`pnpm lint`)
- [ ] TypeScript sin errores (`pnpm typecheck`)
- [ ] Build exitoso (`pnpm build`)

### Configuración

- [ ] Variables de producción configuradas
- [ ] Mercado Pago en modo producción
- [ ] URLs de producción configuradas
- [ ] Keys JWT regeneradas (no usar las de dev)

### Base de Datos

- [ ] Migraciones probadas
- [ ] Seeds de producción (si aplica)
- [ ] Backup del schema

### Monitoreo

- [ ] Health check configurado
- [ ] Alertas de Railway activadas
- [ ] Slack/Email notifications configurados (opcional)

### Seguridad

- [ ] CORS configurado para producción
- [ ] Rate limiting activo
- [ ] Helmet security headers
- [ ] Variables sensibles en Railway (no en código)

---

## Recursos Adicionales

### Documentación

- [Railway Docs](https://docs.railway.app)
- [Railway CLI](https://docs.railway.app/reference/cli)
- [Railway Templates](https://railway.app/templates)

### Comandos Rápidos

```bash
# Instalar CLI
npm i -g @railway/cli

# Login
railway login

# Deploy
railway up

# Logs
railway logs -f

# Variables
railway variables

# Dashboard
railway open
```

---

## Próximos Pasos

1. **Completar backend** (endpoints faltantes, tests)
2. **Desarrollar frontend-main** (interfaz de usuario)
3. **Desarrollar frontend-admin** (panel administrativo)
4. **Configurar Railway** (setup inicial)
5. **Testing en staging** (deploy de prueba)
6. **Go-live** (deploy a producción)

---

## Notas

- La documentación se actualizará cuando el proyecto avance
- Railway ofrece $5 de crédito gratis para nuevos usuarios
- PostgreSQL y Redis se cobran por uso, no tienen precio fijo

---

*Documento preparado para el proyecto Crema - Marzo 2026*
