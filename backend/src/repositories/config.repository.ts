import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export const configRepository = {
  /**
   * Obtiene todas las configuraciones de la plataforma y las transforma
   * en un objeto clave-valor para facilitar el acceso.
   */
  async getAllConfigs(): Promise<Record<string, number>> {
    const query = `SELECT key, value FROM "${schema}".platform_configs`;

    try {
      const { rows } = await pool.query(query);

      // Transformamos el array de filas en un objeto: { fee_percent: 0.099, ... }
      return rows.reduce(
        (acc, row) => {
          acc[row.key] = parseFloat(row.value);
          return acc;
        },
        {} as Record<string, number>
      );
    } catch (error: any) {
      logger.error({ error: error.message }, 'Error al obtener configuraciones de plataforma');
      // Retornamos un objeto vacío o valores por defecto para evitar que la app explote
      return {};
    }
  },

  /**
   * Permite actualizar un valor de configuración (Útil para el futuro panel admin)
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
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, key },
        'Error al actualizar configuración de plataforma'
      );
      throw error;
    }
  },
};
