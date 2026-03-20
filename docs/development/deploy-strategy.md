# Deploy Strategy - Railway

**Última actualización**: Marzo 2026  
**Estado**: Listo para implementar cuando el proyecto esté completo

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Análisis Comparativo](#análisis-comparativo)
3. [Planes y Comisiones](#planes-y-comisiones)
4. [Proyecciones de Crecimiento](#proyecciones-de-crecimiento)
5. [Costos Estimados](#costos-estimados)
6. [Plan de Deploy](#plan-de-deploy)
7. [Configuración Técnica](#configuración-técnica)
8. [Checklist Pre-Deploy](#checklist-pre-deploy)

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

## Planes y Comisiones

### Características de Planes (de `03-create-seeds.sql`)

| Característica | Plan Creador Initial (Gratuito) | Plan Creador Pro |
|----------------|--------------------------------|------------------|
| **Max Productos** | 15 | 100 |
| **Storage** | 0 MB (solo links externos) | 25 GB |
| **Tipos de Productos** | membership, software, course (solo link) | Todos (course, ebook, membership, software, podcast, audiobook) |
| **Subida de Archivos** | ❌ | ✅ |
| **Videos Embebidos** | ✅ YouTube/Vimeo | ✅ YouTube/Vimeo + Hosting Propio |
| **Estadísticas Avanzadas** | ❌ | ✅ |
| **Comisión Plataforma** | 10% | 8% |

### Precios del Plan Pro

| Moneda | Precio/mes | Equivalente USD (marzo 2026) |
|--------|------------|-------------------------------|
| **ARS** | $30.000 | ~$20 USD |
| **USDT** | 20 | $20 USD |

### Comisiones de Plataforma

| Config | ARS | USDT |
|--------|-----|------|
| **fee_percent** | 10% | 10% |
| **fixed_fee_low** (≤ precio umbral) | $450 ARS | 0.30 USDT |
| **fixed_fee_high** (> precio umbral) | $900 ARS | 0.60 USDT |
| **price_threshold** | $25.000 ARS | 20 USDT |

### Condiciones de Payout

| Config | ARS | USDT |
|--------|-----|------|
| **min_payout_amount** | $25.000 | 50 USDT |
| **max_payout_amount** | $1.500.000 | 1.000 USDT |
| **payout_frequency_limit** | 1/mes | 1/mes |
| **payout_processing_days** | 3 días hábiles | 3 días hábiles |
| **days_of_guarantee** | 7 días (fondo en escrow post-compra) | - |

### Impuestos

| Moneda | IVA | Notas |
|--------|-----|-------|
| **ARS** | 21% | tax_factor: 1.21, calculation: "inside" |
| **USDT** | ❌ | Sin IVA |

### Mercado Pago

| Config | Valor |
|--------|-------|
| **Comisión MP** | ~1.49% + IVA por transacción |
| **liquidity_delay_days** | 30 días (retensión antes de disponible) |

---

## Proyecciones de Crecimiento

> ⚠️ **Nota**: Para el análisis financiero completo con proyecciones a 5 años, costos fijos (dominio, contabilidad) e inflación, ver [`docs/project/business-blueprint.md`](./business-blueprint.md).

### Estimaciones de Usuarios (5 Años)

| Año | Usuarios Totales | Usuarios Plan Pro (30%) | Usuarios Plan Free (70%) |
|-----|-----------------|------------------------|-------------------------|
| **Año 1** | 100 | 30 | 70 |
| **Año 2** | 500 | 150 | 350 |
| **Año 3** | 1,500 | 450 | 1,050 |
| **Año 4** | 3,000 | 1,000 | 2,000 |
| **Año 5** | 5,000 | 2,000 | 3,000 |

### Modelo de Ingresos (Proyecciones)

| Año | Pro Users | Precio Pro | Ingresos Pro/mes (ARS) | Ingresos Pro/mes (USD) |
|-----|----------|-----------|----------------------|----------------------|
| **Año 1** | 30 | $30.000 ARS | $900,000 | ~$7,200 |
| **Año 2** | 150 | $30.000 ARS | $4,500,000 | ~$28,400 |
| **Año 3** | 450 | $30.000 ARS | $13,500,000 | ~$77,100 |
| **Año 4** | 1,000 | $30.000 ARS | $30,000,000 | ~$160,000 |
| **Año 5** | 2,000 | $30.000 ARS | $60,000,000 | ~$300,000 |

**Nota**: Tipo de cambio proyectado: $1,500 (2026) → $1,900 (2027) → $2,100 (2028) → $2,250 (2029) → $2,400 (2030). Fuente: REM BCRA Feb 2026.

### Recursos Técnicos Estimados

**Nota importante**: El Plan Pro incluye 25 GB de storage POR CREADOR. El storage total escala con la cantidad de usuarios Pro activos.

| Recurso | Año 1 (30 Pro) | Año 2 (150 Pro) | Año 3 (450 Pro) | Año 4 (1,000 Pro) | Año 5 (2,000 Pro) |
|---------|----------------|-----------------|-----------------|-------------------|-------------------|
| **RAM** | 1-2 GB | 2-4 GB | 4-8 GB | 8-16 GB | 16-32 GB |
| **CPU** | 1 vCPU | 2 vCPU | 2-4 vCPU | 4-8 vCPU | 8-16 vCPU |
| **Storage (Archivos)** | ~375 GB | ~1,875 GB | ~5,625 GB | ~12,500 GB | ~25,000 GB |
| **PostgreSQL** | 5-10 GB | 20-40 GB | 50-100 GB | 100-200 GB | 200-400 GB |
| **Redis** | 0.5 GB | 1 GB | 2 GB | 4 GB | 8 GB |

**Asunción**: ~50% de uso promedio del storage (12.5 GB/usuario). Con 100% de uso, multiplicar por 2.

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

**⚠️ Actualización Crítica**: El storage escala con usuarios Pro. Railway NFS cobra ~$0.15/GB/mes. Considerar alternativa S3/Backblaze para archivos de usuarios (~$0.006/GB/mes).

### Railway: Desglose por Servicio (compute + managed services)

| Servicio | Año 1 | Año 2 | Año 3 |
|----------|--------|--------|--------|
| **Web Service (API)** | $5-8/mes | $15-20/mes | $30-40/mes |
| **PostgreSQL** | $5-8/mes | $15-20/mes | $30-40/mes |
| **Redis** | $3-5/mes | $5-8/mes | $10-15/mes |
| **Storage NFS (Railway)** | $0-5/mes | $0-5/mes | $0-5/mes |
| **Egress (Bandwidth)** | $2-5/mes | $5-10/mes | $10-20/mes |
| **Total/mes Compute** | **$15-26** | **$40-53** | **$80-105** |

### Storage Externo (S3/Backblaze B2) - Recomendado

| Servicio | Año 1 (~375 GB) | Año 2 (~1,875 GB) | Año 3 (~5,625 GB) |
|----------|-----------------|-------------------|-------------------|
| **Backblaze B2** | ~$2-3/mes | ~$11-12/mes | ~$34/mes |
| **o S3 Standard** | ~$9/mes | ~$45/mes | ~$135/mes |

### Servicios de Terceros

**Modelo de Video Confirmado por Código** (`checkPlanLimits.middleware.ts`):
- **Plan Gratuito**: Solo videos embebidos externos (YouTube, Vimeo, etc.) — Sin costo de streaming
- **Plan Pro**: Hosting propio de video en Mux — Solo usuarios Pro generan costos de streaming

| Servicio | Uso | Plan Gratuito | Plan Pro |
|----------|-----|---------------|----------|
| **Mux** | Streaming de video HLS | ❌ (solo embebidos) | ✅ ~$0.02/GB |
| **Cloudflare Stream** | Alternativa a Mux | ❌ | ✅ ~$0.005/GB |
| **SMTP (Resend/SendGrid)** | Email transaccional | ✅ 100/día gratis | ✅ ~$20/mes |
| **Mercado Pago** | Pasarela de pagos ARS | ✅ ~1.49% + IVA | ✅ ~1.49% + IVA |

**Costo de Streaming (solo usuarios Pro)**:
| Pro Users | Videos/mes | GB/mes | Costo Mux | Costo Cloudflare |
|-----------|-----------|--------|-----------|------------------|
| 30 | 30 | 15 | ~$20/mes | ~$8/mes |
| 150 | 150 | 75 | ~$60/mes | ~$35/mes |
| 450 | 450 | 225 | ~$180/mes | ~$90/mes |
| 1,000 | 1,000 | 500 | ~$400/mes | ~$200/mes |
| 2,000 | 2,000 | 1,000 | ~$800/mes | ~$400/mes |

**Recomendación**: Mux ofrece mejor DX (developer experience) y está integrado en el código. Cloudflare es ~4x más barato pero requiere migración.

**Alternativa Zero-Cost**: Si no se habilita streaming propio, solo embebidos — el costo de streaming es $0.

**Nota sobre Mercado Pago**:
- **Comisión MP**: ~1.49% + IVA sobre cada transacción (costo operativo)
- **Comisión Plataforma**: 10% sobre base imponible + fee fijo
- Ejemplo con producto a $30.000 ARS:
  - MP cobra: ~$447 ARS (~1.49% + IVA)
  - Plataforma recibe: **$3,379.34 ARS** (variable: $2,479.34 + fija: $900)
  - Creador recibe: $30,000 - $3,379.34 - $447 = **$26,173.66 ARS**
- El `liquidity_delay_days = 30` significa que el dinero queda retenido 30 días antes de disponible para retiro

### Resumen de Costos 5 Años (Backblaze B2 + Mux)

| Período | Compute | Storage | Streaming (Mux) | SMTP | Total/mes USD |
|---------|---------|---------|-----------------|------|---------------|
| **Año 1** (30 Pro) | $15-26 | $2-3 | $15-20 | $0-5 | **$32-54** |
| **Año 2** (150 Pro) | $40-53 | $11-12 | $50-60 | $10-20 | **$111-145** |
| **Año 3** (450 Pro) | $80-105 | $34 | $150-200 | $10-20 | **$274-359** |
| **Año 4** (1,000 Pro) | $150-200 | $75 | $350-450 | $20-30 | **$595-710** |
| **Año 5** (2,000 Pro) | $250-350 | $150 | $700-900 | $30-40 | **$1,130-1,440** |

| Período | Costo/año (USD) |
|---------|-----------------|
| **Año 1** | ~$400-650 |
| **Año 2** | ~$1,300-1,700 |
| **Año 3** | ~$3,300-4,300 |
| **Año 4** | ~$7,100-8,500 |
| **Año 5** | ~$13,600-17,300 |
| **Total 5 años** | **~$25,700-33,450** |

### Relación Costo vs Ingresos (Infraestructura)

| Año | Costo Infra/mes (USD) | Ingresos Pro/mes (USD) | % Costos |
|-----|----------------------|------------------------|----------|
| **Año 1** | $32-54 | ~$7,200 | **0.4-0.8%** |
| **Año 2** | $111-145 | ~$28,400 | **0.4-0.5%** |
| **Año 3** | $274-359 | ~$77,100 | **0.4-0.5%** |
| **Año 4** | $595-710 | ~$160,000 | **0.4-0.4%** |
| **Año 5** | $1,130-1,440 | ~$300,000 | **0.4-0.5%** |

> ⚠️ **Nota**: Esta tabla solo incluye costos de infraestructura (USD). Para costos totales del negocio incluyendo dominio, contabilidad e inflación, ver [`docs/project/business-blueprint.md`](./business-blueprint.md).

**Conclusión**: Los costos de infraestructura representan menos del 1% de los ingresos Pro. El modelo es altamente rentable.

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

# Mux Video Streaming
MUX_TOKEN_ID=tu-mux-token-id
MUX_TOKEN_SECRET=tu-mux-token-secret
MUX_SIGNING_KEY_ID=tu-mux-signing-key-id
MUX_SIGNING_KEY=tu-mux-signing-key-base64

# Cloudflare Stream (alternativa)
CLOUDFLARE_ACCOUNT_ID=tu-cloudflare-account-id
CLOUDFLARE_STREAM_KEY_ID=tu-cloudflare-key-id
CLOUDFLARE_STREAM_KEY_SECRET=tu-cloudflare-key-secret

# SMTP Email (SendGrid/Resend/etc)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=tu-sendgrid-api-key
EMAIL_FROM="Crema <noreply@tu-dominio.com>"

# reCAPTCHA (opcional)
RECAPTCHA_SECRET_KEY=tu-recaptcha-secret

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

### Documentación Relacionada

- [Business Blueprint](./business-blueprint.md) - Análisis financiero completo, proyecciones 5 años, ROI, y métricas de negocio
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
