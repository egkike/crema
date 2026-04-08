import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';
import { getErrorMessage } from '../utils/ip.util';

export const systemRepository = {
  async getSetting(key: string, defaultValue: string): Promise<string> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT value FROM "${schema}".system_settings WHERE key = $1`;
    try {
      const { rows } = await pool.query(query, [key]);
      return rows[0]?.value || defaultValue;
    } catch (error: unknown) {
      logger.error({ key, error: getErrorMessage(error) }, 'Error obteniendo system_setting');
      return defaultValue;
    }
  },

  async resolveGuaranteeDays(productId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const productQuery = `SELECT guarantee_days FROM "${schema}".products WHERE id = $1`;

    try {
      // 1. Prioridad: Garantía del producto
      const { rows: productRows } = await pool.query(productQuery, [productId]);

      if (productRows.length > 0 && productRows[0].guarantee_days !== null) {
        return Number(productRows[0].guarantee_days);
      }

      // 2. Prioridad: Configuración Global en DB
      // Si no existe la llave en la DB, el fallback es '7' (string)
      const globalDaysSetting = await this.getSetting('days_of_guarantee', '7');

      return Number(globalDaysSetting);
    } catch (error: unknown) {
      logger.error({ productId, error: getErrorMessage(error) }, 'Error resolviendo días de garantía');
      // 3. Fallback final: Si la DB falla totalmente, devolvemos 7 por defecto
      return 7;
    }
  },
};
