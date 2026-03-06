import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

export interface Gateway {
  id: string;
  name: string;
  liquidity_delay_days: number;
  is_active: boolean;
}

export const gatewayRepository = {
  /**
   * Obtiene los días de liquidez/retención de una pasarela específica.
   * Si no existe o hay error, devuelve 0 por seguridad (liberación inmediata).
   */
  async getLiquidityDays(gatewayId: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT liquidity_delay_days 
      FROM "${schema}".payment_gateways 
      WHERE id = $1
    `;

    try {
      const { rows } = await pool.query(query, [gatewayId]);

      if (rows.length === 0) {
        logger.warn({ gatewayId }, '⚠️ Pasarela no encontrada, asumiendo 0 días de liquidez');
        return 0;
      }

      return rows[0].liquidity_delay_days || 0;
    } catch (error: any) {
      logger.error({ error: error.message, gatewayId }, 'DB Error: getLiquidityDays failed');
      return 0;
    }
  },

  /**
   * Obtiene la información completa de una pasarela
   */
  async getById(id: string): Promise<Gateway | null> {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".payment_gateways WHERE id = $1`;

    try {
      const { rows } = await pool.query(query, [id]);
      return rows[0] || null;
    } catch (error: any) {
      logger.error({ error: error.message, id }, 'DB Error: gatewayRepository.getById failed');
      throw error;
    }
  },
};
