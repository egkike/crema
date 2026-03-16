# Visión General de Arquitectura

## Overview

Crema es una plataforma de e-commerce para productos digitales construida con una arquitectura de API RESTful. El sistema sigue principios de arquitectura limpia (Clean Architecture) con separación clara de responsabilidades.

## Arquitectura de Alto Nivel

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Frontend)                       │
│                    (Próximamente: Astro/React)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (Node.js + Express)                 │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Controllers │  │ Middlewares │  │   Routes    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    SERVICES                             │    │
│  │  (Lógica de negocio: auth, payments, products, etc.)    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          │                                      │
│         ┌────────────────┼────────────────┐                     │
│         ▼                ▼                ▼                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Repositories│  │   Queues    │  │   Utils     │              │
│  │    (DB)     │  │  (BullMQ)   │  │ (Streaming) │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
     ┌──────────┐      ┌──────────┐       ┌──────────┐
     │PostgreSQL│      │  Redis   │       │ External │
     │   (DB)   │      │ (Queues) │       │  APIs    │
     └──────────┘      └──────────┘       │-MercadoPago
                                          │-Mux/Cloudflare
                                          │-Email(SMTP)
                                          └──────────┘
```

## Componentes Principales

### Backend API
El núcleo del sistema expuesto como REST API. Maneja todas las operaciones de negocio.

**Tecnologías:**
- Node.js 20+
- Express 5
- TypeScript 5.9+
- PostgreSQL
- Redis + BullMQ

### Base de Datos
Almacenamiento persistente con PostgreSQL. Usa el patrón Repository para abstracción de datos.

### Sistema de Colas
BullMQ maneja procesamiento asíncrono:
- Envío de emails
- Limpieza de tokens vencidos
- Tareas programadas

### Servicios Externos
- **Mercado Pago**: Procesamiento de pagos
- **Mux/Cloudflare Stream**: Streaming de video seguro
- **SMTP**: Envío de emails transaccionales

## Patrones de Diseño Utilizados

### Layered Architecture
```
Routes → Controllers → Services → Repositories → Database
```

### Repository Pattern
Abstracción de consultas SQL en clases dedicadas.

### Factory Pattern
PaymentProviderFactory para manejar múltiples pasarelas de pago.

### Middleware Pattern
Middleware de autenticación, validación, rate limiting, etc.

### JWT con Refresh Tokens
Sistema de autenticación con rotación de tokens.

## Flujo de Datos Típico

### Creación de Orden
1. Cliente envía request POST /api/orders
2. Middleware valida JWT
3. Controller recibe request
4. Service crea orden
5. Repository persiste en DB
6. Queue programa envío de email
7. Response retorna al cliente

### Acceso a Contenido Protegido
1. Cliente solicita video
2. Middleware verifica acceso (checkAccess)
3. Service genera signed URL con Mux
4. URL temporaria retornada al cliente

## Escalabilidad

La arquitectura permite escalar:
- Horizontal: Múltiples instancias del backend
- Base de datos: Read replicas para queries pesadas
- Colas: Workers adicionales para procesamiento

## Seguridad

- JWT en cookies HttpOnly
- Rate limiting por endpoint
- Helmet para headers de seguridad
- Validación de schemas con Zod
- 2FA opcional para usuarios
- Encriptación de videos streaming

---

## Documentación Relacionada

- [Stack Tecnológico](./stack.md)
- [Estructura de Directorios](./directory-structure.md)
- [Patrones de Diseño](./patterns.md)
- [API](./api/index.md)
