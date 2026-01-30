import pool from '../db/postgres';
import logger from '../utils/logger';
import { config } from '../config/index';

const schema = config.db.schema;

export interface CreateCommissionDTO {
  affiliate_id: string;
  order_id: string;
  amount: number;
  status?: string;
}

export const commissionRepository = {
  /**
   * Crea una comisión.
   * @param data Datos de la comisión
   * @param client Opcional: Cliente de transacción de PostgreSQL
   */
  async create(data: CreateCommissionDTO, client?: any) {
    const query = `
      INSERT INTO "${schema}".commissions (
        affiliate_id, order_id, amount, status
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [data.affiliate_id, data.order_id, data.amount, data.status || 'pending'];

    try {
      // Si recibimos un cliente (transacción), lo usamos; si no, usamos el pool
      const db = client || pool;
      const { rows } = await db.query(query, values);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, order_id: data.order_id },
        'DB Error: Create commission failed'
      );
      throw error;
    }
  },

  async getByOrderId(orderId: string) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM "${schema}".commissions WHERE order_id = $1`,
        [orderId]
      );
      return rows;
    } catch (error: any) {
      logger.error({ error: error.message, orderId }, 'DB Error: getByOrderId failed');
      throw error;
    }
  },
};
