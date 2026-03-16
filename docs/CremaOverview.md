# 🍦 Crema - Plataforma para la Economía de los Creadores

## ¿Qué es Crema?

**Crema** es una plataforma tecnológica diseñada para que cualquier persona pueda crear, vender y administrar sus productos digitales de manera profesional.

---

## Estado de Implementación

| Feature | Estado | Notas |
|---------|--------|-------|
| Backend API | ✅ Completo | ~90% funcionalidades |
| Frontend | ❌ Pendiente | Por desarrollar |

---

## Los desafíos que enfrentan los creadores

Los creadores de contenido digital enfrentan múltiples desafíos:

- **Complejidad técnica**: Montar una plataforma de ventas requiere conocimientos de programación.
- **Gestión de pagos**: Procesar transacciones, calcular comisiones y manejar reembolsos.
- **Protección del contenido**: El robo y la piratería representan pérdidas significativas.
- **Cumplimiento fiscal**: La Ley de Economía del Conocimiento exige documentar I+D.
- **Sistema de afiliados**: Comisiones automáticas para promotores.

---

## Funcionalidades Principales

### 1. Tienda Digital Multi-Producto ✅

Vende diferentes tipos de productos digitales:

| Producto | Estado | Descripción |
|----------|--------|-------------|
| Cursos online | ✅ Listo | Lecciones en video, texto y descargables |
| E-books | ✅ Listo | Libros electrónicos |
| Membresías | ✅ Listo | Acceso recurrente |
| Podcasts | ✅ Listo | Audio premium |
| Software | ✅ Listo | Acceso a herramientas |

### 2. Streaming de Video Seguro ✅

- Videos con signed URLs (expiran en tiempo configurable)
- Protección HLS (no descargable)
- Integración con **Mux Video** y **Cloudflare Stream**
- Validación por dominio y referer

### 3. Sistema de Afiliados ✅

- Comisiones configurables por producto
- Tracking por cookie (30 días)
- Portfolio de productos por afiliado
- Comisiones automáticas

### 4. Pasarela de Pagos ✅

- **Mercado Pago** integrado
- Múltiples métodos: tarjetas, efectivo, transferencia
- Webhooks para confirmación automática
- Soporte multi-moneda (ARS, USD, USDT)

### 5. LMS (Learning Management System) ✅

| Feature | Estado |
|---------|--------|
| Seguimiento de progreso | ✅ |
| Quizzes y exámenes | ✅ |
| Certificados automáticos | ✅ |
| Lecciones preview | ✅ |

### 6. Safe-Guard (Protección Anti-Fraude) ✅

- Valida elegibilidad de reembolso
- Bloquea si progreso > 30%
- Productos descargables no reembolsables
- Detección de patrones sospechosos

### 7. Gestión de Ganancias y Retiros ✅

- **Saldo pendiente**: Período de garantía
- **Saldo disponible**: Listo para retiro
- Múltiples métodos de retiro

### 8. Cumplimiento Fiscal (LEC) ✅

- Registro de proyectos I+D
- Cálculo de ratio de inversión (3% mínimo)
- Reportes de auditoría
- Libro IVA Ventas automatizado

---

## ¿Para quién es?

### Para Creadores de Contenido
- Instructores de cursos online
- Autores de e-books
- Consultores con contenido premium
- Creadores de software

### Para Afiliados
- Promotores de productos
- Community managers
- Marketers digitales

### Para Administradores
- Dashboard de gestión
- Reportes de ventas y métricas
- Control de usuarios y productos

---

## Beneficios Clave

| Beneficio | Descripción |
|-----------|-------------|
| **Sin conocimientos técnicos** | Todo lo gestiona la plataforma |
| **Protección de contenido** | Videos seguros contra piratería |
| **Pagos automatizados** | Sin preocupaciones por cobros |
| **Escalable** | Funciona para 1 o 10,000 estudiantes |
| **Cumplimiento legal** | Reportes fiscales automáticos |
| **Transparente** | Cada peso está contabilizado |

---

## Stack Tecnológico

- **Backend**: Node.js 20+ / Express 5 / TypeScript
- **Base de Datos**: PostgreSQL 18
- **Colas**: BullMQ + Redis
- **Pagos**: Mercado Pago
- **Video**: Mux / Cloudflare Stream
- **Testing**: Vitest

---

## Documentación

Ver [docs/README.md](./README.md) para enlaces a documentación completa.

---

## Resumen

Crema es la infraestructura completa para la economía digital de los creadores. El backend está completo y funcional. El frontend está en desarrollo.

---

*Última actualización: Marzo 2026*
