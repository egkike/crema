# Cumplimiento Fiscal: Ley de Economía del Conocimiento

## Overview

Crema incluye un sistema de tracking y reportes para cumplir con la **Ley de Economía del Conocimiento (LEC)** de Argentina (Ley 27.506).

## ¿Qué es la LEC?

La **Ley 27.506** (antes 26.690) beneficia a empresas que:
- Desarrollan software o servicios digitales
- Invierten al menos **3%** de su facturación bruta en I+D
- Trabajan en investigación y desarrollo

### Beneficios Fiscales

- Bono de crédito fiscal
- Reducción de aportes patronales
- Stabilización fiscal

---

## Sistema de Tracking LEC

### Tablas Involucradas

```sql
-- Proyectos de Innovación
CREATE TABLE lec_rd_projects (
    id UUID PRIMARY KEY,
    project_name VARCHAR(100),
    category VARCHAR(50),  -- investigacion_basica, desarrollo_experimental, innovacion_procesos
    description TEXT,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN
);

-- Logs de Desarrollo
CREATE TABLE lec_rd_logs (
    id UUID PRIMARY KEY,
    project_id UUID REFERENCES lec_rd_projects(id),
    developer_id UUID REFERENCES users(id),
    hours_spent DECIMAL(5,2),
    task_description TEXT,
    code_commit_ref TEXT,  -- Link a commit de GitHub
    created_at TIMESTAMP
);
```

---

## Flujo de Registro

### 1. Admin crea proyecto de I+D

```
POST /api/admin/lec/projects
```

```json
{
  "project_name": "Algoritmo de Streaming Anti-Piratería",
  "category": "desarrollo_experimental",
  "description": "Desarrollo de sistema de protección de videos",
  "start_date": "2024-01-01"
}
```

### 2. Admin registra horas de desarrollo

```
POST /api/admin/lec/rd-logs
```

```json
{
  "project_id": "uuid",
  "developer_id": "uuid",
  "hours_spent": 8,
  "task_description": "Implementación de firmas RS256",
  "code_commit_ref": "https://github.com/crema/backend/commit/abc123"
}
```

---

## Cálculo del Ratio de Inversión

### Fórmula

```
Investment Ratio = (I+D Investment / Gross Revenue) * 100
```

Donde:
- **I+D Investment**: Horas trabajadas × Valor hora (configurable)
- **Gross Revenue**: Facturación bruta total

### Ejemplo

```
Horas I+D en el año: 1,250 horas
Valor hora: $900
Inversión I+D: $1,125,000

Facturación bruta anual: $25,000,000

Ratio = (1,125,000 / 25,000,000) × 100 = 4.5%
```

### Semáforo

| Ratio | Estado | Color |
|-------|--------|-------|
| >= 3% | CUMPLIMIENTO | 🟢 Verde |
| 2-3% | ADVERTENCIA | 🟡 Amarillo |
| < 2% | INCUMPLIMIENTO | 🔴 Rojo |

---

## Reportes de Auditoría

### Exportar Reporte LEC

```
GET /api/admin/export/lec-report?month=3&year=2024
```

Genera CSV con:
- Proyectos activos
- Horas registradas por proyecto
- Inversiones individuales
- Ratio de cumplimiento

### Contenido del Reporte

```csv
Project,Category,Hours,Investment,Month,Year
Algoritmo Streaming,desarrollo_experimental,120,108000,3,2024
API de Pagos,innovacion_procesos,80,72000,3,2024
...
TOTAL,,""",,180000,""
INVESTMENT_RATIO,,,""",,4.5%
```

---

## Integración con Contabilidad

### Datos del Creador

El sistema registra:
- CUIT/CUIL del creador
- Condición fiscal (RI, Monotributo, Exento)
- Retenciones aplicadas

### Libro IVA Ventas

```
GET /api/admin/export/tax-report
```

Reporte de ventas cruzando:
- Facturación por creador
- IVA retenido
- IIBB retenido
- Condición fiscal

---

## API de Administración LEC

| Endpoint | Descripción |
|----------|-------------|
| `GET /admin/lec/projects` | Listar proyectos |
| `POST /admin/lec/rd-logs` | Registrar horas |
| `GET /admin/lec/compliance-status` | Ver estado de cumplimiento |
| `GET /admin/export/lec-report` | Exportar reporte |

---

## Configuración del Sistema

### Tabla: platform_configs

```sql
-- Valor hora para cálculo de inversión
INSERT INTO platform_configs (key, currency, value) VALUES
    ('lec_hourly_rate', 'ARS', 900);

-- Minimum ratio required
INSERT INTO platform_configs (key, currency, value) VALUES
    ('lec_min_ratio', NULL, 3.0);
```

---

## Workflow Completo

```
1. Fin del mes
       │
       ▼
2. Admin revisa proyectos activos
       │
       ▼
3. Admin registra horas de desarrollo
   (vinculando a commits de GitHub)
       │
       ▼
4. Sistema calcula:
   - Inversión total = horas × valor_hora
   - Facturación bruta del período
   - Ratio de inversión
       │
       ▼
5. Si ratio >= 3%:
   ✅ CUMPLIMIENTO
   Si ratio < 3%:
   ⚠️ ADVERTENCIA
       │
       ▼
6. Generar reporte para contador
   (export CSV)
```

---

## Consideraciones Legales

### Documentación Requerida

1. **Libro de Actividades**: Registro de tareas de I+D
2. **Comprobantes**: Facturas de servicios, contratos
3. **Evidencia técnica**: Commits, documentación

### Plazos

- Registro anual ante la AFIP
- Presentación de informe anteministico

---

## Ver También

- [API: Admin](../api/endpoints/admin.md)
- [Database Schema](../database/schema.md)
