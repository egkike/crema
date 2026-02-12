import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export const systemRepository = {
  /**
   * Obtiene un valor de configuración desde system_settings con fallback.
   */
  async getSetting(key: string, defaultValue: string): Promise<string> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value || defaultValue;
    } catch (error: any) {
      logger.error({ key, error: error.message }, 'Error obteniendo system_setting');
      return defaultValue;
    }
  },

  /**
   * Resuelve la cantidad de días de garantía aplicables a un producto.
   * Prioridad: 1. Producto específico -> 2. Global (DB) -> 3. Fallback (Config/7)
   */
  async resolveGuaranteeDays(productId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const productQuery = `SELECT guarantee_days FROM "${schema}".products WHERE id = $1`;

    try {
      // 1. Intentamos obtener la garantía específica del producto
      const { rows: productRows } = await pool.query(productQuery, [productId]);

      if (productRows.length > 0 && productRows[0].guarantee_days !== null) {
        return parseInt(productRows[0].guarantee_days, 10);
      }

      // 2. Si no tiene, buscamos el valor global en system_settings
      const globalDays = await this.getSetting(
        'days_of_guarantee',
        config.daysOfGuarantee.toString()
      );
      return parseInt(globalDays, 10);
    } catch (error: any) {
      logger.error({ productId, error: error.message }, 'Error resolviendo días de garantía');
      return config.daysOfGuarantee || 7; // Fallback definitivo
    }
  },
};
