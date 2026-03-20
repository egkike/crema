# Business Blueprint - Crema

**Versión**: 1.0  
**Fecha**: Marzo 2026  
**Estado**: Draft para aprobación  
**Owner**: Kike García

---

## Tabla de Contenidos

1. [Modelo de Negocio](#1-modelo-de-negocio)
2. [Planes y Pricing](#2-planes-y-pricing)
3. [Comisiones y Fees](#3-comisiones-y-fees)
4. [Costos de Infraestructura](#4-costos-de-infraestructura)
5. [Proyecciones de Crecimiento](#5-proyecciones-de-crecimiento)
6. [Beneficio Fiscal (LEC + Mendoza)](#6-beneficio-fiscal-lec--mendoza)
7. [Utilidad Neta](#7-utilidad-neta)
8. [Roadmap de Desarrollo](#8-roadmap-de-desarrollo)
9. [KPIs del Negocio](#9-kpis-del-negocio)
10. [Conclusión Financiera](#10-conclusión-financiera)

---

## 1. Modelo de Negocio

| Aspecto | Detalle |
|---------|---------|
| **Tipo** | SaaS + Marketplace (Transaccional) |
| **Target** | Creadores de contenido digital en Argentina + Latinoamérica |
| **Monedas** | ARS (principal), USDT (crypto) |
| **Revenue Streams** | 1) Suscripciones Pro 2) Comisiones por transacción |
| **Modelo Fiscal** | S.A.S. + MiPyME + Ley Economía del Conocimiento |
| **Ubicación** | Mendoza, Argentina |

### Fuentes de Ingreso

| Stream | Descripción | % Expected |
|--------|-------------|------------|
| **Suscripciones Pro** | $30.000 ARS/mes por creador | ~30% |
| **Comisiones** | 8-10% por venta | ~70% |

---

## 2. Planes y Pricing

> Los valores de esta sección están confirmados en `backend/db/init/03-create-seeds.sql`.

### Características de Planes

| Característica | Plan Creador Initial (Gratuito) | Plan Creador Pro |
|----------------|----------------------------------|------------------|
| **Max Productos** | 15 | 100 |
| **Storage** | 0 MB (solo links externos) | 25 GB (2,560 MB) |
| **Tipos de Productos** | membership, software, course (link) | Todos los tipos |
| **Videos** | Solo embebidos (YouTube/Vimeo) | ✅ Hosting propio (Mux HLS) |
| **Subida de Archivos** | ❌ | ✅ |
| **Estadísticas Avanzadas** | ❌ | ✅ |
| **Comisión Plataforma** | 10% | 8% |

### Precios de Suscripción Pro

| Moneda | Precio/mes | Equivalente USD (marzo 2026) |
|--------|------------|------------------------------|
| **ARS** | $30.000 | ~$20 USD |
| **USDT** | 20 | ~$20 USD |

---

## 3. Comisiones y Fees

> Los valores de esta sección están confirmados en `backend/db/init/03-create-seeds.sql`.

### Parámetros de Comisión

| Config | ARS | USDT |
|--------|-----|------|
| **fee_percent** | 10% | 10% |
| **fixed_fee_low** (≤ precio umbral) | $450 ARS | 0.30 USDT |
| **fixed_fee_high** (> precio umbral) | $900 ARS | 0.60 USDT |
| **price_threshold** | $25.000 ARS | 20 USDT |

### Fórmula de Cálculo de Comisión

```
grossAmount = precio del producto
baseImponible = grossAmount / tax_factor (si IVA inside)
platformFee = (baseImponible × fee_percent) + fixedFee
gatewayFee = MP cobra ~1.49% + IVA
netProfitCrema = platformFee - gatewayFee (en base imponible)
```

### Ejemplo: Producto $30,000 ARS (Plan Pro)

| Concepto | Valor | Notas |
|----------|-------|-------|
| Precio producto | $30,000 ARS | - |
| IVA (21% inside) | $5,206.61 ARS | tax_factor: 1.21 |
| Base imponible | $24,793.39 ARS | 30,000 / 1.21 |
| Comisión variable (10%) | $2,479.34 ARS | base × 0.10 |
| Fee fijo (>$25k) | $900 ARS | fixed_fee_high |
| **Total plataforma** | **$3,379.34 ARS** | variable + fijo |
| MP cobra (~1.49% + IVA) | $447 ARS | - |
| **Creador recibe** | **$26,173.66 ARS** | gross - plataforma - MP |

### Margen Real por Transacción

| Métrica | Valor |
|---------|-------|
| Plataforma recibe | $3,379.34 ARS |
| MP cobra | $447 ARS |
| **Margen neto Crema** | **$2,932.34 ARS** |
| **% sobre venta** | **9.77%** |

> **Nota**: El margen se mantiene ~9.6-9.8% independientemente del precio gracias al `price_threshold`.

### Condiciones de Payout

| Config | ARS | USDT |
|--------|-----|------|
| **min_payout_amount** | $25.000 | 50 USDT |
| **max_payout_amount** | $1.500.000 | 1.000 USDT |
| **payout_frequency_limit** | 1/mes | 1/mes |
| **payout_processing_days** | 3 días hábiles | 3 días hábiles |
| **days_of_guarantee** | 7 días (escrow) | - |
| **liquidity_delay_days (MP)** | 30 días | - |

### Mercado Pago

| Config | Valor |
|--------|-------|
| **Comisión MP** | ~1.49% + IVA (liquidity 30 días) |
| **liquidity_delay_days** | 30 días (retensión antes de disponible) |

---

## 4. Costos de Infraestructura

> Basado en `docs/development/deploy-strategy.md`.

### Proyección Tipo de Cambio ARS/USD

| Año | Tipo de Cambio | Variación | Fuente |
|-----|----------------|-----------|--------|
| 2026 (base) | $1,500 ARS/USD | - | Mercado actual |
| 2027 | $1,900 ARS/USD | +27% | REM BCRA + LatinFocus |
| 2028 | ~$2,100 ARS/USD | +11% | Extrapolación |
| 2029 | ~$2,250 ARS/USD | +7% | Extrapolación |
| 2030 | ~$2,400 ARS/USD | +7% | Extrapolación |

> **Fuentes tipo de cambio**:
> - **2026**: $1,707-$1,753 (REM BCRA Feb 2026 y Dic 2025)
> - **2027**: $1,947 (LatinFocus Consensus Dic 2025)
> - **2028-2030**: Extrapolación basada en depreciación gradual

### Proyección Inflación Anual Argentina

| Año | Inflación Anual | Acumulada | Variación | Fuente |
|-----|----------------|-----------|-----------|--------|
| **2026** | 26.1% | 1.26x | - | REM BCRA Feb 2026 |
| **2027** | 12.7% | 1.42x | -14.3pp | REM BCRA Dic 2025 |
| **2028** | 9.5% | 1.56x | -3.2pp | REM BCRA Dic 2025 |
| **2029** | ~7.0% | 1.67x | -2.5pp | Extrapolación |
| **2030** | ~5.0% | 1.75x | -2.0pp | Extrapolación |
| **Promedio 5 años** | **~12%** | - | - | - |

> **Fuentes de Inflación**:
> - **2026-2028**: [REM BCRA - Relevamiento de Expectativas de Mercado](https://www.bcra.gob.ar/PublicacionesEstadisticas/Relevamiento_Expectativas_de_Mercado.asp) (Febrero 2026)
> - **2029-2030**: Extrapolación basada en tendencia decreciente del REM
>
> **Artículos de referencia**:
> - [BAE Negocios - Proyección 26.1%](https://www.baenegocios.com/finanzas/los-analistas-del-bcra-elevaron-la-proyeccion-de-inflacion-para-2026-al-26-1/)
> - [Infobae - Inflación en 2 dígitos hasta 2028](https://www.infobae.com/economia/2026/03/11/desaceleracion-mas-lenta-se-demora-la-caida-de-la-inflacion-a-un-digito-anual-segun-los-principales-analistas/)
> - [ON24 - REM Dic 2025](https://www.on24.com.ar/economia/el-rem-del-banco-central-proyecta-inflacion-anual-del-20-y-dolar-oficial-a-1-753-para-fines-de-2026/)

### Costos Variables por Usuario Pro (USD)

| Servicio | Costo/GB o Fijo | Notas |
|----------|-----------------|-------|
| **Compute (Railway)** | $0.50-1/Pro/mes | Escala con usuarios |
| **Storage (Backblaze B2)** | $0.006/GB | 25 GB/usuario |
| **Streaming (Mux)** | $0.02/GB | Solo videos Pro |
| **SMTP** | ~$0.50/Pro/mes | Resend/SendGrid |

### Costos Mensuales por Año (USD)

| Servicio | Año 1 (30 Pro) | Año 2 (150 Pro) | Año 3 (450 Pro) | Año 4 (1,000 Pro) | Año 5 (2,000 Pro) |
|----------|-----------------|-----------------|-----------------|-------------------|-------------------|
| **Compute** | $15-26 | $40-53 | $80-105 | $150-200 | $250-350 |
| **Storage** | $2-3 | $11-12 | $34 | $75 | $150 |
| **Streaming** | $15-20 | $50-60 | $150-200 | $350-450 | $700-900 |
| **SMTP** | $0-5 | $10-20 | $10-20 | $20-30 | $30-40 |
| **Subtotal USD/mes** | **$32-54** | **$111-145** | **$274-359** | **$595-710** | **$1,130-1,440** |

### Costos Fijos (No escalan con usuarios)

| Ítem | Mensual Base | Anual Base 2026 | Inflación Proyectada |
|------|--------------|-----------------|---------------------|
| **Dominio (.com.ar)** | - | $15,000 | 26.1% (2026) → 5% (2030) |
| **Contabilidad (Mendoza)** | $120,000 | $1,440,000 | 26.1% (2026) → 5% (2030) |
| **Gastos apertura** | - | $450,000 | (una vez) |

### Proyección Costos Fijos con Inflación (ARS)

Basado en proyecciones oficiales del REM BCRA:

| Ítem | Año 1 (26.1%) | Año 2 (12.7%) | Año 3 (9.5%) | Año 4 (~7%) | Año 5 (~5%) |
|------|---------------|----------------|---------------|-------------|-------------|
| **Dominio** | $15K | $17K | $18K | $20K | $21K |
| **Contabilidad** | $1.44M | $1.62M | $1.78M | $1.90M | $2.00M |
| **Apertura** | $450K | - | - | - | - |
| **Total Fijos** | **$1.91M** | **$1.64M** | **$1.80M** | **$1.92M** | **$2.02M** | |

### Costos Totales en ARS (Infraestructura + Fijos)

| Período | Infra (USD→ARS) | Fijos Inflados | Total ARS | Total USD |
|---------|-----------------|----------------|-----------|-----------|
| **Año 1** | $774K | $1,905K | **$2,679K** | $1,786 |
| **Año 2** | $2,765K | $1,640K | **$4,405K** | $2,447 |
| **Año 3** | $8,342K | $1,800K | **$10,142K** | $4,610 |
| **Año 4** | $20,342K | $1,920K | **$22,262K** | $8,562 |
| **Año 5** | $46,260K | $2,020K | **$48,280K** | $16,093 |

> **Nota**: Los costos USD se mantienen constantes. El tipo de cambio afecta la conversión ARS→USD pero no los costos reales en dólares.

### Conclusión Financiera: Costos

| Métrica | Valor |
|---------|-------|
| **Costo por usuario Pro (Año 1)** | $2,150 ARS/mes ($43 ÷ 30) |
| **Costo por usuario Pro (Año 5)** | $1,928 ARS/mes ($3,855K ÷ 2,000) |
| **% Infra/Ingresos (Año 1)** | 3.7% (sobre suscripciones) |
| **% Infra/Ingresos (Año 5)** | 8.6% (sobre suscripciones) |
| **Inflación promedio (5 años)** | ~12% (vs 29% estimado) |
| **Reducción costos fijos 5 años** | ~94% menos que sin desinflación |
| **Escalabilidad** | ✅ Costs scale slower than revenue |

---

## 5. Proyecciones de Crecimiento

### Premisas

| Variable | Valor |
|----------|-------|
| **Mix usuarios Pro** | 30% |
| **Costo MP (liquidity 30d)** | 1.49% + IVA |
| **Margen transaccional** | ~9.6% promedio |
| **IVA** | 21% (inside) |

### Crecimiento de Usuarios

| Año | Usuarios Totales | Pro (30%) | Free (70%) |
|-----|------------------|-----------|------------|
| 1 | 100 | 30 | 70 |
| 2 | 500 | 150 | 350 |
| 3 | 1,500 | 450 | 1,050 |
| 4 | 3,000 | 1,000 | 2,000 |
| 5 | 5,000 | 2,000 | 3,000 |

### Escenario A: Ticket Promedio $45,000 ARS

| Año | Pro (30%) | GMV Anual (ARS) | Tipo Cambio | GMV Anual (USD) | Ingreso Suscrip. (ARS) | Ingreso Suscrip. (USD) |
|-----|-----------|------------------|-------------|-----------------|------------------------|------------------------|
| 1 | 30 | $108,000,000 | $1,500 | $72,000 | $10,800,000 | $7,200 |
| 2 | 150 | $540,000,000 | $1,900 | $284,211 | $54,000,000 | $28,421 |
| 3 | 450 | $1,620,000,000 | $2,100 | $771,429 | $162,000,000 | $77,143 |
| 4 | 1,000 | $3,600,000,000 | $2,250 | $1,600,000 | $360,000,000 | $160,000 |
| 5 | 2,000 | $7,200,000,000 | $2,400 | $3,000,000 | $720,000,000 | $300,000 |

### Escenario B: Ticket Promedio $22,500 ARS

| Año | Pro (30%) | GMV Anual (ARS) | Tipo Cambio | GMV Anual (USD) | Ingreso Suscrip. (ARS) | Ingreso Suscrip. (USD) |
|-----|-----------|------------------|-------------|-----------------|------------------------|------------------------|
| 1 | 30 | $54,000,000 | $1,500 | $36,000 | $10,800,000 | $7,200 |
| 2 | 150 | $270,000,000 | $1,900 | $142,105 | $54,000,000 | $28,421 |
| 3 | 450 | $810,000,000 | $2,100 | $385,714 | $162,000,000 | $77,143 |
| 4 | 1,000 | $1,800,000,000 | $2,250 | $800,000 | $360,000,000 | $160,000 |
| 5 | 2,000 | $3,600,000,000 | $2,400 | $1,500,000 | $720,000,000 | $300,000 |

---

## 6. Beneficio Fiscal (LEC + Mendoza)

> Registro Provincial de Economía del Conocimiento + S.A.S. MiPyME

### Impuestos Comparativa

| Impuesto | Tradicional | LEC Mendoza |
|----------|-------------|-------------|
| **IIBB** | 3.5-5% | **0%** |
| **Ganancias** | 35% | **14%** |
| **Impuesto al Cheque** | 1.2% | **Recuperable 100%** |
| **IVA** | 21% | **Compensable con Bonos LEC** |
| **Impuesto de Sellos** | 1.5% | **0%** |

### Ahorro Fiscal Estimado (5 años)

| Impuesto | Sin LEC | Con LEC | Ahorro |
|----------|---------|---------|--------|
| IIBB (5%) | ~$327M | $0 | **$327M** |
| Ganancias (35%→14%) | ~$370M | $148M | **$222M** |
| Sellos | ~$50M | $0 | **$50M** |
| **Total** | | | **~$599M** |

---

## 7. Utilidad Neta

### Punto de Equilibrio

| Concepto | Valor |
|----------|-------|
| **Costos Fijos Año 1** | $2,679,000 ARS |
| **Ingreso Pro/mes** | 30 × $30,000 = $900,000 ARS |
| **Usuarios Pro para break-even** | **3 usuarios** |
| **Tiempo para break-even** | **Mes 1** |

> **Con solo 3 usuarios Pro, los costos están cubiertos. Toda transacción adicional es ganancia pura.**

### Utilidad Neta Ajustada por Inflación (LEC 14%)

> **Inflación proyectada**: Basada en REM BCRA Feb 2026 (26.1% 2026, 12.7% 2027, 9.5% 2028, ~7% 2029, ~5% 2030)

**Escenario A ($45k ticket):**

| Año | GMV (ARS) | GMV (USD) | Margen (9.6%) | Suscrip. | Costos Totales | Utilidad Neta (ARS) | Utilidad Neta (USD) | % Rentabilidad |
|------|-----------|-----------|----------------|----------|----------------|--------------------|--------------------|----------------|
| 1 | $108M | $72K | $10.37M | $10.8M | $2.68M | **$16.4M** | $10.9K | **74%** |
| 2 | $540M | $284K | $51.8M | $54M | $4.41M | **$87.4M** | $46K | **83%** |
| 3 | $1.62B | $771K | $155.5M | $162M | $10.14M | **$265.1M** | $126K | **84%** |
| 4 | $3.6B | $1.6M | $345.6M | $360M | $22.26M | **$591M** | $263K | **84%** |
| 5 | $7.2B | $3M | $691.2M | $720M | $48.28M | **$1,160M** | $483K | **82%** |

**Escenario B ($22.5k ticket):**

| Año | GMV (ARS) | GMV (USD) | Margen (9.6%) | Suscrip. | Costos Totales | Utilidad Neta (ARS) | Utilidad Neta (USD) | % Rentabilidad |
|------|-----------|-----------|----------------|----------|----------------|--------------------|--------------------|----------------|
| 1 | $54M | $36K | $5.2M | $10.8M | $2.68M | **$12.2M** | $8.1K | **76%** |
| 2 | $270M | $142K | $25.9M | $54M | $4.41M | **$65.8M** | $34.6K | **82%** |
| 3 | $810M | $386K | $77.8M | $162M | $10.14M | **$198.2M** | $94K | **82%** |
| 4 | $1.8B | $800K | $172.8M | $360M | $22.26M | **$441M** | $196K | **83%** |
| 5 | $3.6B | $1.5M | $345.6M | $720M | $48.28M | **$895M** | $373K | **84%** |

### Comparativa de Escenarios

| Métrica | Esc. A ($45k) | Esc. B ($22.5k) | Diferencia |
|---------|---------------|------------------|------------|
| **GMV 5 años** | $13.07B ARS | $6.53B ARS | 2x |
| **GMV 5 años** | $5.73M USD | $2.89M USD | +98% |
| **Utilidad Neta 5 años** | $2,120M ARS | $1,612M ARS | +32% |
| **Utilidad Neta 5 años (USD)** | $1,039K USD | $706K USD | +47% |
| **Rentabilidad promedio** | 81% | 81% | igual | |

### Conclusión: Escenario Recomendado

> **Escenario A ($45k ticket)** es 32% más rentable en ARS. La diferencia se reduce a 29% en USD debido a la apreciación cambiaria proyectada.

---

## 8. Roadmap de Desarrollo

### Dependencias

| Documento | Relación |
|-----------|----------|
| `docs/project/roadmap.md` | Features priorizadas |
| `docs/development/deploy-strategy.md` | Infraestructura |
| `backend/db/init/03-create-seeds.sql` | Configuraciones de negocio |

### Backend - Pendiente

| Feature | Prioridad | Estimación | Dependencias |
|---------|-----------|------------|--------------|
| Testing coverage (~70%) | 🔴 Alta | 2 semanas | CI/CD |
| Webhooks MP producción | 🔴 Alta | 1 semana | Tokens prod |
| Cola de Payouts (BullMQ) | 🟡 Media | 2 semanas | Balance service |
| API Afiliados completa | 🟡 Media | 3 semanas | Dashboard |
| Export/Reportes | 🟡 Media | 2 semanas | Admin |
| Dashboard Admin básico | 🟢 Baja | 4 semanas | Auth, RBAC |

### Frontend-Main

| Feature | Prioridad | Estimación | Dependencias |
|---------|-----------|------------|--------------|
| Landing page | 🔴 Alta | 1 semana | SEO, copy |
| Auth (registro/login) | 🔴 Alta | 2 semanas | Backend API |
| Checkout productos | 🔴 Alta | 2 semanas | MP integration |
| Dashboard creador | 🟡 Media | 3 semanas | Auth |
| Player video (Mux) | 🟡 Media | 2 semanas | Backend |
| Gestión productos | 🟡 Media | 3 semanas | CRUD API |

### Frontend-Admin

| Feature | Prioridad | Estimación | Dependencias |
|---------|-----------|------------|--------------|
| Auth + RBAC | 🔴 Alta | 2 semanas | Backend |
| Gestión usuarios | 🔴 Alta | 1 semana | Auth |
| Reportes ingresos | 🟡 Media | 2 semanas | Admin API |
| Dashboard metrics | 🟡 Media | 2 semanas | Admin API |

### Timeline Estimado Total

| Fase | Features | Semanas |
|------|----------|---------|
| **1. Backend Core** | Tests, webhooks, payouts | 5 |
| **2. Frontend-Main MVP** | Landing, auth, checkout | 5 |
| **3. Frontend-Admin MVP** | Auth, users, reports | 4 |
| **4. Integración** | Mux, MP, deploy | 3 |
| **Total estimado** | | **~17 semanas** |

---

## 9. KPIs del Negocio

| KPI | Fórmula | Target Año 1 | Target Año 3 | Target Año 5 |
|-----|---------|--------------|--------------|--------------|
| **MRR** | Pro × $30,000 | $900K/mes | $13.5M/mes | $60M/mes |
| **ARR** | MRR × 12 | $10.8M/año | $162M/año | $720M/año |
| **GMV** | Ventas totales | $9M/mes | $135M/mes | $600M/mes |
| **Churn Pro** | Lost Pro / Total | <5% | <3% | <2% |
| **LTV** | MRR × 1/Churn | $216K | $540K | $1.8M |
| **CAC** | Mktg / Nuevos | $0 | $0 | $0 |
| **Burn Rate** | Costos mensuales | $223K/mes | $900K/mes | $4.15M/mes |
| **Runway** | Caja / Burn | N/A | N/A | N/A |

### Conclusión: KPIs

| Métrica | Año 1 | Año 3 | Año 5 |
|---------|-------|-------|-------|
| **MRR Growth** | Base | 15x | 67x |
| **Margen Operativo** | 74% | 83% | 82% |
| **LTV:CAC Ratio** | ∞ | ∞ | ∞ |
| **Escalabilidad** | ✅ | ✅ | ✅ |

---

## 10. Conclusión Financiera

### Variables Clave del Negocio

| Variable | Valor | Importancia |
|----------|-------|-------------|
| **Break-even** | 3 usuarios Pro | 🔑 Muy bajo riesgo |
| **Margen por usuario Pro** | ~$28,000 ARS/mes (93%) | 🔑 Alta rentabilidad |
| **Inflación promedio (5 años)** | ~12%/año | ✅ Tendencia decreciente |
| **Inflación 2026** | 26.1% | Fuente: REM BCRA |
| **Inflación objetivo 2030** | ~5% | Extrapolación REM |
| **Costo MP** | 1.49% + IVA | ✅ Bajo con 30 días |

### Métricas Financieras Finales (5 años)

| Métrica | Escenario A ($45k) | Escenario B ($22.5k) |
|---------|-------------------|----------------------|
| **GMV Acumulado** | $13.07B ARS | $6.53B ARS |
| **GMV Acumulado (USD)** | $5.73M USD | $2.89M USD |
| **Utilidad Neta 5 años** | $2,120M ARS | $1,612M ARS |
| **Utilidad Neta 5 años (USD)** | $1,039K USD | $706K USD |
| **ROI vs costos totales** | ~3,100% | ~2,400% |
| **Rentabilidad promedio** | 81% | 81% |
| **Break-even** | Mes 1 | Mes 1 |

### Drivers de Valor

1. **Suscripciones como base estable**: 30% del revenue es recurrente y predecible
2. **Comisiones escalan con inflación**: Al ser %, se ajustan automáticamente
3. **Costos fijos decrecientes**: Inflación proyectada en baja (26%→5%)
4. **LEC reduce impuestos**: 14% vs 35% = ~60% ahorro en Ganancias
5. **Break-even inmediato**: Solo 3 Pro users cubren todos los costos

### Inversión Inicial Requerida

| Ítem | Valor (ARS) | Valor (USD) |
|------|-------------|-------------|
| Gastos apertura (SAS, tasas) | $450,000 | $300 |
| Reserva costs 2 meses | $2,680,000 | $1,787 |
| **Total** | **$3,130,000** | **~$2,087** |

### Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Churn alto Pro | Media | Alto | Features exclusivas, comunidad |
| Aumento costos Mux | Baja | Medio | Alternativa Cloudflare 4x más barato |
| Regulación crypto | Baja | Alto | USDT opcional, ARS principal |
| Devaluación >proyección | Media | Medio | Revenue en ARS, costos fijos en USD |
| Inflación >26%持久 | Baja | Medio | Ajustar precios suscripción anualmente |

---

## Anexo: Fuentes y Referencias

### Fuentes Macroeconómicas

| Variable | Fuente | Fecha | Enlace |
|---------|--------|-------|--------|
| **Inflación 2026** | REM BCRA Feb 2026 | Marzo 2026 | [bcra.gob.ar](https://www.bcra.gob.ar/PublicacionesEstadisticas/Relevamiento_Expectativas_de_Mercado.asp) |
| **Inflación 2027-2028** | REM BCRA Dic 2025 | Enero 2026 | [bcra.gob.ar](https://www.bcra.gob.ar/publicaciones/relevamiento-de-expectativas-de-mercado-diciembre-de-2025/) |
| **Inflación 2029-2030** | Extrapolación propia | Marzo 2026 | Basado en tendencia REM |
| **Tipo de cambio 2026** | REM BCRA Feb 2026 | Marzo 2026 | $1,707 (dic 2026) |
| **Tipo de cambio 2027** | LatinFocus Dic 2025 | Dic 2025 | $1,947 |
| **Tipo de cambio 2028-2030** | Extrapolación propia | Marzo 2026 | Basado en depreciación gradual |

### Artículos de Referencia

| Título | Fuente | Fecha |
|--------|--------|-------|
| Proyección inflación 2026 al 26.1% | BAE Negocios | Marzo 2026 |
| Inflación en 2 dígitos hasta 2028 | Infobae | Marzo 2026 |
| REM Dic 2025: Inflación 20% y dólar $1,753 | ON24 | Enero 2026 |
| Expectativas de mercado BCRA | Calcular Sueldo | Marzo 2026 |
| Tipo de cambio 2027: $1,947 | LatinFocus Infobae | Dic 2025 |

### Configuraciones Técnicas

| Config | Archivo | Valor |
|--------|---------|-------|
| `fee_percent` | `03-create-seeds.sql` | 10% |
| `fixed_fee_low` | `03-create-seeds.sql` | $450 ARS |
| `fixed_fee_high` | `03-create-seeds.sql` | $900 ARS |
| `price_threshold` | `03-create-seeds.sql` | $25,000 ARS |
| `storage_mb` (Pro) | `03-create-seeds.sql` | 25,600 MB |
| `max_products` (Pro) | `03-create-seeds.sql` | 100 |
| `custom_fee_percent` (Pro) | `03-create-seeds.sql` | 8% |
| `days_of_guarantee` | `03-create-seeds.sql` | 7 días |
| `liquidity_delay_days` | `03-create-seeds.sql` | 30 días |

---

*Documento preparado para el proyecto Crema - Marzo 2026*
*Este documento debe ser revisado trimestralmente según la evolución del tipo de cambio e inflación.*
*Última actualización de fuentes: Marzo 2026 (REM BCRA Feb 2026)*
