# Documentación del Proyecto Crema

> Índice centralizado de toda la documentación del proyecto.

---

## Estructura de Documentación

```
docs/project/
├── README.md                    ← Este archivo
│
├── crypto-usdt-gateway/         # Pasarela de Pagos Crypto (USDT)
│   ├── PRD.md                   # Product Requirements Document
│   ├── roadmap.md               # Roadmap de implementación
│   ├── analysis/                # Análisis técnicos y guías
│   │   ├── analisis-factibilidad-crypto-pagos.md
│   │   └── guia-configuracion-blockonomics.md
│   └── specs/                   # Especificaciones SDD
│       ├── user-stories.md
│       ├── tsd.md
│       └── test-plan.md
│
├── ai-features/                 # Sistema de Interacción y Analytics (AI)
│   ├── PRD.md                   # Product Requirements Document
│   └── specs/                   # Especificaciones SDD
│       ├── user-stories.md
│       └── test-plan.md
│
├── common/                      # Documentos compartidos
│   ├── proceso-sdd.md           # Proceso SDD (referencia)
│   ├── glossary.md              # Glosario de términos
│   ├── roadmap.md              # Roadmap general del proyecto
│   ├── business-blueprint.md   # Modelo de negocio
│   └── analisis-comparativo-crema-vs-hotmart.md
│
└── archive/                     # Proyectos completados o descartados
```

---

## Proyectos Activos

### 🚀 Crypto USDT Gateway

Implementación de pasarela de pagos con criptomonedas (USDT) usando Blockonomics.

| Documento | Descripción |
|-----------|-------------|
| [PRD](./crypto-usdt-gateway/PRD.md) | Requisitos del producto |
| [Roadmap](./crypto-usdt-gateway/roadmap.md) | Plan de implementación |
| [Análisis](./crypto-usdt-gateway/analysis/) | Factibilidad y guías |
| [Specs](./crypto-usdt-gateway/specs/) | User Stories, TSD, Test Plan |

**Estado**: En implementación

---

### 🚀 AI Features

Sistema de interacción y analytics con AI: Credits, Q&A, Reviews, Denuncias, Agentes AI, Dashboard.

| Documento | Descripción |
|-----------|-------------|
| [PRD](./ai-features/PRD.md) | Requisitos del producto |
| [Specs](./ai-features/specs/) | User Stories, Test Plan |

**Estado**: En implementación

---

## Proyectos Futuros

| Proyecto | Descripción | Estado |
|----------|-------------|--------|
| Frontend Crema Pages | Frontend principal de la plataforma | Pendiente |
| Frontend Creator Dashboard | Dashboard para creadores | Pendiente |

---

## Proceso SDD (Spec Driven Development)

Todo nuevo feature debe seguir el flujo SDD:

1. **PRD** → Define qué debe hacer el producto
2. **User Stories + Acceptance Criteria** → Desglosa en tareas verificables
3. **Technical Specification (TSD)** → Define arquitectura y diseño técnico
4. **Test Plan / Test Cases** → Define cómo se validará
5. **Development Roadmap** → Organiza en tareas
6. **Código** → Implementación (solo después del paso 4)

Ver [Proceso SDD](./common/proceso-sdd.md) para más detalles.

---

## Cómo Agregar un Nuevo Proyecto

1. Crear carpeta: `docs/project/<nombre-proyecto>/`
2. Crear `PRD.md` con los requisitos
3. Generar specs usando los templates en `common/` (si existen)
4. Actualizar este README con el nuevo proyecto

---

## Guías de Contribución

- Usar español para documentos de producto
- Usar inglés para código y APIs
- Mantener consistente el formato de cada documento
- Actualizar el índice (README) al agregar nuevos proyectos

---

**Última actualización**: Marzo 2026
