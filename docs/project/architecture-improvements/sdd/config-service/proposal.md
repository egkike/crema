# Proposal: ConfigService

**Cambio**: Centralizar configuración operativa  
**Tipo**: Arquitectura  
**SDD Phase**: Proposal  
**Estado**: Draft  
**Fecha**: Abril 2026

---

## 1. Resumen Ejecutivo

Crear un ConfigService que centralice las variables operativas del sistema (no secrets) permitiendo ajustes sin deploy. Este servicio coexistirá con la configuración existente en `config/index.ts`, que se mantiene para secrets y credentials.

**No es un reemplazo** — es una capa adicional sobre la configuración actual.

---

## 2. Contexto

### Estado Actual

| Fuente | Ubicación | Uso | Puede cambiar runtime? |
|--------|-----------|-----|--------------------------|
| **config/index.ts** | `backend/src/config/` | Secrets, DB, API keys, credentials | ❌ No (requiere restart) |
| **Hardcoded values** | Servicios/Repositories | Limits, timeouts, rates | ❌ No |
| **.env** | Raíz del proyecto | Variables de entorno | ❌ No |
| **app_config (propuesta)** | PostgreSQL | Variables operativas | ✅ Sí |

### Problema Identificado

~15 valores hardcodeados dispersos en el código que dificultan el ajuste operativo:

- Tiempos de retry (payout, release)
- Límites de paginación
- Modelos de AI
- Timeouts de providers
- Rates de comisión

---

## 3. Propuesta

### Enfoque: Capa Híbrida

```
Lectura de config (prioridad):
1. app_config (DB)     → Override
2. config/index.ts (.env) → Fallback
3. default             → Valor hardcoded
```

### Variables Objetivo (Fase 1)

| Key | Tipo | Default | Categoría | Notas |
|-----|:----:|---------|----------|-------|
| `ai.embedding_dimensions` | number | 1536 | ai | Dimensiones de embedding |
| `ai.whisper_model` | string | 'whisper-1' | ai | Modelo de transcripción |
| `ai.default_transcription_lang` | string | 'es' | ai | Idioma por defecto |
| `ai.audio_bitrate` | number | 192000 | ai | Bitrate de audio |
| `ai.simulator_delay` | number | 50 | ai | Delay para simulador |
| `retry.payout_delay` | number | 2000 | retry | Delay de reintento |
| `retry.release_delay` | number | 2000 | retry | Delay de release |
| `pagination.admin_limit` | number | 100 | admin | Límite de paginación |
| `commission.min_creator_margin` | number | 5 | commission | Margen mínimo |
| `commission.max_affiliate_rate` | number | 50 | commission | Tasa máx afiliado |
| `cache.levels_ttl` | number | 300000 | cache | TTL de cache |
| `providers.blockonomics_timeout` | number | 10000 | providers | Timeout Blockonomics |
| `providers.address_cleanup_ttl` | number | 86400000 | providers | Cleanup addresses |

### Qué NO va a app_config

| Variable | Razón |
|----------|-------|
| Secrets (JWT, passwords, API keys) | No van en DB por seguridad |
| DB credentials | Ya en config/index.ts |
| Files paths | No cambian en runtime |
| Feature flags complejos | Pueden implementarse después |

---

## 4. Arquitectura

### Tabla DB

```sql
CREATE TABLE app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) DEFAULT 'string',  -- 'string', 'number', 'boolean', 'json'
    category VARCHAR(20) NOT NULL,              -- 'ai', 'retry', 'admin', 'commission', 'cache', 'providers'
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_config_type CHECK (config_type IN ('string', 'number', 'boolean', 'json'))
);

CREATE INDEX idx_app_config_category ON app_config(category);
CREATE INDEX idx_app_config_key ON app_config(config_key);
```

### Interfaz del Service

```typescript
interface ConfigService {
  get(key: string, defaultValue?: string): string;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  getJSON<T>(key: string, defaultValue?: T): T;

  set(key: string, value: string, type?: string): Promise<void>;
  setMany(configs: Record<string, string>): Promise<void>;

  getAll(category?: string): Record<string, unknown>;
}
```

### Uso en Servicios

```typescript
// Antes (hardcoded)
const DELAY = 2000;

// Después (inyectado)
class PayoutService {
  constructor(
    @inject('ConfigService') private config: ConfigService
  ) {}

  async retry() {
    const delay = this.config.getNumber('retry.payout_delay', 2000);
    // ...
  }
}
```

---

## 5. Dependencias

| Dependencia | Estado | Notas |
|-----------|--------|-------|
| PostgreSQL | ✅ Existente | Tablas ya existentes |
| Repository pattern | ✅ Existente | Crear config.repository.ts |
| Dependency Injection | ✅ Existente | Container existente |
| Redis | ✅ Existente (opcional) | Para caching |

---

## 6. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|------------|--------|-----------|
| Breaking changes | Baja | Alto | Lectura dual (DB → .env → default) |
| Performance (lectura DB) | Media | Medio | Redis caching |
| Keys no encontradas | Baja | Bajo | Defaults obligatorios |

### Mitigaciones Específicas

1. **Lectura dual**: Si no está en DB, busca en .env
2. **Redis caching**: Valor en cache con TTL de 5 min
3. **Fallback checks**: Usar default si no encuentra
4. **Logs**: Registrar cuando usa default

---

## 7. Alcance

### In Scope

- ✅ Crear tabla `app_config`
- ✅ Crear `ConfigService`
- ✅ Migrar ~15 valores hardcodeados
- ✅ Admin endpoint para leer/actualizar config

### Out of Scope

- ❌ Reemplazar config/index.ts
- ❌ Migrar secrets/credentials
- ❌ Feature flags complejos
- ❌ Frontend admin panel completo (solo API)

---

## 8. Métricas de Éxito

| Métrica | Objetivo |
|---------|---------|
| Valores centralizados | 15+ hardcoded → centralizados |
| Cobertura de lectura | 100% con fallback |
| Breaking changes | 0 durante migración |
| Tiempo de implementación | 2 sprints (Semanas 1-2) |

---

## 9. Alternativas Consideradas

| Alternativa | Pros | Contras |
|-------------|------|--------|
| **A) Solo config/index.ts** | No hay cambios | No permite runtime changes |
| **B) Solo app_config** | Runtime flexible | Risk de seguridad |
| **C) Híbrida (propuesta)** | ✅ Flex + seguridad | Más complejidad inicial |

**Recomendación**: Opción C (híbrida)

---

## 10. Recomendación

**Aprobar** este cambio. La capa híbrida permite:
- Ajustes operativos sin deploy (admin simple)
- Backward compatibility total
- Sin riesgo de breaking changes
- Base para futuras features de AI que necesitan tuning

**Estimación**: 2 sprints (~2 semanas)

---

**Siguiente paso**: Spec → Design → Tasks