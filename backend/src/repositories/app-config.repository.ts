/**
 * ConfigRepository for app_config table
 * Part of ConfigService - stores centralized configuration in database
 */

import pool from '../db/postgres';
import logger from '../utils/logger';
import type { AppConfig } from '../types/entities';

export interface IConfigRepository {
  findByKey(key: string): Promise<AppConfig | null>;
  findByCategory(category: string): Promise<AppConfig[]>;
  findAll(): Promise<AppConfig[]>;
  upsert(config: Partial<AppConfig>): Promise<AppConfig>;
  delete(key: string): Promise<boolean>;
}

export const configRepository: IConfigRepository = {
  /**
   * Find a config by key
   */
  async findByKey(key: string): Promise<AppConfig | null> {
    const query = `
      SELECT id, config_key, config_value, config_type, category, description, is_public, is_encrypted, updated_at
      FROM app_config
      WHERE config_key = $1
    `;
    try {
      const { rows } = await pool.query(query, [key]);
      if (rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        id: row.id,
        configKey: row.config_key,
        configValue: row.config_value,
        configType: row.config_type,
        category: row.category,
        description: row.description,
        isPublic: row.is_public,
        isEncrypted: row.is_encrypted,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, key }, 'ConfigRepository: findByKey failed');
      throw error;
    }
  },

  /**
   * Find all configs by category
   */
  async findByCategory(category: string): Promise<AppConfig[]> {
    const query = `
      SELECT id, config_key, config_value, config_type, category, description, is_public, is_encrypted, updated_at
      FROM app_config
      WHERE category = $1
      ORDER BY config_key
    `;
    try {
      const { rows } = await pool.query(query, [category]);
      return rows.map((row) => ({
        id: row.id,
        configKey: row.config_key,
        configValue: row.config_value,
        configType: row.config_type,
        category: row.category,
        description: row.description,
        isPublic: row.is_public,
        isEncrypted: row.is_encrypted,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, category }, 'ConfigRepository: findByCategory failed');
      throw error;
    }
  },

  /**
   * Find all configs
   */
  async findAll(): Promise<AppConfig[]> {
    const query = `
      SELECT id, config_key, config_value, config_type, category, description, is_public, is_encrypted, updated_at
      FROM app_config
      ORDER BY category, config_key
    `;
    try {
      const { rows } = await pool.query(query);
      return rows.map((row) => ({
        id: row.id,
        configKey: row.config_key,
        configValue: row.config_value,
        configType: row.config_type,
        category: row.category,
        description: row.description,
        isPublic: row.is_public,
        isEncrypted: row.is_encrypted,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'ConfigRepository: findAll failed');
      throw error;
    }
  },

  /**
   * Insert or update a config (upsert)
   */
  async upsert(config: Partial<AppConfig>): Promise<AppConfig> {
    const query = `
      INSERT INTO app_config (config_key, config_value, config_type, category, description, is_public, is_encrypted)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (config_key) DO UPDATE SET
        config_value = EXCLUDED.config_value,
        config_type = EXCLUDED.config_type,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        is_public = EXCLUDED.is_public,
        is_encrypted = EXCLUDED.is_encrypted,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, config_key, config_value, config_type, category, description, is_public, is_encrypted, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [
        config.configKey,
        config.configValue,
        config.configType || 'string',
        config.category,
        config.description || null,
        config.isPublic || false,
        config.isEncrypted || false,
      ]);
      const row = rows[0];
      return {
        id: row.id,
        configKey: row.config_key,
        configValue: row.config_value,
        configType: row.config_type,
        category: row.category,
        description: row.description,
        isPublic: row.is_public,
        isEncrypted: row.is_encrypted,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, config }, 'ConfigRepository: upsert failed');
      throw error;
    }
  },

  /**
   * Delete a config by key
   */
  async delete(key: string): Promise<boolean> {
    const query = `DELETE FROM app_config WHERE config_key = $1 RETURNING id`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows.length > 0;
    } catch (error) {
      logger.error({ error, key }, 'ConfigRepository: delete failed');
      throw error;
    }
  },
};