import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const configRepository = {
  /**
   * Obtiene configuraciones numéricas (porcentajes, fees, montos)
   */
  async getAllConfigs(): Promise<Record<string, number>> {
    const query = `SELECT key, value FROM "${schema}".platform_configs`;

    try {
      const { rows } = await pool.query(query);

      if (rows.length === 0) {
        logger.error('La tabla platform_configs está vacía');
        throw new Error('Configuraciones numéricas no encontradas');
      }

      return rows.reduce(
        (acc, row) => {
          acc[row.key] = Number(row.value); // Usamos Number para mayor seguridad con decimales
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getAllConfigs failed');
      throw error;
    }
  },

  /**
   * Obtiene configuraciones de texto (Moneda, Email Soporte, etc.)
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
   * Obtiene un valor específico de texto (ej. la moneda actual)
   */
  async getSetting(key: string, defaultValue: string = 'ARS'): Promise<string> {
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value || defaultValue;
    } catch (error: any) {
      // Usamos la variable 'error' para el log, y así el Linter queda feliz
      logger.error({ error: error.message, key }, 'Error fetching setting, using default');
      return defaultValue;
    }
  },
};
