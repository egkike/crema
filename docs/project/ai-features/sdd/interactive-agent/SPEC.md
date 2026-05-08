# SDD Spec: Interactive Agent (Talleres Dinámicos)

**Change**: interactive-agent
**Type**: AI Feature
**SDD Phase**: Spec
**Status**: Draft
**Date**: Mayo 2026
**Owner**: Kike García
**Depends on**: proposal.md

---

## 1. Overview

Permite que compradores carguen datos específicos en módulos de productos y reciban análisis IA personalizado basado en sus datos. El creador configura qué campos se piden por módulo.

**Objetivo:** Transformar productos pasivos en herramientas de implementación active.

---

## 2. Data Model

### 2.1 Tablas (ver `db/init/12-interactive-agent.sql`)

```sql
-- user_course_data: datos del usuario por producto/módulo
CREATE TABLE user_course_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL,
  input_data JSONB NOT NULL DEFAULT '{}',
  output_analysis JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id, module_key)
);

-- product_module_fields: configuración de campos por módulo (creator)
CREATE TABLE product_module_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  module_key VARCHAR(100) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL CHECK (field_type IN ('number', 'string', 'boolean', 'select')),
  field_label VARCHAR(255) NOT NULL,
  field_placeholder VARCHAR(255),
  field_options JSONB DEFAULT '[]',
  field_required BOOLEAN DEFAULT true,
  field_validation JSONB DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, module_key, field_name)
);

CREATE TRIGGER update_user_course_data
  BEFORE UPDATE ON user_course_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_module_fields
  BEFORE UPDATE ON product_module_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.2 Índices

```sql
CREATE INDEX IF NOT EXISTS idx_user_course_data_user ON user_course_data(user_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_product ON user_course_data(product_id);
CREATE INDEX IF NOT EXISTS idx_user_course_data_module ON user_course_data(module_key);
CREATE INDEX IF NOT EXISTS idx_user_course_data_created ON user_course_data(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_product ON product_module_fields(product_id);
CREATE INDEX IF NOT EXISTS idx_product_module_fields_module ON product_module_fields(module_key);
```

---

## 3. Functional Requirements

### 3.1 FR-1: Configurar campos por módulo (Creador)

**Endpoint:** `POST /api/interactive/fields/:productId`

**Validaciones:**
- User es owner del producto (`verifyProductOwnership`)
- Campos no duplicados (UNIQUE constraint)
- `module_key` regex: `/^[a-z0-9_]+$/`
- Máximo 50 campos por módulo

**Request body:**
```typescript
{
  moduleKey: string,
  fields: Array<{
    fieldName: string,    // regex: /^[a-z0-9_]+$/
    fieldType: 'number' | 'string' | 'boolean' | 'select',
    fieldLabel: string,
    fieldPlaceholder?: string,
    fieldOptions?: Array<{ value: string; label: string }>,  // solo para 'select'
    fieldRequired?: boolean,
    fieldValidation?: { min?: number; max?: number; pattern?: string },
    orderIndex?: number
  }>
}
```

### 3.2 FR-2: Obtener campos configurados (Comprador)

**Endpoint:** `GET /api/interactive/fields/:productId`

**Descripción:** Devuelve campos configurados para el módulo

**Validaciones:**
- User tiene acceso al producto (comprador o creador)

**Response:**
```typescript
{
  modules: Array<{
    moduleKey: string,
    fields: Array<{
      fieldName: string,
      fieldType: string,
      fieldLabel: string,
      fieldPlaceholder?: string,
      fieldOptions?: Array<{ value: string; label: string }>,
      fieldRequired: boolean
    }>
  }>
}
```

### 3.3 FR-3: Guardar datos del usuario (Comprador)

**Endpoint:** `POST /api/interactive/data/:productId`

**Validaciones:**
- User tiene orden completada del producto
- `input_data` máximo 50KB
- Campos requeridos presentes según configuración
- Tipos de datos correctos según fieldType

**Credit cost:** 1 crédito por primer save (re-saves son gratuitos)

**Request body:**
```typescript
{
  moduleKey: string,
  inputData: Record<string, number | string | boolean>
}
```

**Response:**
```typescript
{
  success: true,
  savedAt: string  // ISO timestamp
}
```

### 3.4 FR-4: Actualizar datos existentes

**Endpoint:** `PUT /api/interactive/data/:productId/:moduleKey`

**Validaciones:** Mismo que FR-3, pero usando UPDATE

**Response:**
```typescript
{
  success: true,
  savedAt: string
}
```

### 3.5 FR-5: Obtener mis datos guardados

**Endpoint:** `GET /api/interactive/data/:productId`

**Query params:**
- `moduleKey` (opcional): filtrar por módulo específico

**Response:**
```typescript
{
  modules: Array<{
    moduleKey: string,
    inputData: Record<string, unknown>,
    outputAnalysis?: Record<string, unknown>,
    completedAt?: string,
    updatedAt: string
  }>
}
```

### 3.6 FR-6: Solicitar análisis IA

**Endpoint:** `POST /api/interactive/analyze/:productId/:moduleKey`

**Validaciones:**
- User tiene acceso al producto
- Datos cargados existen para el módulo
- Credit balance suficiente (3-5 créditos)

**Credit cost:** 3-5 créditos (configurable via ConfigService en futuro, hardcodeado v1: 3 créditos)

**Lógica:**
1. Obtener `input_data` del usuario
2. Obtener configuración de campos (`product_module_fields`)
3. Construir prompt con los datos del usuario
4. Llamar LLMService con prompt de análisis
5. Guardar `output_analysis` en `user_course_data.output_analysis`
6. Consumir créditos

**Prompt template:**
```
Eres un analista de negocios para el producto "{productName}".
El usuario ha completado el módulo "{moduleKey}" con los siguientes datos:

{datos_formateados}

Genera:
1. Análisis personalizado basado en estos datos
2. Recomendaciones actionables
3. Próximos pasos concretos
4. Métricas calculadas si aplica
```

**Response:**
```typescript
{
  analysis: string,
  recommendations: string[],
  nextSteps: string[],
  metrics: Record<string, number | string>,
  creditsUsed: number
}
```

### 3.7 FR-7: Analytics agregados (Creador)

**Endpoint:** `GET /api/interactive/analytics/:productId`

**Validaciones:**
- User es owner del producto

**Response:**
```typescript
{
  totalUsers: number,
  completedModules: number,
  averageCompletion: number,
  fieldStats: Array<{
    fieldName: string,
    moduleKey: string,
    average: number,     // para number fields
    responses: number    // count de respuestas
  }>,
  recentActivity: Array<{
    userId: string,      // anónimo, solo ID
    moduleKey: string,
    completedAt: string
  }>
}
```

> **Privacy:** IDs de usuarios se anonimizan para analytics del creator.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Operation | Target |
|-----------|--------|
| Save data | < 200ms |
| Get data | < 100ms |
| Analysis generation | < 10s |
| Get analytics | < 500ms |

### 4.2 Rate Limiting

- `interactiveAgentLimiter`: 10 requests/min per user para análisis
- Save/get data: sin límite específico (usa `apiLimiter` global)

### 4.3 Security

- Validación de ownership en todos los endpoints
- Zod schemas para input validation
- Parámetros de DB siempre protegidos (no string interpolation)
- No loggear `input_data` en errores

### 4.4 Límites

| Recurso | Límite |
|---------|--------|
| Campos por módulo | 50 |
| Tamaño `input_data` | 50KB |
| Módulos por producto | sin límite |
| Datos guardados por usuario | sin límite (sobrescribe existente) |

---

## 5. Error Codes

| HTTP | Código | Descripción |
|------|--------|-------------|
| 400 | INTERACTIVE_INVALID_MODULE | moduleKey con caracteres inválidos |
| 400 | INTERACTIVE_INVALID_FIELD_TYPE | field_type no válido |
| 400 | INTERACTIVE_DATA_TOO_LARGE | input_data excede 50KB |
| 400 | INTERACTIVE_MISSING_REQUIRED | Campo requerido faltante |
| 400 | INTERACTIVE_INCOMPLETE_FIELDS | Campos requeridos incompletos para análisis |
| 401 | - | No autenticado (jwtAuthMiddleware) |
| 403 | INTERACTIVE_NO_PRODUCT_ACCESS | User no tiene acceso al producto |
| 403 | INTERACTIVE_NOT_PRODUCT_OWNER | User no es owner del producto |
| 402 | INTERACTIVE_INSUFFICIENT_CREDITS | No suficientes créditos |
| 404 | INTERACTIVE_NO_DATA | No existen datos para este usuario/módulo |
| 404 | INTERACTIVE_NO_DATA_TO_ANALYZE | No hay datos para analizar en este módulo |
| 429 | - | Rate limit exceeded |

---

## 6. Acceptance Criteria

- [ ] Creador puede crear/actualizar campos por módulo con validación completa
- [ ] Comprador puede guardar sus datos y recibe confirmación
- [ ] Análisis IA genera respuesta personalizada basada en los datos del usuario
- [ ] Credits se consumen correctamente (1 por save, 3 por análisis)
- [ ] Rate limiter protege el endpoint de análisis (10/min)
- [ ] Owner puede ver analytics agregados (anonimizado)
- [ ] Todos los inputs validados con Zod
- [ ] Tests unitarios cubriendo lógica principal

---

## 7. Dependencies

**Reusable modules (ver reusable-resources.md):**
- `ConfigService` — futuro para límites configurables
- `LLMService` — análisis IA
- `aiCreditService` — consumo de créditos
- `AppError` — manejo de errores
- `globalErrorHandler` — middleware
- `jwtAuthMiddleware` — auth
- `rateLimit` — rate limiting

**DB Tables existentes:**
- `users` — FK para user_id
- `products` — FK para product_id, ownership check
- `ai_credits` — credit balance

**DB Tables nuevas:**
- `user_course_data` (esta SDD)
- `product_module_fields` (esta SDD)

**DB Init script:** `db/init/12-interactive-agent.sql`

---

## 8. Out of Scope (v1)

- Integración con Orchestrator (v2)
- Async processing con BullMQ para análisis pesados (v1 es sync)
- Persistencia de historial de análisis (solo último análisis guardado)
- Frontend
- Notificaciones email/push al creator cuando alumno completa módulo