# Spec: ConfigService

**Cambio**: Implementar ConfigService  
**Tipo**: Arquitectura  
**SDD Phase**: Spec  
**Estado**: Draft  
**Fecha**: Abril 2026

---

## 1. Resumen

Crear un ConfigService que permita lectura de configuración desde PostgreSQL con fallback a variables de entorno y defaults. El servicio será inyectable en todos los servicios existentes.

---

## 2. Interfaz del Service

```typescript
// src/services/config.service.ts
interface IConfigService {
  // Getters con tipos seguros
  get(key: string, defaultValue?: string): string;
  getNumber(key: string, defaultValue?: number): number;
  getBoolean(key: string, defaultValue?: boolean): boolean;
  getJSON<T = unknown>(key: string, defaultValue?: T): T;

  // Setters (solo para Admin)
  set(key: string, value: string, type?: ConfigType): Promise<void>;
  setMany(configs: Record<string, string>): Promise<void>;

  // Queries
  getAll(category?: ConfigCategory): AppConfig[];
  getByKey(key: string): AppConfig | null;
}

type ConfigType = 'string' | 'number' | 'boolean' | 'json';
type ConfigCategory = 'ai' | 'retry' | 'admin' | 'commission' | 'cache' | 'providers' | 'features';
```

---

## 3. Tabla de Base de Datos

```sql
-- Tabla de configuración
CREATE TABLE app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) DEFAULT 'string',
    category VARCHAR(20) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT app_config_config_type_check
        CHECK (config_type IN ('string', 'number', 'boolean', 'json')),
    CONSTRAINT app_config_category_check
        CHECK (category IN ('ai', 'retry', 'admin', 'commission', 'cache', 'providers', 'features'))
);

-- Índices
CREATE INDEX idx_app_config_category ON app_config(category);
CREATE INDEX idx_app_config_key ON app_config(config_key);
```

### Seed Inicial

```sql
-- AI Configuration
INSERT INTO app_config (config_key, config_value, config_type, category, description) VALUES
('ai.embedding_dimensions', '1536', 'number', 'ai', 'Dimensiones para embeddings'),
('ai.whisper_model', 'whisper-1', 'string', 'ai', 'Modelo de Whisper para transcripción'),
('ai.default_transcription_lang', 'es', 'string', 'ai', 'Idioma por defecto para transcripción'),
('ai.audio_bitrate', '192000', 'number', 'ai', 'Bitrate para audio'),
('ai.simulator_delay', '50', 'number', 'ai', 'Delay en ms para simulador'),

-- Retry Configuration
('retry.payout_delay', '2000', 'number', 'retry', 'Delay de reintento en ms'),
('retry.release_delay', '2000', 'number', 'retry', 'Delay de release en ms'),

-- Pagination
('pagination.admin_limit', '100', 'number', 'admin', 'Límite por página'),

-- Commission
('commission.min_creator_margin', '5', 'number', 'commission', 'Margen mínimo del creador (%)'),
('commission.max_affiliate_rate', '50', 'number', 'commission', 'Tasa máxima afiliado (%)'),

-- Cache
('cache.levels_ttl', '300000', 'number', 'cache', 'TTL de cache en ms (5 min)'),

-- Providers
('providers.blockonomics_timeout', '10000', 'number', 'providers', 'Timeout Blockonomics en ms'),
('providers.address_cleanup_ttl', '86400000', 'number', 'providers', 'Cleanup addresses en ms (24h)');
```

---

## 4. Repository

```typescript
// src/repositories/config.repository.ts
interface IConfigRepository {
  findByKey(key: string): Promise<AppConfig | null>;
  findByCategory(category: string): Promise<AppConfig[]>;
  findAll(): Promise<AppConfig[]>;

  upsert(config: Partial<AppConfig>): Promise<AppConfig>;
  upsertMany(configs: Partial<AppConfig>[]): Promise<AppConfig[]>;

  delete(key: string): Promise<boolean>;
}
```

---

## 5. Cache con Redis

Para evitar lectura excesiva a PostgreSQL, usar Redis:

```typescript
// Lectura: Redis → DB → default
async get(key: string, defaultValue?: string): Promise<string> {
  // 1. Check Redis
  const cached = await this.redis.get(`config:${key}`);
  if (cached) return cached;

  // 2. Check DB
  const config = await this.repository.findByKey(key);
  if (config) {
    await this.redis.setex(`config:${key}`, 300, config.config_value); // 5 min
    return config.config_value;
  }

  // 3. Fallback to .env
  const envKey = key.toUpperCase().replace(/\./g, '_');
  if (process.env[envKey]) return process.env[envKey];

  // 4. Default
  return defaultValue;
}
```

**TTL de cache**: 5 minutos (300 segundos)

---

## 6. Inyección de Dependencias

El servicio se registra en el Container existente:

```typescript
// src/services/container.ts
Container.register({
  token: 'ConfigService',
  use: ConfigService,
});
```

** Scoped a la request**: Para que cada request tenga su propia instancia si es necesario.

---

## 7. API Endpoints

### GET /admin/config

Listar configuración (solo admin).

```typescript
// GET /admin/config?category=ai
{ configs: [
  { key: "ai.embedding_dimensions", value: 1536, type: "number", category: "ai" },
  ...
]}
```

### GET /admin/config/:key

Obtener un valor específico.

```typescript
// GET /admin/config/ai.embedding_dimensions
{ key: "ai.embedding_dimensions", value: 1536 }
```

### PUT /admin/config/:key

Actualizar un valor (solo admin).

```typescript
// PUT /admin/config/ai.embedding_dimensions
// Body: { value: "2048", type: "number" }
{ success: true }
```

### POST /admin/config/batch

Actualizar múltiples valores.

```typescript
// POST /admin/config/batch
// Body: { configs: [{ key: "ai.embedding_dimensions", value: "2048" }] }
{ success: true, updated: 1 }
```

---

## 8. Errores

| Código | Mensaje | Causa |
|--------|--------|-------|
| 400 | Invalid config type | Tipo no válido |
| 404 | Config not found | Key no existe |
| 403 | Forbidden | No es admin |
| 500 | Internal error | Error de DB |

---

## 9. Tests

### Unit Tests

```typescript
describe('ConfigService', () => {
  it('should return value from DB', async () => {
    const value = await config.getNumber('retry.payout_delay');
    expect(value).toBe(2000);
  });

  it('should fallback to default', async () => {
    const value = await config.getNumber('unknown.key', 100);
    expect(value).toBe(100);
  });

  it('should parse JSON', async () => {
    const value = await config.getJSON('some.json.key');
    expect(value).toEqual({ foo: 'bar' });
  });
});
```

### Integration Tests

```typescript
describe('ConfigService Integration', () => {
  it('should use Redis cache', async () => {
    // First call hits DB
    await config.getNumber('retry.payout_delay');
    // Second call should hit cache
    const value = await config.getNumber('retry.payout_delay');
    expect(mockRedis.get).toHaveBeenCalled();
  });
});
```

---

## 10. Migration Plan

### Fase 1: Setup (Día 1)

- [ ] Crear tabla `app_config` en DB
- [ ] Insertar seed data
- [ ] Crear `ConfigRepository`
- [ ] Crear `ConfigService` básico

### Fase 2: Migración (Día 2)

- [ ] Agregar Redis caching
- [ ] Registrar en Container
- [ ] Crear endpoints admin
- [ ] Tests unitarios

### Fase 3: Integración (Día 3-4)

- [ ] Migrar 2-3 servicios (ej: PayoutService, ReleaseService)
- [ ] Tests de integración
- [ ] Validar backward compatibility

### Fase 4: Cleanup (Día 5)

- [ ] Migrar resto de valores
- [ ] Documentación
- [ ] Deploy a staging

---

## 11. Interfaces TypeScript

```typescript
// Entidad de base de datos
interface AppConfig {
  id: string;
  configKey: string;
  configValue: string;
  configType: ConfigType;
  category: ConfigCategory;
  description?: string;
  isPublic: boolean;
  isEncrypted: boolean;
  updatedAt: Date;
}

// Request/Response Types
interface GetConfigResponse {
  key: string;
  value: string | number | boolean | object;
  type: ConfigType;
  category: ConfigCategory;
}

interface SetConfigRequest {
  value: string;
  type?: ConfigType;
  description?: string;
}

interface ListConfigQuery {
  category?: ConfigCategory;
}

interface ListConfigResponse {
  configs: GetConfigResponse[];
}
```

---

## 12. Validaciones

| Campo | Regla |
|-------|-------|
| config_key | `[a-z0-9.]+`, max 100 chars, unique |
| config_value | max 1000 chars |
| category | allowlist de categorías |
| is_encrypted | Solo para passwords/secrets |

---

**Siguiente paso**: Design → Tasks → Apply