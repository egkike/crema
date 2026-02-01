import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const configRepository = {
  /**
   * Obtiene configuraciones numéricas filtradas por moneda.
   * Si no encuentra para la moneda específica, intenta buscar una por defecto (ej. 'USD' o 'ARS').
   */
  async getConfigsByCurrency(currency: string = 'ARS'): Promise<Record<string, number>> {
    const query = `
      SELECT key, value 
      FROM "${schema}".platform_configs 
      WHERE currency = $1
    `;

    try {
      let { rows } = await pool.query(query, [currency]);

      // Fallback: Si no hay config para la moneda, intentamos con la moneda base del sistema
      if (rows.length === 0 && currency !== 'ARS') {
        logger.warn(
          { currency },
          'Configuración no encontrada. Reintentando con moneda base (ARS)'
        );
        const fallbackRes = await pool.query(query, ['ARS']);
        rows = fallbackRes.rows;
      }

      if (rows.length === 0) {
        throw new Error(`Configuración crítica no encontrada para moneda: ${currency}`);
      }

      return rows.reduce(
        (acc, row) => {
          acc[row.key] = Number(row.value);
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error: any) {
      logger.error({ error: error.message, currency }, 'DB Error: getConfigsByCurrency failed');
      throw error;
    }
  },

  /**
   * Actualiza o inserta una configuración de plataforma (Upsert)
   */
  async upsertPlatformConfig(key: string, currency: string, value: number, description?: string) {
    const query = `
      INSERT INTO "${schema}".platform_configs (key, currency, value, description, updated_at)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (key, currency) 
      DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const { rows } = await pool.query(query, [key, currency, value, description || null]);
    return rows[0];
  },

  /**
   * Obtiene configuraciones de texto (Globales)
   */
  async getSystemSettings(): Promise<Record<string, string>> {
    const query = `SELECT key, value FROM "${schema}".system_settings`;
    try {
      const { rows } = await pool.query(query);
      return rows.reduce(
        (acc, row) => {
          acc[row.key] = row.value;
          return acc;
        },
        {} as Record<string, string>
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getSystemSettings failed');
      throw error;
    }
  },

  /**
   * Obtiene un setting específico con fallback
   */
  async getSetting(key: string, defaultValue: string = ''): Promise<string> {
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value ?? defaultValue;
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'Error fetching setting');
      return defaultValue;
    }
  },
};
