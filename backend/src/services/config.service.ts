/**
 * ConfigService for centralized configuration management
 * Supports reading from app_config (DB), .env fallback, and defaults
 * Part of SDD: docs/project/architecture-improvements/sdd/config-service/
 */

import Redis from 'ioredis';

import { configRepository } from '../repositories/app-config.repository';
import { config } from '../config';
import logger from '../utils/logger';
import type { AppConfig } from '../types/entities';

export type ConfigType = 'string' | 'number' | 'boolean' | 'json';
export type ConfigCategory = 'ai' | 'retry' | 'admin' | 'commission' | 'cache' | 'providers' | 'features' | 'support';

// Allowlist de claves válidas para seguridad (Fase 4: Migración)
export const ALLOWED_CONFIG_KEYS = [
  // Existing keys
  'ai.embedding_dimensions',
  'ai.default_model',
  'ai.max_tokens',
  'retry.payout_delay',
  'retry.release_delay',
  'retry.max_attempts',
  'commission.min_creator_margin',
  'commission.max_affiliate_rate',
  'cache.ttl_seconds',
  'features.early_access',
  // T-071: TranscriptionService
  'ai.whisper_model',
  'ai.default_transcription_lang',
  'ai.audio_bitrate',
  // T-072: LLMService
  'ai.simulator_delay',
  // T-080: ProductService
  'commission.default_margin',
  // T-081: AdminRepository
  'pagination.admin_limit',
  // T-082: BlockonomicsProvider
  'providers.blockonomics_timeout',
  'providers.address_cleanup_ttl',
  // T-101: Orchestrator config keys
  'orchestrator.default_timeout',
  'orchestrator.max_retries',
  'orchestrator.cache_ttl',
  // T-103: Error Handling notifications
  'error_notification.slack_webhook',
  'error_notification.slack_channel',
  'error_notification.datadog_api_key',
  'error_notification.datadog_site',
  'error_notification.enabled',
  'error_notification.severity_threshold',
  'error_notification.max_per_minute',
  'error_notification.notify_db_errors',
  'error_notification.notify_timeout_errors',
  'error_notification.notify_unhandled',
  // T-1XX: Concierge Support
  'support.enabled',
  'support.timeout_ms',
  'support.max_retries',
  'support.system_prompt',
  'support.model',
  'support.temperature',
  'support.max_tokens',
  // AI Affiliate Chat
  'affiliate_chat.rate_limit',
  // Description Generator
  'description_generator.temperature',
  'description_generator.max_tokens',
  'description_generator.model',
];

// Redis client for cache - lazy initialization
let redisCache: Redis | null = null;

function getRedisCache(): Redis {
  if (!redisCache) {
    redisCache = new Redis({
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
      password: config.redis?.password,
      lazyConnect: true,
      keyPrefix: 'crema:config:',
    });
  }
  return redisCache;
}

const CACHE_TTL_SECONDS = 300; // 5 minutes

/**
 * Validar que la key está en el allowlist
 */
function isValidConfigKey(key: string): boolean {
  return ALLOWED_CONFIG_KEYS.includes(key);
}

/**
 * Get config with fallback priority: redis cache → DB → .env → default
 */
async function getConfigValue(key: string, defaultValue?: string): Promise<string | undefined> {
  // Validate key against allowlist
  if (!isValidConfigKey(key)) {
    logger.warn({ key }, 'ConfigService: invalid key, not in allowlist');
    return defaultValue;
  }

  const cacheKey = key; // Use key directly (Redis adds prefix)

  // 1. Check Redis cache
  try {
    const redis = getRedisCache();
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug({ key, from: 'redis' }, 'ConfigService: cache hit');
      return cached;
    }
  } catch (error) {
    logger.warn({ key, error: error instanceof Error ? error.message : String(error) }, 'ConfigService: redis get failed, falling back');
  }

  // 2. Check DB (app_config)
  const dbConfig = await configRepository.findByKey(key);
  if (dbConfig) {
    // Set cache in Redis
    try {
      const redis = getRedisCache();
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, dbConfig.configValue);
    } catch (error) {
      logger.warn({ key, error: error instanceof Error ? error.message : String(error) }, 'ConfigService: redis set failed');
    }
    logger.debug({ key, from: 'db' }, 'ConfigService: db hit');
    return dbConfig.configValue;
  }

  // 3. Fallback to .env
  const envKey = key.toUpperCase().replace(/\./g, '_');
  if (process.env[envKey] !== undefined) {
    logger.debug({ key, from: '.env' }, 'ConfigService: fallback to .env');
    return process.env[envKey];
  }

  // 4. Use default
  if (defaultValue !== undefined) {
    logger.debug({ key, defaultValue }, 'ConfigService: using default');
    return defaultValue;
  }

  logger.warn({ key }, 'ConfigService: key not found');
  return undefined;
}

/**
 * ConfigService - Centralized configuration access
 */
export const configService = {
  /**
   * Get a string config value
   */
  async get(key: string, defaultValue?: string): Promise<string | undefined> {
    const value = await getConfigValue(key, defaultValue);
    return value ?? defaultValue;
  },

  /**
   * Get a number config value
   */
  async getNumber(key: string, defaultValue?: number): Promise<number> {
    const value = await getConfigValue(key);
    if (value === undefined) return defaultValue ?? 0;
    
    const parsed = Number(value);
    if (isNaN(parsed)) {
      logger.warn({ key, value, defaultValue }, 'ConfigService: invalid number, using default');
      return defaultValue ?? 0;
    }
    return parsed;
  },

  /**
   * Get a boolean config value
   */
  async getBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    const value = await getConfigValue(key);
    if (value === undefined) return defaultValue ?? false;
    return value.toLowerCase() === 'true';
  },

  /**
   * Get a JSON config value
   */
  async getJSON<T = Record<string, unknown>>(key: string, defaultValue?: T): Promise<T> {
    const value = await getConfigValue(key);
    if (value === undefined) return defaultValue as T;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      logger.warn({ key, value }, 'ConfigService: invalid JSON, using default');
      return defaultValue as T;
    }
  },

  /**
   * Set a config value (for admin use)
   */
  async set(
    key: string, 
    value: string, 
    type: ConfigType = 'string',
    category?: ConfigCategory
  ): Promise<void> {
    // Validate key against allowlist
    if (!isValidConfigKey(key)) {
      throw new Error(`Invalid config key: ${key}. Key must be in allowlist.`);
    }

    // Validate category extraction
    const keyPrefix = key.split('.')[0];
    const extractedCategory = category || (keyPrefix === 'support' ? 'support' : 'admin');
    
    await configRepository.upsert({
      configKey: key,
      configValue: value,
      configType: type,
      category: extractedCategory,
    });
    
    // Invalidate cache in Redis
    try {
      const redis = getRedisCache();
      await redis.del(key);
    } catch (error) {
      logger.warn({ key, error: error instanceof Error ? error.message : String(error) }, 'ConfigService: redis del failed');
    }
    logger.info({ key, type, category: extractedCategory }, 'ConfigService: config updated');
  },

  /**
   * Set multiple config values at once
   */
  async setMany(configs: Record<string, string>): Promise<void> {
    const entries = Object.entries(configs);
    if (entries.length === 0) return;

    // Validate all keys first
    for (const [key] of entries) {
      if (!isValidConfigKey(key)) {
        throw new Error(`Invalid config key: ${key}. All keys must be in allowlist.`);
      }
    }

    // Set all in sequence
    for (const [key, value] of entries) {
      await this.set(key, value);
    }
  },

  /**
   * Get all configs, optionally filtered by category
   */
  async getAll(category?: ConfigCategory): Promise<AppConfig[]> {
    if (category) {
      return configRepository.findByCategory(category);
    }
    return configRepository.findAll();
  },

  /**
   * Get a specific config by key
   */
  async getByKey(key: string): Promise<AppConfig | null> {
    return configRepository.findByKey(key);
  },

  /**
   * Initialize Redis cache connection
   */
  async initCache(): Promise<void> {
    try {
      const redis = getRedisCache();
      await redis.connect();
      logger.info('ConfigService: Redis cache connected');
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : String(error) }, 'ConfigService: Redis connection failed, using DB fallback');
    }
  },

  /**
   * Close Redis cache connection
   */
  async closeCache(): Promise<void> {
    if (redisCache) {
      await redisCache.quit();
      redisCache = null;
      logger.info('ConfigService: Redis cache disconnected');
    }
  },
};