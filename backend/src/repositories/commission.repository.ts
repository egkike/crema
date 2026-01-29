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
  async create(data: CreateCommissionDTO) {
    const query = `
      INSERT INTO "${schema}".commissions (
        affiliate_id, 
        order_id, 
        amount, 
        status
      )
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [data.affiliate_id, data.order_id, data.amount, data.status || 'pending'];

    try {
      const { rows } = await pool.query(query, values);
      return rows[0];
    } catch (error: any) {
      logger.error({ error: error.message, order_id: data.order_id }, 'Error al insertar comisión');
      throw error;
    }
  },
};
