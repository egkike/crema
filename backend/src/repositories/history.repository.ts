import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

const schema = config.db.schema;

// Definimos una interfaz para el registro histórico
export interface BalanceHistoryRecord {
  id: string;
  user_id: string;
  order_id: string;
  amount: number;
  currency: string;
  type: 'sale_creator' | 'sale_affiliate';
  description: string;
  created_at: Date;
}

export const historyRepository = {
  /**
   * Obtiene los últimos movimientos de un usuario incluyendo la moneda.
   * El orden es cronológico inverso para mostrar lo más reciente primero.
   */
  async getByUserId(userId: string): Promise<BalanceHistoryRecord[]> {
    const query = `
      SELECT 
        id,
        user_id,
        order_id,
        amount, 
        currency, 
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

      return rows.map(row => ({
        ...row,
        amount: Number(row.amount), // Convertimos el DECIMAL de Postgres a number
      }));
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserId history failed');
      throw error;
    }
  },

  /**
   * Crea un registro histórico dentro de una transacción.
   * Este método es llamado por el CommissionService durante el proceso de pago.
   */
  async createRecordWithClient(
    client: any,
    data: {
      userId: string;
      order_id: string; // Usamos snake_case para coincidir con el resto del sistema
      amount: number;
      currency: string;
      type: 'sale_creator' | 'sale_affiliate';
      description: string;
    }
  ) {
    const query = `
      INSERT INTO "${schema}".balance_history (user_id, order_id, amount, currency, type, description)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;

    try {
      const values = [
        data.userId,
        data.order_id,
        data.amount,
        data.currency,
        data.type,
        data.description,
      ];

      const { rows } = await client.query(query, values);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, userId: data.userId, orderId: data.order_id },
        'DB Error: createRecordWithClient history failed'
      );
      throw error;
    }
  },
};
