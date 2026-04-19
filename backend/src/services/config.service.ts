/**
 * ConfigService for centralized configuration management
 * Supports reading from app_config (DB), .env fallback, and defaults
 * Part of SDD: docs/project/architecture-improvements/sdd/config-service/
 */

import { configRepository } from '../repositories/app-config.repository';
import logger from '../utils/logger';

export type ConfigType = 'string' | 'number' | 'boolean' | 'json';
export type ConfigCategory = 'ai' | 'retry' | 'admin' | 'commission' | 'cache' | 'providers' | 'features';

// Redis cache for config values
const configCache: Map<string, { value: string; expires: number }> = new Map();
const CACHE_TTL = 300000; // 5 minutes

/**
 * Get config with fallback priority: cache → DB → .env → default
 */
async function getConfigValue(key: string, defaultValue?: string): Promise<string | undefined> {
  const now = Date.now();
  const cacheKey = `config:${key}`;

  // 1. Check memory cache
  const cached = configCache.get(cacheKey);
  if (cached && cached.expires > now) {
    logger.debug({ key, from: 'cache' }, 'ConfigService: cache hit');
    return cached.value;
  }

  // 2. Check DB (app_config)
  const dbConfig = await configRepository.findByKey(key);
  if (dbConfig) {
    configCache.set(cacheKey, { value: dbConfig.configValue, expires: now + CACHE_TTL });
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
  async get(key: string, defaultValue?: string): Promise<string> {
    const value = await getConfigValue(key, defaultValue);
    return value ?? defaultValue ?? '';
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
    const extractedCategory = category || key.split('.')[0] as ConfigCategory;
    
    await configRepository.upsert({
      configKey: key,
      configValue: value,
      configType: type,
      category: extractedCategory,
    });
    
    // Invalidate cache
    configCache.delete(`config:${key}`);
    logger.info({ key, type, category: extractedCategory }, 'ConfigService: config updated');
  },

  /**
   * Set multiple config values at once
   */
  async setMany(configs: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(configs)) {
      await this.set(key, value);
    }
  },

  /**
   * Get all configs, optionally filtered by category
   */
  async getAll(category?: ConfigCategory) {
    if (category) {
      return configRepository.findByCategory(category);
    }
    return configRepository.findAll();
  },

  /**
   * Get a specific config by key
   */
  async getByKey(key: string) {
    return configRepository.findByKey(key);
  },
};