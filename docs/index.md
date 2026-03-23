# Introducción a Crema

**Crema** es una plataforma tecnológica diseñada para que cualquier persona pueda crear, vender y administrar sus productos digitales de manera profesional.

## ¿Qué es Crema?

Crema es el motor de infraestructura para la economía de los creadores, permitiendo la comercialización, protección y escalabilidad de info-productos bajo normativas globales de transparencia financiera.

## Problema que Resuelve

Los creadores de contenido digital enfrentan múltiples desafíos:

- **Complejidad técnica**: Montar una plataforma de ventas requiere conocimientos de programación, hosting y seguridad.
- **Gestión de pagos**: Procesar transacciones, calcular comisiones y manejar reembolsos es tedioso.
- **Protección del contenido**: El robo y la piratería de productos digitales representan pérdidas significativas.
- **Cumplimiento fiscal**: En Argentina, la Ley de Economía del Conocimiento exige documentar inversiones en investigación y desarrollo.
- **Sistema de afiliados**: Implementar un programa de referidos con comisiones automáticas es técnicamente demandante.

## Solución

Crema centraliza todas estas necesidades en una sola plataforma, permitiendo que los creadores se enfoquen exclusivamente en producir contenido de calidad.

## Características Principales

### Productos Soportados
- Cursos online
- E-books y audiolibros
- Membresías
- Podcasts premium
- Software y accesos

### Funcionalidades Core
1. **Tienda Digital Multi-Producto** - Vende diferentes tipos de productos desde una única plataforma
2. **Streaming de Video Seguro** - Videos protegidos con encriptación
3. **Sistema de Afiliados** - Comisiones automáticas para promotores
4. **Pasarela de Pagos** - Integración con Mercado Pago
5. **LMS Integrado** - Seguimiento de progreso, quizzes, certificados
6. **Safe-Guard** - Protección anti-fraude
7. **Gestión de Ganancias** - Saldos pendientes, disponibles, de plataforma
8. **Cumplimiento Fiscal** - Ley de Economía del Conocimiento (Argentina)

### Funcionalidades AI (v1.2) ⭐
1. **Crema Memory Service** - Búsqueda semántica con pgvector
2. **Q&A con IA** - Auto-respuesta de preguntas + FAQs
3. **Reviews/Ratings** - Sistema de calificación con votos útiles
4. **Denunciations** - Sistema de reportes con políticas de contenido
5. **AI Agents** - Agente Q&A entrenable por producto
6. **Analytics Dashboard** - Métricas diarias de creadores
7. **Tutor AI** - Asistente inteligente para estudiantes
8. **Insights AI** - Consultas en lenguaje natural a datos

## Para quién es?

### Creadores de Contenido
- Instructores de cursos online
- Autores de e-books y audiolibros
- Consultores que venden contenido premium
- Creadores de software o herramientas

### Afiliados
- Personas que desean generar ingresos promocionando productos de otros

### Administradores
- Dashboard completo de gestión
- Reportes de ventas, comisiones y métricas

## Stack Tecnológico

- **Backend**: Node.js 20+ con Express 5 y TypeScript
- **Base de Datos**: PostgreSQL 18 + pgvector (búsqueda semántica)
- **Colas**: BullMQ con Redis
- **Pagos**: Mercado Pago
- **Video**: Mux Video / Cloudflare Stream
- **AI**: OpenAI GPT-4o-mini + Embeddings
- **Testing**: Vitest
- **Build**: esbuild

## Estructura del Proyecto

```
crema/
├── backend/           # API REST (Node.js + TypeScript)
├── frontend-main/    # Frontend principal (próximamente)
├── frontend-admin/   # Panel de administración (próximamente)
├── shared/          # Tipos y utilitários compartidos
└── docs/           # Documentación
```

## Siguientes Pasos

- [Setup Local](./development/setup.md) - Configura tu entorno de desarrollo
- [Arquitectura](./architecture/overview.md) - Aprende sobre la arquitectura del sistema
- [API](./api/index.md) - Explora los endpoints disponibles
- [Estrategia de Deploy](./development/deploy-strategy.md) - Plan de deploy en Railway (para cuando el proyecto esté completo)

---

*Para más información, consulta los documentos en las secciones correspondientes.*
