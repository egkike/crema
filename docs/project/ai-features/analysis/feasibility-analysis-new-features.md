# Feasibility Analysis - AI Features 2025

**Versión**: 1.0  
**Fecha**: Abril 2026  
**Estado**: Draft  
**Owner**: Kike García  

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Ideas Nuevas - Overview](#2-ideas-nuevas---overview)
3. [Análisis Técnico por Idea](#3-análisis-técnico-por-idea)
   - [3.1 Course Assistant](#311-idea-1-course-assistant)
   - [3.2 Support Chatbot](#312-idea-2-support-chatbot)
   - [3.3 AI Afiliate Chat](#313-idea-3-ai-afiliate-chat)
   - [3.4 Description Generator](#314-idea-4-description-generator)
   - [3.5 Certificate PDF Generator](#315-idea-5-certificate-pdf-generator)
   - [3.6 Smart Recommendations](#316-idea-6-smart-recommendations)
   - [3.7 SEO Optimizer](#317-idea-7-seo-optimizer)
   - [3.8 Data Export](#318-idea-9-data-export-descargar-mi-información)
   - [3.9 Sentiment Analytics](#319-idea-10-sentiment-analytics-for-creators)
   - [3.10 Advanced DRM](#3110-idea-11-advanced-drm-nivel-intermedio)
4. [Consideraciones UX](#4-consideraciones-ux)
5. [Consideraciones de Seguridad](#5-consideraciones-de-seguridad)
6. [Matriz de Interacciones](#6-matriz-de-interacciones)
7. [Recomendaciones](#7-recomendaciones)

---

## 1. Resumen Ejecutivo

Este documento analiza la factibilidad técnica de 7 nuevas funcionalidades de AI para Crema, evaluando:

- Reutilización de infraestructura existente
- Complejidad de implementación
- Requisitos de seguridad
- Experiencia de usuario
- Priorización recomendada

### Hallazgos Principales

| Métrica | Resultado |
|---------|-----------|
| **Ideas viables técnicamente** | 7/7 ✅ |
| ** Ideas que reutilizan infraestructura** | 6/7 |
| **Ideas que requieren nuevos componentes** | 4/7 |
| **Complejidad promedio** | Media |
| **Riesgo de seguridad crítico** | 2 ideas |
| **Requiere plan Pro** | 5 ideas |
| **Acceso libre** | 2 ideas |

### Prioridad Recomendada

| Priority | Idea | Score |
|----------|------|-------|
| **1** | Idea 1: AI Content Assistant | 9/10 |
| **2** | Idea 2: Support Chatbot | 9/10 |
| **3** | Idea 10: Sentiment Analytics | 9/10 |
| **4** | Idea 11: Advanced DRM | 8/10 |
| **5** | Idea 9: Data Export | 8/10 |
| **6** | Idea 8: Product Contact System | 8/10 |
| **7** | Idea 4: Description Generator | 8/10 |
| **8** | Idea 5: Certificate PDF | 8/10 |
| **9** | Idea 3: AI Afiliate Chat | 7/10 |
| **10** | Idea 6: Smart Recommendations | 6/10 |
| **11** | Idea 7: SEO Optimizer | 6/10 |

---

## 2. Ideas Nuevas - Overview

### Resumen de las 11 Ideas

| # | Idea | Descripción | Plan Pro | Streaming | Complejidad |
|---|------|------------|----------|----------|-------------|
| **1** | AI Content Assistant | AI asiste al Creador con estructuración y generar contenido/interacciones para TODOS los tipos de productos | ✅ | ✅ | Media |
| **2** | Support Chatbot | Chat de soporte técnico + escalación a email | ❌ | ✅ | Media |
| **3** | AI Afiliate Chat | Chat de dudas para Afiliados y Compradores | ❌ | ✅ | Baja |
| **4** | Description Generator | Genera título, descripción, tags SEO | ✅ | ✅ | Baja |
| **5** | Certificate PDF | Genera PDF + QR para certificados | ❌ | ❌ | Media |
| **6** | Smart Recommendations | Recomendaciones personalizadas | ✅ | ❌ | Alta |
| **7** | SEO Optimizer | Genera meta tags automáticos | ✅ | ✅ | Baja |
| **8** | Product Contact System | Sistema de consultas privadas comprador→creador por email | ❌ | ❌ | Baja |
| **9** | Data Export | Exportar información del creador (alumnos, productos, órdenes) | ❌ | ❌ | Baja |
| **10** | Sentiment Analytics | AI analiza comentarios y reviews para generar insights accionables | ✅ | ❌ | Media |
| **11** | Advanced DRM (Intermedio) | Protección contra piratería con watermarks dinámicos y signed URLs | ✅ | ❌ | Media |

---

## 3. Análisis Técnico por Idea

### 3.1 Idea 1: AI Content Assistant (antes "Course Assistant")

**Descripción**: AI que asiste al Creador Pro en estructurar su contenido y generar evaluaciones. **Detecta el tipo de producto automáticamente y adapta la asistencia.**

#### Tipos de Productos Soportados

| Tipo | Asistencia Principal | Output |
|------|------------------|--------|
| **course** | Estructura módulos/lecciones + generar quiz | Quiz JSON |
| **ebook** | Resumen, índice, capítulos sugeridos | Estructura de capítulos |
| **digital_download** | Descripción, README, list optimizado | Descripción mejorada |
| **membership** | Plan de beneficios, contenido recurrente | Plan de contenidos |
| **podcast** | Show notes, transcripción, resumen | Show notes |
| **software** | Feature list, guía de uso, FAQ | Documentación |

#### Transcripción de Video/Audio (Incluida en Plan Pro)

**Esta funcionalidad está incluida en el Plan Pro con límite mensual.**

| Recurso | Cantidad | Costo ARS | Abonado por |
|--------|---------|----------|-----------|
| **Transcripción Video/Audio** | 60 min/mes | ~720 ARS | Plan Pro |
| **Transcripción extra** | +X min | 12 ARS/min | AI Credits |

- **Incluido**: 60 minutos/mes de transcripción (1 hora)
- **Precio adicional**: 12 ARS/minuto o 1 crédito/minuto
- **Requiere**: Plan Pro activo
- **Acumulación**: No acumula mes a mes (se reinicia cada mes)
- **Uso**: Whisper (OpenAI) para transcription

#### Flujo Generalizado

```
Creador Pro selecciona tipo de producto
    ↓
Proporciona contenido (.md, .txt, .pdf) o texto
    ↓
AI detecta tipo de producto
    ↓
AI genera asistencia específica por tipo
    ↓
Creador revisa y modifica
    ↓
Creador confirma → Se guarda en DB
```

#### Flujo

```
Creador sube contenido (.md, .txt, .pdf)
    ↓
AI analiza contenido
    ↓
Sugiere estructura (módulos/lecciones)
    ↓
Genera quiz propuesto
    ↓
Creador revisa y modifica
    ↓
Creador confirma → Se guarda en DB
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `LLMService` | ✅ Existe | Chat + streaming |
| `EmbeddingService` | ✅ Existe | Futuros features |
| `product_lessons` | ✅ Existe | Guardar lección |
| `product_lesson_quizzes` | ✅ Existe | Guardar quiz |
| `product_modules` | ✅ Existe | Estructura módulos |

#### Nuevos Componentes

| Componente | Nuevo | Descripción |
|-----------|-------|--------------|
| `CourseAssistantAgent` | ✅ Nuevo | Prompt + lógica principal |
| `ContentReader` | ✅ Nuevo | Parser .md, .txt, .pdf, video, audio |
| `QuizGenerator` | ✅ Nuevo | Genera JSON de quiz |
| `TranscriptionService` | ✅ Nuevo | Whisper API integration |

#### Tareas Requeridas (Pre-implementación)

| # | Tarea | Descripción | Ownership |
|---|------|-------------|------------|
| 1 | **Agregar feature al Plan Pro** | Agregar `"ai_transcription_minutes": 60` al JSON de features en platform_plans (seed) | Backend |
| 2 | **Instalar dependencias** | Instalar librería Whisper o usar API de OpenAI | Backend |
| 3 | **Crear ContentReader** | Parser para .md, .txt, .pdf | Backend |

#### Schema de Quiz (reutiliza existente)

```typescript
interface GeneratedQuiz {
  lessonId: string;
  questions: {
    question: string;
    options: string[]; // 4 opciones
    correctIndex: number; // 0-3
  }[];
  passingScore: number; // default 70
  maxAttempts: number; // default 3
}
```

---

### 3.8 Idea 8: Product Contact System

**Descripción**: Sistema de consultas privadas para que compradores y afiliados contacten al creador de un producto por email.

#### Flujo

```
Comprador/Afiliado → [Botón "Contactar Creador"]
    ↓
[Formulario de consulta]
- Nombre del usuario
- Email (para recibir respuesta)
- Producto interesado
- Mensaje
    ↓
[Boton "Enviar"]
    ↓
Creador recibe email con template
    ↓
Creador responde al email del comprador
```

#### Características

| Aspecto | Detalle |
|---------|---------|
| **Acceso** | Todos los usuarios (Comprador/Afiliado) |
| **Privacidad** | La consulta NO es visible públicamente |
| **Medio** | Email con template predefinido |
| **Costo** | Free |

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `emailService` | ✅ Existe | Envío de emails |
| `products` table | ✅ Existe | Datos del producto y creador |
| `users` table | ✅ Existe | Email del creador |

#### Nuevos Componentes

| Componente | Nuevo | Descripción |
|-----------|-------|--------------|
| `ProductContactService` | ✅ Nuevo | Lógica de envío de emails |
| `product_inquiries` | ✅ Nueva | Tabla de logging de consultas |

#### Email Template (para el Creador)

```
Subject: Nueva consulta sobre tu producto: [Nombre del Producto]

Hola [Nombre del Creador],

Recibiste una nueva consulta de un posible interesado:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTO: [Nombre del Producto]
DE: [Nombre del comprador] ([email del comprador])
FECHA: [Fecha]

MENSAJE:
[Contenido del mensaje]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Para responder, simplemente contestá este email directamente al comprador.

---
Enviado desde Crema
```

#### Tareas Requeridas (Pre-implementación)

| # | Tarea | Descripción | Ownership |
|---|------|-------------|------------|
| 1 | **Crear product_inquiries table** | Tabla para logging de consultas | Backend |
| 2 | **Verificar creator_email** | Asegurar que el creador tenga email en su perfil | Backend |

#### Complejidad: **Baja**

- Reutiliza emailService existente
- Solo requiere crear tabla de logging

#### Consideraciones de Seguridad

- [ ] **Auth required**: Usuario debe estar logueado
- [ ] **Input sanitization**: Sanitizar mensaje
- [ ] **Rate limiting**: Max 5 consultas/día por usuario
- [ ] **No spam**: Validar que no sea spam
- [ ] **Privacy**: No exponer email del creador directamente

#### API Propuesta

```typescript
// POST /api/products/:productId/contact
{
  message: string;
  buyerEmail: string; // Email del comprador para respuesta
}

// Response
{
  success: true;
  message: "Tu consulta ha sido enviada al creador";
}

// GET /api/products/:productId/inquiries (solo creador)
{
  inquiries: {
    id: string;
    buyerName: string;
    buyerEmail: string;
    message: string;
    createdAt: string;
  }[];
}
```

---

### 3.2 Idea 2: Support Chatbot

**Descripción**: Chat de soporte técnico para usuarios, con troubleshooting guiado y escalación a email.

#### Flujo

```
Usuario envía mensaje
    ↓
Support Agent clasifica intent
    ↓
Option A: Buscar en Platform FAQs (RAG)
    ↓
Option B: Troubleshooting guiado
    ↓
Option C: Si no puede → Escalar a email
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `LLMService` | ✅ Existe | Chat + streaming |
| `MemoryService` | ✅ Existe | RAG para FAQs |
| `EmbeddingService` | ✅ Existe | Search semántico |
| `emailService` | ✅ Existe | Enviar email |

#### Nuevos Componentes

| Componente | Nuevo | Descripción |
|-----------|-------|--------------|
| `SupportAgent` | ✅ Nuevo | Intent classification + prompts |
| `TroubleshootingFlows` | ✅ Nuevo | Flujos guiados |
| `PlatformFAQIndexer` | ✅ Nuevo | Indexar docs de plataforma |
| `platform_config` | ✅ Nueva | Tabla config (support_email) |

#### Complejidad: **Media**

- ⚠️ Platform FAQs no existen → crear contenido
- ⚠️ Troubleshooting flows requieren diseño
- ⚠️ Escalation email requiere config table

#### Tareas Requeridas (Pre-implementación)

Las siguientes tareas deben completarse ANTES de que el feature funcione:

| # | Tarea | Descripción | Ownership | Estado |
|---|------|-------------|------------|--------|
| 1 | **Crear Platform FAQs** | ⚠️ **BLOCKING PREREQUISITE** - Crear documento con ~20-30 FAQs sobre uso de la plataforma (cómo crear producto, configurar payout, etc.) | Producto/Docs | 🔲 Pendiente |
| 2 | **Diseñar Troubleshooting Flows** | Diseñar 3-5 flujos guiados de troubleshooting (errores comunes) | Producto | 🔲 Pendiente |
| 3 | **Crear Plataforma Config** | Ejecutar SQL para crear tabla platform_config | Backend | 🔲 Pendiente |
| 4 | **Indexar FAQs** | Indexar Platform FAQs en embedding service | Backend | 🔲 Pendiente |

> ⚠️ **Nota**: La tarea #1 (Platform FAQs) es un prerrequisito BLOQUEANTE. Sin este contenido, el chatbot no puede funcionar correctamente. Esta tarea debe completarse ANTES de iniciar la implementación técnica.

#### Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-------------|
| FAQ vacío | Alta | Bajo | Crear docs mínimos primero |
| Loop infinito troubleshooting | Media | Medio | Max 3 preguntas |
| Email escalation fail | Baja | Alto | Retry + fallback |

#### Consideraciones de Seguridad

- [ ] **Input validation**: Texto libre sanitizado
- [ ] **No PII in logs**: Filter user data
- [ ] **Rate limiting**: 20 req/min (público)
- [ ] **No auth required**: Acceso libre
- [ ] **Timeout**: 30 segundos
- [ ] **Email throttling**: Max 5 emails/day
- [ ] **Output filtering**: No internal paths

#### Tabla: platform_config

```sql
CREATE TABLE platform_config (
  key VARCHAR PRIMARY KEY,
  value TEXT NOT NULL,
  description VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO platform_config (key, value, description) 
VALUES ('support_email', 'soporte@crema.com', 'Email de soporte técnico');
```

#### API Propuesta

```typescript
// POST /api/ai/support/chat
{
  message: string;
  context?: {
    productId?: string;
    errorMessage?: string;
  }
}

// Response (streaming)
{
  response: string;
  action?: 'escalate' | 'ticket_created';
}

// POST /api/ai/support/escalate
{
  reason: string;
  userEmail?: string;
}
```

---

### 3.3 Idea 3: AI Afiliate Chat

**Descripción**: Chat de dudas técnicas para Afiliados y Compradores (similar a Support Chatbot).

#### Relación con Idea 2

Usa la misma infraestructura que Support Chatbot pero con:
- Prompts específicos para afiliados
- Contexto limitado (no tiene acceso a AI features Pro)
- FAQs específicas del programa de afiliados

#### Diferencias

| Aspecto | Support Chatbot | AI Afiliate Chat |
|---------|-----------------|------------------|
| **Target** | Todos los usuarios | Afiliados + Compradores |
| **Prompts** | Genéricos | Específicos de affiliates |
| **RAG content** | Platform docs | Affiliate docs |
| **Acceso** | Free | Free |

#### Complejidad: **Baja**

- Reutiliza Idea 2 infrastructure
- Solo cambia prompts + contexto

#### Tareas Requeridas (Pre-implementación)

| # | Tarea | Descripción | Dependencia |
|---|------|-------------|------------|
| 1 | **Crear Affiliate FAQs** | Crear documento con ~10-15 FAQs específicas para afiliados | — |
| 2 | **Diseñar Affiliate Prompts** | Diseñar prompts específicos para el contexto de afiliados | — |
| 3 | **Indexar Affiliate FAQs** | Indexar en embedding service | Requiere Idea 2+ |

**Nota**: Esta idea depende de que Idea 2 esté implementada primero (reusa la misma infraestructura).

#### API Propuesta

```typescript
// POST /api/ai/affiliate/chat
{
  message: string;
  context?: {
    affiliateId?: string;
  }
}
```

---

### 3.4 Idea 4: Description Generator

**Descripción**: AI genera título marketable, descripción, objetivos y tags para productos.

#### Flujo

```
Creador proporciona contenido del curso
    ↓
AI analiza y genera:
  - Title atractivo
  - Descripción SEO
  - Objetivos de aprendizaje
  - Tags automáticos
    ↓
Creador revisa y_edita
    ↓
Guardar en producto
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `LLMService` | ✅ Existe | chat (no streaming necesario) |
| `products` table | ✅ Existe | Guardar datos |

#### Nuevos Componentes

| Componente | Nuevo | Descripción |
|-----------|-------|--------------|
| `DescriptionGenerator` | ✅ Nuevo | Prompt + Output parser |

#### Tareas Requeridas (Pre-implementación)

| # | Tarea | Descripción | Ownership |
|---|------|-------------|------------|
| 1 | **Agregar meta columns** | Agregar meta_title, meta_description a products table | Backend |

#### Complejidad: **Baja**

- Simple prompt engineering
- Parser de output estructurado

#### Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-------------|
| Output mal formato | Baja | Medio | JSON parse con fallbacks |

#### Consideraciones de Seguridad

- [ ] **Input validation**: Max 5000 caracteres
- [ ] **Prompt injection guard**: Sanitize
- [ ] **Plan Pro validation**: Required
- [ ] **Rate limiting**: 5 req/min
- [ ] **Output filtering**: No internal data

#### API Propuesta

```typescript
// POST /api/ai/product/description
{
  content: string; // Contenido del curso
  language?: 'es' | 'en'; // default 'es'
}

// Response
{
  title: string;
  description: string;
  objectives: string[];
  tags: string[];
  metaTitle: string;
  metaDescription: string;
}
```

---

### 3.5 Idea 5: Certificate PDF Generator

**Descripción**: Genera PDF descargable con QR de verificación para certificados existentes.

#### Estado Actual

- ✅ Certificados existen en DB (`user_certificates`)
- ✅ `getCertificateByCode()` existe
- ✅ Endpoint `/api/learning/certificate/verify/:code`
- ❌ No hay generación de PDF

#### Lo que hay que agregar

| Componente | Nuevo | Descripción |
|-----------|-------|--------------|
| `CertificatePDFGenerator` | ✅ Nuevo | Genera PDF con QR |
| `qrcode` lib | ✅ Instalar | QR code generation |

#### Flujo

```
Estudiante completa curso (100%)
    ↓
Sistema genera certificado (ya existe)
    ↓
Estudiante click "Descargar PDF"
    ↓
Backend genera PDF con:
    - Nombre del estudiante
    - Nombre del curso
    - Fecha de completion
    - QR code (verificación)
    ↓
Frontend muestra/habilita download
```

#### PDF Template

```
┌─────────────────────────────────────────┐
│           CERTIFICADO DE                 │
│         COMPLETACIÓN                    │
│                                         │
│         [Logo Crema]                    │
│                                         │
│    Juan Pérez                           │
│    ─────────────────                   │
│    (nombre del estudiante)             │
│                                         │
│    ha completado el curso             │
│                                         │
│    " Cómo ser Full Stack Developer"  │
│    ─────────────────                   │
│    (nombre del curso)                 │
│                                         │
│    Fecha: 15 de Abril, 2026           │
│                                         │
│         [QR Code]                     │
│                                         │
│    Código: ABCD-1234                  │
│    Verifica: crema.com/certificate/... │
└─────────────────────────────────────────┘
```

#### Complejidad: **Media**

- 📦 Librería: `pdfkit` o `puppeteer`
- 📦 Librería: `qrcode`

#### Riesgos Técnicos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|-------------|
| PDF generation fail | Baja | Medio | Error handling |
| QR generation fail | Baja | Bajo | Fallback |

#### API Propuesta

```typescript
// GET /api/learning/certificate/:certificateId/pdf

// Headers
Content-Type: application/pdf
Content-Disposition: attachment; filename="certificado.pdf"
```

// Error responses
{
  error: "QR_FAILED",
  message: "Error al generar código QR. Intenta nuevamente."
}

{
  error: "PDF_GENERATION_FAILED", 
  message: "Error al generar PDF. Intenta nuevamente."
}

{
  error: "TIMEOUT",
  message: "La generación tardó demasiado. Intenta nuevamente."
}

#### Consideraciones de Seguridad

- [ ] **Input validation**: certificateId válido
- [ ] **Ownership check**: Solo el dueño del certificado puede descargarlo
- [ ] **Rate limiting**: 10 req/min (generación de PDFs es costosa)
- [ ] **Audit logging**: Registrar cada generación

---

### 3.6 Idea 6: Smart Recommendations

**Descripción**: Recomendaciones personalizadas basadas en historial del usuario.

#### Enfoque

 Dos posibles implementaciones:

| Enfoque | Descripción | Complejidad |
|---------|------------|-------------|
| **Rule-based** | "Users who bought X also bought Y" | Baja |
| **AI-based** | Embeddings similarity | Alta |

#### Recomendación: Rule-based MVP

```typescript
// Lógica MVP
const getRecommendations = (userId, viewedProducts, boughtProducts) => {
  // 1. Productos del mismo creador
  const sameCreator = products.filter(p => 
    boughtProducts.some(bp => bp.creatorId === p.creatorId)
  );
  
  // 2. Productos en misma categoría
  const sameCategory = products.filter(p =>
    boughtProducts.some(bp => bp.category === p.category)
  );
  
  // 3. Productos populares en categoría
  const popularInCategory = products.filter(p =>
    viewedProducts.some(vp => vp.category === p.category)
  ).sort((a, b) => b.sales - a.sales);
  
  return { sameCreator, sameCategory, popularInCategory };
};
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `products` table | ✅ Existe | Query |
| `user_products` | ❌ **No existe** | **Gap: Hay que crear** |
| `EmbeddingService` | ✅ Existe | Para futuro AI |

#### Notas de Implementación

El MVP puede implementarse SIN nueva tabla, usando datos existentes:

- `products`: Mismos productos del creador
- `creator_daily_metrics`: Productos populares (por views)
- `user_products`: Productos comprados

No se requiere nueva tabla para el MVP.

#### Complejidad: **Baja (MVP) / Alta (AI)**

- MVP rule-based: Baja
- AI-based: Alta (requiere training)

#### API Propuesta

```typescript
// GET /api/products/recommendations?limit=5

// Query params
limit?: number; // default 5
context?: 'viewed' | 'bought'; // default 'viewed'

// Response
{
  recommendations: Product[]; //sameCreator | sameCategory | popular
}
```

---

### 3.7 Idea 7: SEO Optimizer

**Descripción**: Genera automáticamente metatags (title, description, OG tags, Schema.org).

---

### 3.8 Idea 9: Data Export (Descargar Mi Información)

**Descripción**: Sistema para que el usuario Creador pueda exportar sus datos en formatos legibles (CSV/JSON) para portabilidad.

#### ⚠️ Disclaimer Legal

**Al descargar su información, el usuario comprende y acepta que:**

- ✅ Crema facilita la exportación de sus datos en formato estándar
- ❌ Crema NO ofrece servicio de migración a otras plataformas
- ❌ Crema NO se hace responsable del uso que el usuario dé a esa información
- ❌ Crema NO garantiza compatibilidad con sistemas externos
- ❌ El usuario es responsable de proteger sus datos descargados

#### Datos Exportables

| Tipo de Dato | Incluido | Formato |
|--------------|----------|---------|
| **Alumnos** | ✅ Sí | CSV (email, nombre, fecha enrolled) |
| **Productos** | ✅ Sí | JSON (título, precio, módulos/lecciones) |
| **Órdenes** | ✅ Sí | CSV (fecha, monto, buyer, status) |
| **Estadísticas** | ✅ Sí | JSON (ventas, views, conversiones) |
| **Configuración** | ✅ Sí | JSON (settings, precios) |

#### Datos NO Exportables

| Tipo de Dato | Razón |
|--------------|-------|
| **Quizzes de alumnos** | Datos de los estudiantes (privacidad) |
| **Certificados emitidos** | Datos de los estudiantes |
| **Reviews de usuarios** | Datos de terceros |

#### Flujo

```
Creador → [Mis Datos] → [Descargar]
    ↓
Seleccionar tipo: (Todos | Alumnos | Productos | Órdenes)
    ↓
⚠️ Mostrar disclaimer antes de continuar
    ↓
Validar password
    ↓
Generar ZIP
    ↓
Download (expira 24h)
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `products` table | ✅ Existe | Datos de productos |
| `orders` table | ✅ Existe | Órdenes |
| `users` table | ✅ Existe | Datos del creador |
| `zip` (Node module) | ✅ Existe | Compresión |

#### Complejidad: **Baja**

- Queries simples a tablas existentes
- Generación de CSV/JSON
- Compresión ZIP

#### Consideraciones de Seguridad

- [ ] **Auth required**: JWT obligatorio
- [ ] **Password validation**: Confirmar password
- [ ] **Rate limiting**: Max 1 export/día
- [ ] **Download expiration**: 24h, single use
- [ ] **Audit trail**: Registrar export

#### API Propuesta

```typescript
// POST /api/users/export-data
{
  type: 'all' | 'students' | 'products' | 'orders';
  password: string;
}

// Response
{
  success: true,
  downloadUrl: "https://crema.com/api/exports/download/token-abc123",
  expiresAt: "2026-04-13T12:00:00Z",
  disclaimer: "Crema solo facilita la exportación. 
  El usuario es responsable de la información descargada."
}
```

---

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `LLMService` | ✅ Existe | Generación |

#### Notas de Implementación

Idea 7 reutiliza las columnas meta de Idea 4. No requiere tareas adicionales.

#### Complejidad: **Baja**

- Simple prompt → JSON output

#### API Propuesta

```typescript
// POST /api/ai/product/seo
{
  productId: string;
  content?: string; // override
}

// Response
{
  metaTitle: string;        // max 60 chars
  metaDescription: string;  // max 160 chars
  ogTitle: string;
  ogDescription: string;
  keywords: string[];
  schema: {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: string;
    description: string;
    provider: { '@type': 'Organization', name: 'Crema' };
  };
}
```

---

### 3.10 Idea 10: Sentiment Analytics for Creators

**Descripción**: AI analiza automáticamente todos los comentarios y reviews de los productos del creador para generar insights accionables.

#### Problema que resuelve

El creador recibe cientos de comentarios pero:
- No tiene tiempo de leerlos todos
- No sabe qué feedback es recurrente
- No puede identificar patrones de satisfacción/insatisfacción

#### Flujo

```
Creador → [Ver Insights de su producto]
    ↓
AI analiza TODOS los comentarios:
    - Sentimiento (positivo/negativo/neutral)
    - Palabras clave más frecuentes
    - Temas de satisfacción/insatisfacción
    - Comparación temporal
    ↓
Dashboard con insights accionables
```

#### Datos que analiza

| Input | Processing | Output |
|-------|------------|--------|
| Reviews | Sentiment analysis (NLP) | % positive/negative |
| Comments | Topic extraction | Temas principales |
| Q&A questions | Clustering | Preguntas frecuentes |

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `LLMService` | ✅ Existe | Análisis de sentimiento |
| `EmbeddingService` | ✅ Existe | Embeddings de comentarios |
| `product_reviews` table | ✅ Existe | Reviews |
| `product_questions` table | ✅ Existe | Q&A |

#### Complejidad: **Media**

- NLP para sentiment analysis
- Clustering de temas
- Dashboard de visualización
- ⚠️ Caching: Los resultados del análisis se almacenan en DB con timestamp. Solo se re-analiza si hay nuevos comentarios desde el último análisis.

#### Consideraciones de Seguridad

- [ ] **Auth required**: Solo el creador ve insights de su producto
- [ ] **Rate limiting**: 1 análisis/día por producto
- [ ] **No PII in logs**: No guardar datos sensibles

#### API Propuesta

```typescript
// GET /api/ai/products/:productId/sentiment-insights

{
  summary: {
    totalReviews: 150,
    sentiment: {
      positive: 72,
      negative: 15,
      neutral: 13
    },
    score: 4.2,
    trend: "improving",
    lastAnalyzedAt: "2026-04-12T10:30:00Z",
    needsRecalculation: false
  },
  topPositiveThemes: ["Contenido claro", "Buenos ejemplos"],
  topNegativeThemes: ["Audio baja calidad", "Lecciones muy largas"],
  recommendations: [
    "Mejorar audio en lecciones 5-8",
    "Las lecciones de más de 20 min tienen mayor tasa de abandono"
  ]
}
```

---

### 3.11 Idea 11: Advanced DRM (Nivel Intermedio)

**Descripción**: Sistema de protección contra piratería con watermarks dinámicos, signed URLs y bloqueo de shortcuts.

#### Problema que resuelve

El #1 dolor del mercado: Piratería y descargas ilegales. Safe-Guard cubre reembolsos fraudulentos, pero falta protección del contenido en sí.

#### Nivel Intermedio (Propuesto)

| Feature | Implementación |
|---------|---------------|
| **Watermarks dinámicos** | Email del usuario subtitulado en cada frame (FFmpeg) |
| **Signed URLs** | Expiración 4 horas (ya existe) |
| **Bloqueo shortcuts** | Disable right-click, Ctrl+S (PrintScreen no es efectivo) |
| **Detección básica** | Headers analysis para tools de download |

> ⚠️ **Nota**: Las protecciones frontend (disable right-click, disable copy) son medidas disuasorias, no protección verdadera. El screen recording a nivel de OS no puede ser bloqueado desde el navegador. Un usuario determined puede capturar la pantalla con herramientas externas.

#### Flujo técnico

```
Usuario solicita ver lección:
    ↓
1. Verificar acceso (JWT)
2. Generar watermark con email
3. Aplicar con FFmpeg
4. Generar signed URL (4h expiry)
5. Entregar al player
```

#### Infraestructura a Reutilizar

| Componente | Status | Uso |
|------------|--------|-----|
| `Signed URLs` | ✅ Existe | Mux/Cloudflare |
| `FFmpeg` | ⚠️ Instalar | Watermark processing |
| `products` table | ✅ Existe | Validar acceso |

#### Complejidad: **Media**

- Procesamiento de video con FFmpeg
- Costo por viewing

#### Costos (incluidos en Plan Pro)

| Componente | Costo/mes |
|------------|-----------|
| FFmpeg processing | $50 USD |
| CDN adicional | $20 USD |
| Dev/Maintenance | $40 USD |
| **Total** | **$110 USD/mes** (compartido entre usuarios Pro) |

**Costo por usuario: ~$0.08 USD/mes**

#### Consideraciones de Seguridad

- [ ] **Signed URLs**: Expiración 4 horas
- [ ] **Watermark**: Email embebido en video
- [ ] **Frontend**: Disable copy/paste/print
- [ ] **Rate limiting**: Por IP

#### API Propuesta

```typescript
// GET /api/products/:productId/lessons/:lessonId/player

{
  videoUrl: "signed-url-with-watermark",
  expiresAt: "2026-04-12T16:00:00Z",
  securityLevel: "intermediate",
  watermarkEnabled: true,
  disableFeatures: ["rightClick", "copy"]
}
```

---

## 4. Consideraciones UX

### 4.1 Streaming Responses

Todas las ideas que usan AI deben implementar streaming SSE:

```typescript
// SSE implementation
res.write('data: {"chunk": "..."}\n\n');
```

| Idea | Streaming | Notas |
|------|-----------|--------|
| Idea 1 | ✅ | Course Assistant |
| Idea 2 | ✅ | Support Chatbot |
| Idea 3 | ✅ | Afiliate Chat |
| Idea 4 | ⚠️ | No necesario (single response) |
| Idea 5 | ❌ | PDF download |
| Idea 6 | ❌ | No necesario |
| Idea 7 | ⚠️ | No necesario |
| Idea 8 | ❌ | Email-based |
| Idea 9 | ❌ | Download ZIP |
| Idea 10 | ❌ | No necesario (single response) |
| Idea 11 | ❌ | Video player |

### 4.2 Estados de Carga

```typescript
interface LoadingStates {
  idle: 'Listo';
  loading: 'Analizando...' | 'Procesando...';
  processing: 'Generando respuestas...';
  complete: 'Completado';
  error: 'Error - Intentar nuevamente';
}
```

### 4.3 Error Handling

| Tipo de error | UX |
|-------------|-----|
| Timeout | "El análisis tardó demasiado. Intenta con menos contenido." |
| Rate limit | "Espera un momento antes de continuar." |
| Invalid input | "No pude leer ese archivo. Intenta con .txt o .md" |
| Generic | "Ocurrió un error. Intenta novamente." |

---

## 5. Consideraciones de Seguridad

### 5.1 Security Matrix por Idea

| Idea | Input Validation | Auth | Rate Limit | PII Filter | Cost Cap |
|------|-----------------|------|------------|-------------|----------|
| 1 | ✅ | Plan Pro | ✅ | ✅ | ✅ |
| 2 | ✅ | ❌ | ✅ | ✅ | ✅ |
| 3 | ✅ | Auth | ✅ | ✅ | ✅ |
| 4 | ✅ | Plan Pro | ✅ | ✅ | ✅ |
| 5 | ✅ | Owner | ✅ | ✅ | ❌ |
| 6 | ✅ | Auth | ✅ | ✅ | ❌ |
| 7 | ✅ | Plan Pro | ✅ | ✅ | ✅ |

### 5.2 Amenazas y Mitigaciones

| Threat | Mitigation | Ideas |
|--------|-----------|-------|
| **Prompt Injection** | Input sanitization, prompt isolation | 1, 2, 3, 4, 7 |
| **File Upload Attacks** | Extension allowlist, size limit, virus scan | 1, 4 |
| **Data Leakage** | No logs de inputs, isolation | Todas |
| **Rate Limit Abuse** | throttling, per-user limits | 2, 3 |
| **Unauthorized Access** | Plan check, role validation | 1, 4, 6, 7 |
| **Cost Attack** | Token limits, timeout, budget | Todas AI |
| **Context Overflow** | Truncation | 1 |
| **Output Exposure** | Filter sensitive data | 2, 3 |

### 5.3 Security Checklist General

```markdown
## AI Security Checklist

### Input
- [ ] Extension allowlist: .md, .txt, .pdf only (Idea 1, 4)
- [ ] File size limit: 10MB max
- [ ] Input sanitization: No scripts, no special chars
- [ ] Prompt injection guard

### Authentication
- [ ] Plan Pro validation (Ideas 1, 4, 6, 7)
- [ ] Role-based access (Idea 5: solo owner)
- [ ] JWT validation required

### Rate Limiting
- [ ] Requests per minute: 5-20 según idea
- [ ] Tokens per request: 8000 max
- [ ] Timeout: 30-60 segundos

### Data Privacy
- [ ] No PII in logs
- [ ] Input data not stored
- [ ] Output filtering
- [ ] No internal paths exposed

### Cost Control
- [ ] Token budget per user
- [ ] Monthly limits
- [ ] Alertas de uso anómalo
```

---

## 6. Matriz de Interacciones

### 6.1 Usuarios y Features

| Usuario | Plan | Ideas Accesibles |
|---------|------|------------------|
| **Creador** | Free | Ninguna AI |
| **Creador** | Pro | Ideas 1, 4, 6, 7 |
| **Afiliado** | Any | Idea 3 |
| **Comprador** | Any | Idea 3 |
| **Estudiante** | Any | Idea 5 |

### 6.2 Interacciones Existentes vs Nuevas

| Usuario | Interacciones Existentes | + Nuevas Ideas |
|---------|-------------------------|----------------|
| **Creador Pro** | Q&A Agent, Tutor AI, Reviews AI | Course Assistant, Description Gen, Smart Recs, SEO Optimizer |
| **Creador Free** | Q&A básico | Ninguna |
| **Afiliado** | Links, commissions | AI Afiliate Chat |
| **Comprador** | Q&A, Reviews | AI Afiliate Chat |
| **Estudiante** | Tutor AI | Certificate PDF |

### 6.3 Resumen de Accesos

| Feature | Creador Pro | Creador Free | Afiliado | Comprador | Estudiante |
|---------|------------|-------------|-------------|----------|----------|------------|
| **Course Assistant** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Support Chatbot** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **AI Afiliate Chat** | N/A | N/A | ✅ | ✅ | N/A |
| **Description Generator** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Certificate PDF** | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Smart Recs** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SEO Optimizer** | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 7. Recomendaciones

### 7.1 Implementación por Fases

#### Fase 1: Core AI (Ideas 1-3)
- Course Assistant
- Support Chatbot  
- AI Afiliate Chat

#### Fase 2: Content AI (Ideas 4-5)
- Description Generator
- Certificate PDF

#### Fase 3: Advanced AI (Ideas 6-7)
- Smart Recommendations
- SEO Optimizer

### 7.2 Requisitos Comunes

| Requisito | Ideas Affectadas |
|-----------|-------------------|
| `LLMService` | Todas (1,2,3,4,7) |
| `EmbeddingService` | Ideas 2,3 (futuro 6) |
| `emailService` | Ideas 2,3 |
| `platform_config` | Ideas 2,3 |
| `pdfkit` | Idea 5 |
| `qrcode` | Idea 5 |

### 7.3 KPIs a Medir

| Idea | KPI |
|------|-----|
| Idea 1 | Quizzes creados, tiempo ahorrado |
| Idea 2 | Tickets resueltos auto, escalation rate |
| Idea 3 | Engagement, satisfacción |
| Idea 4 | Tiempo de creación product |
| Idea 5 | PDFs descargados |
| Idea 6 | CTR en recomendaciones |
| Idea 7 | SEO ranking mejora |

### 7.4 Roadmap Sugerido

| Mes | Ideas | Entregable |
|-----|-------|------------|
| **Mes 1** | Idea 1 | Course Assistant beta |
| **Mes 2** | Idea 2 | Support Chatbot |
| **Mes 3** | Idea 3 | AI Afiliate Chat |
| **Mes 4** | Idea 4 | Description Generator |
| **Mes 5** | Idea 5 | Certificate PDF |
| **Mes 6** | Ideas 6-7 | Recs + SEO |

---

## Anexo A: Glosario

| Término | Definición |
|---------|------------|
| **RAG** | Retrieval-Augmented Generation |
| **SSE** | Server-Sent Events |
| **Streaming** | Respuesta progresiva |
| **Plan Pro** | Plan de suscripción pagos |
| **AI Credits** | Créditos prepagos para AI |

---

## Anexo C: Endpoints AI - Matriz de Interacciones Consolidada

### Credits System

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/credits` | GET | Consultar saldo | Plan Pro | JWT | — |
| `/api/ai/credits/packages` | GET | Ver paquetes disponibles | Público | — | — |
| `/api/ai/credits/purchase` | POST | Comprar créditos | Plan Pro | JWT | — |
| `/api/ai/credits/transactions` | GET | Historial de transacciones | Plan Pro | JWT | — |

### Embeddings

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/embeddings` | POST | Crear embedding | Plan Pro | JWT | — |
| `/api/ai/embeddings/search` | GET | Buscar similitud | Plan Pro | JWT | — |
| `/api/ai/embeddings/:sourceType/:sourceId` | DELETE | Eliminar embedding | Plan Pro | JWT | — |

### Q&A System

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/products/:productId/questions` | GET | Listar preguntas | Público | — | — |
| `/api/ai/products/:productId/questions` | POST | Crear pregunta | Comprador | JWT | — |
| `/api/ai/questions/:questionId` | DELETE | Eliminar pregunta | Creador | JWT | — |
| `/api/ai/questions/:questionId/vote` | POST | Votar pregunta | Comprador | JWT | — |
| `/api/ai/questions/:questionId/vote` | DELETE | Quitar voto | Comprador | JWT | — |

### FAQs

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/products/:productId/faqs` | GET | Listar FAQs | Público | — | — |
| `/api/ai/products/:productId/faqs` | POST | Crear FAQ | Creador | JWT | — |
| `/api/ai/faqs/:faqId` | DELETE | Eliminar FAQ | Creador | JWT | — |

### Reviews

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/products/:productId/reviews` | GET | Listar reviews | Público | — | — |
| `/api/ai/products/:productId/reviews` | POST | Crear review | Comprador | JWT | — |
| `/api/ai/reviews/:reviewId` | DELETE | Eliminar review | Creador | JWT | — |
| `/api/ai/reviews/:reviewId/vote` | POST | Votar review | Comprador | JWT | — |
| `/api/ai/reviews/:reviewId/vote` | DELETE | Quitar voto | Comprador | JWT | — |
| `/api/ai/products/:productId/reviews/settings` | GET | Configuración | Creador | JWT | — |
| `/api/ai/products/:productId/reviews/distribution` | GET | Distribución ratings | Público | — | — |

### Reports/Denunciations

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/reports/reasons` | GET | Lista de motivos | Público | — | — |
| `/api/ai/reports` | POST | Crear denuncia | Comprador | JWT | — |
| `/api/ai/reports` | GET | Listar denuncias | Admin | JWT | — |
| `/api/ai/reports/:reportId` | GET | Ver denuncia | Admin | JWT | — |
| `/api/ai/reports/:reportId/actions` | POST | Tomar acción | Admin | JWT | — |

### Policies

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/content/policies` | GET | Listar políticas | Público | — | — |

### QA Agent

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/products/:productId/qa-agent/config` | GET | Ver configuración | Creador | JWT | — |
| `/api/ai/agents/qa/chat` | POST | Chat sin streaming | Plan Pro | JWT | — |
| `/api/ai/agents/qa/chat/stream` | POST | Chat con streaming | Plan Pro | JWT | ✅ |

### Conversations

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/agents/conversations` | GET | Listar conversaciones | Plan Pro | JWT | — |
| `/api/ai/agents/conversations/:conversationId` | GET | Ver conversación | Plan Pro | JWT | — |

### Tutor AI

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/products/:productId/tutor/config` | GET | Ver configuración | Creador | JWT | — |
| `/api/ai/products/:productId/tutor/insights` | GET | Ver insights | Creador | JWT | — |
| `/api/ai/products/:productId/tutor/chat` | POST | Chat sin streaming | Plan Pro | JWT | — |
| `/api/ai/products/:productId/tutor/chat/stream` | POST | Chat con streaming | Plan Pro | JWT | ✅ |

### Insights AI

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/insights/dashboards` | GET | Listar dashboards | Plan Pro | JWT | — |
| `/api/ai/insights/dashboards` | POST | Crear dashboard | Plan Pro | JWT | — |
| `/api/ai/insights/dashboards/:dashboardId` | DELETE | Eliminar dashboard | Plan Pro | JWT | — |
| `/api/ai/insights/query` | POST | Query sin streaming | Plan Pro | JWT | — |
| `/api/ai/insights/query/stream` | POST | Query con streaming | Plan Pro | JWT | ✅ |

### Learning/Certificates

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/learning/certificate/verify/:code` | GET | Verificar certificado | Público | — | — |

### Nuevas Ideas (1-11)

| Endpoint | Método | Descripción | Acceso | Autenticación | Streaming |
|-----------|--------|-------------|--------|---------------|-----------|
| `/api/ai/content/assist` | POST | AI Content Assistant (todos los tipos) | Plan Pro | JWT | ✅ |
| `/api/ai/support/chat` | POST | Support Chatbot | Público | — | ✅ |
| `/api/ai/support/escalate` | POST | Escalar a email | Público | — | — |
| `/api/ai/affiliate/chat` | POST | Afiliate Chat | Afiliado/Comprador | JWT | ✅ |
| `/api/ai/product/description` | POST | Description Generator | Plan Pro | JWT | — |
| `/api/ai/product/seo` | POST | SEO Optimizer | Plan Pro | JWT | — |
| `/api/learning/certificate/:id/pdf` | GET | Certificate PDF | Owner | JWT | — |
| `/api/products/recommendations` | GET | Smart Recommendations | Plan Pro | JWT | — |
| `/api/products/:productId/contact` | POST | Contactar Creador | Comprador/Afiliado | JWT | — |
| `/api/products/:productId/inquiries` | GET | Ver consultas (solo creador) | Creador | JWT | — |
| `/api/users/export-data` | POST | Data Export (Descargar Mi Información) | Creador | JWT | — |
| `/api/ai/products/:productId/sentiment-insights` | GET | Sentiment Analytics | Plan Pro | JWT | — |
| `/api/products/:productId/lessons/:lessonId/player` | GET | Advanced DRM (protected video) | Plan Pro | JWT | — |

---

## Anexo D: Comparativa Docs vs Implementado

### ENDPOINTS EXISTENTES NO EN PRD ORIGINAL

Los siguientes endpoints están implementados pero NO están documentados en el PRD original:

| Módulo | Endpoint | Agregar a docs? |
|--------|----------|----------------|
| **Conversations** | `/api/ai/agents/conversations` | ✅Sí |
| **Conversations** | `/api/ai/agents/conversations/:id` | ✅Sí |
| **Tutor Config** | `/api/ai/products/:id/tutor/config` | ✅Sí |
| **Tutor Insights** | `/api/ai/products/:id/tutor/insights` | ✅Sí |
| **QA Config** | `/api/ai/products/:id/qa-agent/config` | ✅Sí |
| **Review Settings** | `/api/ai/products/:id/reviews/settings` | ✅Sí |
| **Review Distribution** | `/api/ai/products/:id/reviews/distribution` | ✅Sí |
| **Reports Reasons** | `/api/ai/reports/reasons` | ✅Sí |
| **Policies** | `/api/ai/content/policies` | ✅Sí |
| **Certificates** | `/api/learning/certificate/verify/:code` | ✅Sí |

### RESUMEN ACTUALIZACIÓN REQUERIDA

| Doc | Status | Acción |
|-----|--------|--------|
| **PRD.md** | Desactualizado | Agregar endpoints missing + Ideas 1-11 |
| **User-Stories.md** | OK | Verificar coverage |
| **Feasibility Analysis** | ✅ Listo | Ya creado (11 ideas) |

---

## Anexo B: Referencias

- `docs/project/ai-features/PRD.md` - AI Features original (ORIGINAL, requiere update)
- `docs/project/ai-features/specs/User-Stories-AI-Features.md` - User stories (verificar)
- `docs/features/lms.md` - LMS features
- `docs/features/affiliates.md` - Sistema de afiliados