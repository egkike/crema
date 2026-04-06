# Brand & Product Spec v1.0
## 🍦 Crema - Plataforma para la Economía de los Creadores

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft para revisión  
**Owner**: Kike García

---

## 1. Visión General

### 1.1 Objetivo del Documento

Este documento define la identidad de marca, público objetivo, modelo de negocio, features y scope técnico de los frontends de Crema. Es el documento fundacional que guía todo el desarrollo.

### 1.2 ¿Qué es Crema?

**Crema** es una plataforma tecnológica diseñada para que cualquier persona pueda crear, vender y administrar sus productos digitales de manera profesional. Ya seas instructor, autor, consultor o creador de contenido, Crema te proporciona todas las herramientas necesarias para monetizar tu conocimiento sin requerir conocimientos técnicos.

---

## 2. Brand

### 2.1 Identidad Visual

| Atributo | Valor |
|----------|-------|
| **Nombre** | Crema 🍦 |
| **Slogan** | "La plataforma de los creators" |
| **Vibe** | Innovador, moderno, accesible |
| **Colores** | Warm palette (crema/naranja/café) |
| **Modo** | Dark mode first |
| **Tipografía** | Inter / Poppins / Plus Jakarta (Sans-serif moderna) |

### 2.2 Diferenciación

- **Competidor principal**: Hotmart
- **Diferenciador**: Flexibilidad multi-producto/multi-moneda + AI features (Q&A, Tutor, Insights)

---

## 3. Target

| Atributo | Descripción |
|----------|-------------|
| **Audience** | Instructors ARG + Creators LATAM + Consultants |
| **Nivel técnico** | Bajo (no sabe tech, quiere todo fácil) |
| **Pain point** | "Quiero vender mi conocimiento sin complicarme con tecnología" |

---

## 4. Modelo de Negocio

| Revenue Stream | Detalle |
|---------------|---------|
| **Comisión** | 9.9% + fee fijo por venta |
| **Suscripción** | Plan Pro ~$30k ARS (cubre costos + margen) |
| **AI** | Included en Pro hasta límite → luego credits prepagos |

---

## 5. Productos Soportados

### 5.1 Tipos de Productos

Todo tipo de info-productos:
- ✅ Cursos (video + lecciones)
- ✅ E-books
- ✅ Memberships
- ✅ Podcasts (premium)
- ✅ Audiolibros
- ✅ Software

### 5.2 Entrega de Contenido

| Método | Descripción |
|--------|-------------|
| **Streaming** | Videos via Mux/Cloudflare con URLs firmadas |
| **Descarga** | Archivos directos (PDF, ZIP, etc) |

### 5.3 Safe-Guard

- Si el estudiante consume más del 30% del contenido, pierde el derecho a reembolso

---

## 6. Pagos

### 6.1 Métodos Disponibles

| Método | Moneda | Proveedor |
|--------|--------|-----------|
| MercadoPago | ARS | Cards, PIX, etc |
| Crypto | USDT/BTC | Blockonomics |

### 6.2 Checkout

- **Guest checkout**: El comprador se registra automáticamente al comprar (sin cuenta previa)

---

## 7. Afiliados

| Feature | Descripción |
|---------|-------------|
| **Afiliados externos** | Cualquier persona puede compartir links y ganar comisiones |
| **Creadores como afiliados** | Un creator puede vender productos de otros |
| **Comisión** | 10% sobre el precio bruto |

---

## 8. AI Features (Diferenciador)

### 8.1 Features Disponibles

| Feature | Descripción |
|---------|-------------|
| **Q&A Agent** | Chat con el producto |
| **Tutor AI** | Tutor personal por producto |
| **Insights AI** | Analytics inteligente |
| **Memory** | Memoria persistente con pgvector |
| **Reviews/Ratings** | Sistema de reviews |
| **Reports/Denunciations** | Moderación de contenido |

### 8.2 Pricing

- **Plan Pro**: Incluye AI hasta un límite mensual
- **Overflow**: Credits prepagos para usuarios que excedan el límite

---

## 9. Frontends

### 9.1 Arquitectura

| Frontend | Descripción |
|----------|-------------|
| **frontend-main** | Landing + Tienda + Checkout + Dashboard Creator |
| **frontend-admin** | Panel admin full (ventas, usuarios, AI stats, reports, config) |

### 9.2 Tech Stack Propuesto

| Componente | Tecnología |
|------------|------------|
| Framework | Astro + React |
| Styling | Tailwind CSS |
| Icons | Tabler Icons |
| State | Signals / Zustand |

---

## 10. Timeline

| Fase | Duración |
|------|----------|
| **MVP** | 3-4 meses |

---

## 11. MVP Scope

### frontend-main MVP

1. Landing page (dark mode, warm colors)
2. Registro/Login (JWT)
3. Dashboard creator:
   - Mis productos
   - Ventas
   - Balance (pending/available)
   - Afiliados
4. Crear producto (upload video/archivos)
5. Checkout (MercadoPago + Crypto)
6. Sistema de afiliados
7. Player de contenido (streaming + download)

### frontend-admin MVP

1. Dashboard general
2. Gestión de usuarios
3. Gestión de productos
4. Balance y payouts
5. Reports y analytics
6. AI stats
7. Configuración de plataforma

---

## 12. KPIs y Métricas de Éxito

El proyecto será exitoso si:

1. ✅ Un creator sin conocimientos técnicos puede crear y vender su primer producto en menos de 1 hora
2. ✅ El checkout funciona con MercadoPago y Crypto sin errores
3. ✅ El sistema de afiliados registra comisiones correctamente
4. ✅ Los AI features (Q&A, Tutor, Insights) funcionan y agregan valor
5. ✅ El modo oscuro con colores warm está implementado
6. ✅ La plataforma es responsive y funciona en mobile

---

## 13. Documentos Relacionados

- `docs/project/ai-features/PRD.md` - AI Features detalladas
- `docs/project/ai-streaming-sse/PRD.md` - Streaming SSE
- `docs/project/crypto-usdt-gateway/PRD.md` - Pagos crypto
- `backend/README.md` - API Reference
- `docs/project/` - Documentación técnica completa

---

**Documento preparado**: Abril 2026  
**Versión**: 1.0  
**Próximo paso**: Análisis de factibilidad técnica → SDD → Implementación