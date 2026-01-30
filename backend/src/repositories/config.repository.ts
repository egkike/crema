import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const configRepository = {
  /**
   * Obtiene todas las configuraciones y las transforma en objeto clave-valor.
   * Si la DB falla, lanza el error para que el Service lo maneje.
   */
  async getAllConfigs(): Promise<Record<string, number>> {
    const query = `SELECT key, value FROM "${schema}".platform_configs`;

    try {
      const { rows } = await pool.query(query);

      // Si la tabla está vacía, es un error de configuración del sistema
      if (rows.length === 0) {
        logger.error('La tabla platform_configs está vacía');
        throw new Error('Configuraciones de plataforma no encontradas');
      }

      return rows.reduce(
        (acc, row) => {
          acc[row.key] = parseFloat(row.value);
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'DB Error: getAllConfigs failed');
      throw error; // Lanzamos el error para que CommissionService use AppError
    }
  },

  /**
   * Actualiza un valor de configuración.
   */
  async updateConfig(key: string, value: number) {
    const query = `
      UPDATE "${schema}".platform_configs 
      SET value = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE key = $2 
      RETURNING *;
    `;

    try {
      const { rows } = await pool.query(query, [value, key]);
      return rows[0] || null;
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'DB Error: updateConfig failed');
      throw error;
    }
  },
};
