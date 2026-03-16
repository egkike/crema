# Roadmap del Proyecto

## Estado Actual

| Componente | Estado | Notas |
|------------|--------|-------|
| Backend API | ✅ Completo | ~90% de funcionalidades implementadas |
| Frontend | ❌ Pendiente | Por desarrollar |
| Documentación | 🔄 En Progreso | SDD en curso |

---

## Fase 1: Backend Core (Completado)

###已完成 ✅
- [x] Autenticación JWT con refresh tokens
- [x] 2FA (autenticación de dos factores)
- [x] Gestión de usuarios (CRUD)
- [x] Sistema de productos (cursos, ebooks, membresías)
- [x] Sistema de módulos y lecciones
- [x] LMS básico (progreso, quizzes)
- [x] Certificados automáticos
- [x] Sistema de pagos (Mercado Pago)
- [x] Sistema de afiliados
- [x] Comisiones automáticas
- [x] Balances (pending, available)
- [x] Payouts (retiros)
- [x] Reembolsos con Safe-Guard
- [x] Streaming de video (Mux/Cloudflare)
- [x] Cumplimiento LEC
- [x] Documentación Swagger/OpenAPI

---

## Fase 2: Frontend (Pendiente)

### Planificado
- [ ] Interfaz de usuario (Astro + React)
- [ ] Dashboard de Creator
- [ ] Dashboard de Afiliado
- [ ] Checkout de pagos
- [ ] Player de video
- [ ] Portal de estudiante (LMS)
- [ ] Panel de administración

---

## Fase 3: Funcionalidades Avanzadas (Planificado)

### Sistema de Membresías
- [ ] Suscripciones recurrentes
- [ ] Acceso a contenido por nivel
- [ ] Renovación automática

### Comunidad
- [ ] Reviews/Ratings de productos
- [ ] Comentarios en lecciones
- [ ] Foro de estudiantes

### Marketing
- [ ] Emails transaccionales
- [ ] Sequences automatizadas
- [ ] Landing pages

### Analytics
- [ ] Dashboard de métricas avanzado
- [ ] Heatmaps de estudiantes
- [ ] Reports de conversión

---

## Fase 4: Escalabilidad (Planificado)

### Infraestructura
- [ ] Docker/Kubernetes setup
- [ ] CI/CD pipelines
- [ ] Load balancing
- [ ] Cache con Redis
- [ ] CDN para assets

### Monitoreo
- [ ] Logs centralizados
- [ ] Métricas (Prometheus/Grafana)
- [ ] Alerts
- [ ] Health checks

---

## Fase 5: Marketplace (Planificado)

### Plataforma
- [ ] Búsqueda avanzada
- [ ] Categorías y filtros
- [ ] Featured products
- [ ] Descuentos globales

### Descubrimiento
- [ ] Recomendaciones
- [ ] "Products similar to..."
- [ ] Best sellers

---

## Lista de Espera (Backlog)

### Nice to Have
- [ ] App móvil (React Native)
- [ ] Webinars integrados
- [ ] Comunidad/Foro
- [ ] Chat con creador
- [ ] Gamificación (logros, badges)

###未来 (Futuro)
- [ ] Multi-idioma
- [ ] White-label
- [ ] API pública para terceros

---

## Timeline Tentativo

```
2026
├── Q1: Frontend v1 (Dashboard + Checkout)
├── Q2: Frontend v2 (LMS + Player)
├── Q3: Funcionalidades avanzadas
└── Q4: Escalabilidad + Marketplace
```

---

## Cómo Contribuir

¿Querés ayudar? Mirá nuestra [Guía de Contribuciones](../development/contributing.md).

---

## Ver También

- [Setup Local](../development/setup.md)
- [Arquitectura](../architecture/overview.md)
