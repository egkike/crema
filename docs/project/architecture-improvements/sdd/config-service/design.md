# Design: ConfigService

**Cambio**: Implementar ConfigService  
**Tipo**: Arquitectura  
**SDD Phase**: Design  
**Estado**: ✅ Implementado (Abril 2026)  
**Fecha**: Abril 2026

---

## 1. Arquitectura

```
┌──────────────────────────────────────────────────────────┐
│                    REQUEST                               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   Routes → Controllers → Services → ConfigService        │
│                                   ↓                      │
│                        ┌────────────────┐                │
│                        │  Container DI  │                │
│                        └───────┬────────┘                │
│                                ↓                         │
│   ┌─────────────────────────────────────────────────┐    │
│   │             CONFIG SERVICE                      │    │
│   │  ┌────────────┐    ┌────────────────────┐       │    │
│   │  │   Redis    │ ←← │   Memory Cache     │       │    │
│   │  │   Cache    │    │   (5 min TTL)      │       │    │
│   │  └─────┬──────┘    └───────────✓────────┘       │    │
│   │        ↓                                        │    │
│   │  ┌────────────┐    ┌────────────────────┐       │    │
│   │  │  Config    │ ←← │  ConfigRepository  │       │    │
│   │  │  Service   │    │                    │       │    │
│   │  └─────┬──────┘    └───────────✓────────┘       │    │
│   │        ↓               ↓                        │    │
│   │  ┌────────────┐    ┌────────────────────┐       │    │
│   │  │   .env     │    │  PostgreSQL        │       │    │
│   │  │ (fallback) │    │  app_config        │       │    │
│   │  └────────────┘    └────────────────────┘       │    │
│   └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Diagrama de Clases

```typescript
┌────────────────────────┐       ┌────────────────────────┐
│    ConfigService       │       │   IConfigRepository    │
├────────────────────────┤       ├────────────────────────┤
│ - repository           │←←←←←← │                        │
│ - redis                │       │ - findByKey()          │
│ - logger               │       │ - findByCategory()     │
├────────────────────────┤       │ - upsert()             │
│ + get()                │       │ - delete()             │
│ + getNumber()          │       └────────────────────────┘
│ + getBoolean()         │               ↑              
│ + getJSON()            │               │              
│ + set()                │        ┌────────────────────────┐
│ + setMany()            │        │  AppConfig (Entity)    │
│ + getAll()             │        ├────────────────────────┤
│ + getByKey()           │        │ id: string             │
└────────────────────────┘        │ configKey: string      │
                   ↑              │ configValue: string    │
                   │              │ configType: string     │
         ┌────────────────────────┤ category: string       │
         │    Container           │ description: string    │
         │    (DI)                │ isPublic: boolean      │
         └────────────────────────┘ isEncrypted: boolean   │
                                  │ updatedAt: Date        │
```

---

## 3. Código del Service

```typescript
// src/services/config.service.ts
import { injectable, inject } from 'inversify';
import { IConfigRepository } from '../repositories/config.repository';
import { AppConfig } from '../entities/app-config.entity';
import logger from '../utils/logger';

type ConfigType = 'string' | 'number' | 'boolean' | 'json';
type ConfigCategory = 'ai' | 'retry' | 'admin' | 'commission' | 'cache' | 'providers' | 'features';

const CACHE_TTL = 300; // 5 minutes

@injectable()
export class ConfigService {
  constructor(
    @inject('ConfigRepository') private repository: IConfigRepository,
    @inject('RedisService') private redis: RedisService,
    @inject('Logger') private logger: typeof logger
  ) {}

  async get(key: string, defaultValue?: string): Promise<string> {
    return this.getValue(key, defaultValue);
  }

  async getNumber(key: string, defaultValue?: number): Promise<number> {
    const value = await this.getValue(key);
    const parsed = Number(value);
    if (isNaN(parsed)) {
      this.logger.warn({ key, value, defaultValue }, 'Config: invalid number, using default');
      return defaultValue ?? 0;
    }
    return parsed;
  }

  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    const value = await this.getValue(key);
    if (value === undefined) return defaultValue ?? false;
    return value.toLowerCase() === 'true';
  }

  async getJSON<T = unknown>(key: string, defaultValue?: T): Promise<T> {
    const value = await this.getValue(key);
    if (!value) return defaultValue!;
    try {
      return JSON.parse(value) as T;
    } catch (e) {
      this.logger.warn({ key, value }, 'Config: invalid JSON, using default');
      return defaultValue!;
    }
  }

  async set(key: string, value: string, type: ConfigType = 'string'): Promise<void> {
    await this.repository.upsert({
      configKey: key,
      configValue: value,
      configType: type,
      category: this.extractCategory(key),
    });
    await this.invalidateCache(key);
    this.logger.info({ key, type }, 'Config: updated');
  }

  async setMany(configs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(configs)) {
      await this.set(key, value);
    }
  }

  async getAll(category?: ConfigCategory): Promise<AppConfig[]> {
    if (category) {
      return this.repository.findByCategory(category);
    }
    return this.repository.findAll();
  }

  async getByKey(key: string): Promise<AppConfig | null> {
    return this.repository.findByKey(key);
  }

  // Private methods
  private async getValue(key: string, defaultValue?: string): Promise<string | undefined> {
    const cacheKey = `config:${key}`;

    // 1. Check Redis cache
    const cached = await this.redis.get(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // 2. Check DB
    const config = await this.repository.findByKey(key);
    if (config) {
      await this.redis.setex(cacheKey, CACHE_TTL, config.configValue);
      return config.configValue;
    }

    // 3. Fallback to .env (backward compatibility)
    const envKey = key.toUpperCase().replace(/\./g, '_');
    if (process.env[envKey] !== undefined) {
      this.logger.debug({ key, from: '.env' }, 'Config: fallback to .env');
      return process.env[envKey];
    }

    // 4. Use default
    if (defaultValue !== undefined) {
      this.logger.debug({ key, defaultValue }, 'Config: using default');
      return defaultValue;
    }

    this.logger.warn({ key }, 'Config: key not found');
    return undefined;
  }

  private async invalidateCache(key: string): Promise<void> {
    await this.redis.del(`config:${key}`);
  }

  private extractCategory(key: string): ConfigCategory {
    const prefix = key.split('.')[0];
    const validCategories: ConfigCategory[] = ['ai', 'retry', 'admin', 'commission', 'cache', 'providers', 'features'];
    return validCategories.includes(prefix) ? prefix : 'ai';
  }
}
```

---

## 4. Código del Repository

```typescript
// src/repositories/config.repository.ts
import { Pool } from 'pg';
import { AppConfig } from '../entities/app-config.entity';
import { injectable } from 'inversify';

export interface IConfigRepository {
  findByKey(key: string): Promise<AppConfig | null>;
  findByCategory(category: string): Promise<AppConfig[]>;
  findAll(): Promise<AppConfig[]>;
  upsert(config: Partial<AppConfig>): Promise<AppConfig>;
  delete(key: string): Promise<boolean>;
}

@injectable()
export class ConfigRepository implements IConfigRepository {
  constructor(private pool: Pool) {}

  async findByKey(key: string): Promise<AppConfig | null> {
    const result = await this.pool.query<AppConfig>(
      'SELECT * FROM app_config WHERE config_key = $1',
      [key]
    );
    return result.rows[0] || null;
  }

  async findByCategory(category: string): Promise<AppConfig[]> {
    const result = await this.pool.query<AppConfig>(
      'SELECT * FROM app_config WHERE category = $1 ORDER BY config_key',
      [category]
    );
    return result.rows;
  }

  async findAll(): Promise<AppConfig[]> {
    const result = await this.pool.query<AppConfig>(
      'SELECT * FROM app_config ORDER BY category, config_key'
    );
    return result.rows;
  }

  async upsert(config: Partial<AppConfig>): Promise<AppConfig> {
    const result = await this.pool.query<AppConfig>(
      `INSERT INTO app_config (config_key, config_value, config_type, category, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (config_key) DO UPDATE SET
         config_value = EXCLUDED.config_value,
         config_type = EXCLUDED.config_type,
         updated_at = NOW()
       RETURNING *`,
      [config.configKey, config.configValue, config.configType, config.category, config.description]
    );
    return result.rows[0];
  }

  async delete(key: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM app_config WHERE config_key = $1',
      [key]
    );
    return result.rowCount > 0;
  }
}
```

---

## 5. Migración de Servicios

### Ejemplo: PayoutService

```typescript
// src/services/payout.service.ts (antes)
export class PayoutService {
  private readonly BACKOFF_DELAY = 2000; // hardcoded

  async retry(orderId: string) {
    await this.scheduleRetry(orderId, this.BACKOFF_DELAY);
  }
}

// src/services/payout.service.ts (después)
export class PayoutService {
  constructor(
    @inject('ConfigService') private config: ConfigService
  ) {}

  async retry(orderId: string) {
    const delay = await this.config.getNumber('retry.payout_delay', 2000);
    await this.scheduleRetry(orderId, delay);
  }
}
```

---

## 6. Inicialización en Container

```typescript
// src/services/container.ts
import { Container } from 'inversify';
import { ConfigService } from './services/config.service';
import { ConfigRepository } from './repositories/config.repository';
import { Pool } from 'pg';

// Register services
Container.bind('ConfigRepository')
  .to(ConfigRepository)
  .inRequestScope();

Container.bind('ConfigService')
  .to(ConfigService)
  .inRequestScope();
```

---

## 7. Rutas de Admin

```typescript
// src/routes/admin.config.routes.ts
import { Router, Request, Response } from 'express';
import { Container } from 'inversify';
import { ConfigService } from '../services/config.service';

const router = Router();
const config = Container.get(ConfigService);

// GET /admin/config?category=ai
router.get('/', async (req: Request, res: Response) => {
  const { category } = req.query;
  const configs = await config.getAll(category as string);
  res.json({ configs });
});

// GET /admin/config/:key
router.get('/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  const cfg = await config.getByKey(key);
  if (!cfg) {
    return res.status(404).json({ error: 'Config not found' });
  }
  res.json(cfg);
});

// PUT /admin/config/:key
router.put('/:key', async (req: Request, res: Response) => {
  const { key } = req.params;
  const { value, type = 'string' } = req.body;
  await config.set(key, value, type);
  res.json({ success: true });
});

export default router;
```

---

## 8. Tablas de DB

```sql
-- app_config
CREATE TABLE IF NOT EXISTS app_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    config_type VARCHAR(20) DEFAULT 'string',
    category VARCHAR(20) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    is_encrypted BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT app_config_key_check CHECK (config_key ~ '^[a-z0-9.]+$'),
    CONSTRAINT app_config_type_check CHECK (config_type IN ('string', 'number', 'boolean', 'json')),
    CONSTRAINT app_config_category_check CHECK (category IN ('ai', 'retry', 'admin', 'commission', 'cache', 'providers', 'features'))
);

CREATE INDEX idx_app_config_category ON app_config(category);
CREATE INDEX idx_app_config_key ON app_config(config_key);
```

---

## 9. Tests

### Unit Test

```typescript
// src/__tests__/services/config.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '../../services/config.service';

describe('ConfigService', () => {
  let service: ConfigService;
  const mockRepo = { findByKey: vi.fn() };
  const mockRedis = { get: vi.fn(), setex: vi.fn(), del: vi.fn() };
  const mockLogger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() };

  beforeEach(() => {
    service = new ConfigService(mockRepo, mockRedis, mockLogger);
  });

  describe('getNumber', () => {
    it('should return number from DB', async () => {
      mockRepo.findByKey.mockResolvedValue({ configKey: 'retry.payout_delay', configValue: '2000' });

      const value = await service.getNumber('retry.payout_delay');

      expect(value).toBe(2000);
    });

    it('should fallback to default', async () => {
      mockRepo.findByKey.mockResolvedValue(null);

      const value = await service.getNumber('unknown.key', 100);

      expect(value).toBe(100);
    });
  });
});
```

---

## 10. Checklist de Implementación

| Task | Estado | Prioridad |
|------|--------|----------|
| Crear tabla app_config en DB | TODO | P0 |
| Agregar seed data | TODO | P0 |
| Crear ConfigRepository | TODO | P0 |
| Crear ConfigService | TODO | P0 |
| Agregar Redis caching | TODO | P1 |
| Registrar en Container | TODO | P0 |
| Crear routes admin | TODO | P1 |
| Migrar PayoutService | TODO | P2 |
| Migrar ReleaseService | TODO | P2 |
| Migrar resto de servicios | TODO | P2 |
| Tests unitarios | TODO | P1 |
| Deploy a staging | TODO | P1 |

---

**Siguiente paso**: Tasks → Apply