import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const configRepository = {
  /**
   * Obtiene configuraciones numéricas filtradas por moneda.
   * Si no se especifica moneda, por defecto busca 'ARS'.
   */
  async getConfigsByCurrency(currency: string = 'ARS'): Promise<Record<string, number>> {
    // Buscamos específicamente las reglas para la moneda de la transacción
    const query = `
      SELECT key, value 
      FROM "${schema}".platform_configs 
      WHERE currency = $1
    `;

    try {
      const { rows } = await pool.query(query, [currency]);

      if (rows.length === 0) {
        logger.warn(
          { currency },
          'No se encontraron configuraciones para esta moneda en platform_configs'
        );
        // Opcional: Podrías lanzar error o devolver un objeto con valores por defecto seguros
        return {};
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
   * Mantenemos getAllConfigs pero ahora es un "fetch all" real
   * por si necesitas una vista administrativa de todas las monedas.
   */
  async getAllConfigsRaw(): Promise<any[]> {
    const query = `SELECT * FROM "${schema}".platform_configs ORDER BY currency, key`;
    const { rows } = await pool.query(query);
    return rows;
  },

  /**
   * Obtiene configuraciones de texto (Globales, no dependen de la moneda de venta)
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

  async getSetting(key: string, defaultValue: string = 'ARS'): Promise<string> {
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value || defaultValue;
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'Error fetching setting, using default');
      return defaultValue;
    }
  },
};
