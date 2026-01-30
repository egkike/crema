import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

const schema = config.db.schema;

export const historyRepository = {
  /**
   * Obtiene los últimos movimientos de un usuario
   */
  async getByUserId(userId: string) {
    const query = `
      SELECT 
        id,
        amount, 
        type, 
        description, 
        created_at 
      FROM "${schema}".balance_history 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50;
    `;

    try {
      const { rows } = await pool.query(query, [userId]);

      // Convertimos el monto de string (decimal en DB) a number para el frontend
      return rows.map(row => ({
        ...row,
        amount: Number(row.amount),
      }));
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserId history failed');
      throw error;
    }
  },

  // Añadir al objeto historyRepository
  async createRecordWithClient(
    client: any,
    data: {
      userId: string;
      orderId: string;
      amount: number;
      type: 'sale_creator' | 'sale_affiliate';
      description: string;
    }
  ) {
    const query = `
    INSERT INTO "${schema}".balance_history (user_id, order_id, amount, type, description)
    VALUES ($1, $2, $3, $4, $5)
  `;
    return client.query(query, [
      data.userId,
      data.orderId,
      data.amount,
      data.type,
      data.description,
    ]);
  },
};
