import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

const schema = config.db.schema;

export interface UserBalance {
  total_earned: number;
  available_balance: number;
  pending_balance: number;
  updated_at: Date;
}

export const balanceRepository = {
  /**
   * Suma ganancias al balance. Soporta transacciones pasando un 'client'.
   */
  async addEarnings(userId: string, amount: number, client?: any) {
    const query = `
      INSERT INTO "${schema}".user_balances (user_id, total_earned, pending_balance)
      VALUES ($1, $2, $2)
      ON CONFLICT (user_id) DO UPDATE SET
        total_earned = user_balances.total_earned + EXCLUDED.total_earned,
        pending_balance = user_balances.pending_balance + EXCLUDED.pending_balance,
        updated_at = CURRENT_TIMESTAMP;
    `;

    try {
      const db = client || pool; // Si hay cliente de transacción, lo usa
      return await db.query(query, [userId, amount]);
    } catch (error: any) {
      logger.error({ error: error.message, userId, amount }, 'DB Error: addEarnings failed');
      throw error;
    }
  },

  /**
   * Obtiene el balance del usuario. Si no existe, devuelve valores en cero.
   */
  async getByUserId(userId: string): Promise<UserBalance> {
    const query = `
      SELECT total_earned, available_balance, pending_balance, updated_at
      FROM "${schema}".user_balances WHERE user_id = $1;
    `;

    try {
      const { rows } = await pool.query(query, [userId]);

      if (rows.length === 0) {
        return {
          total_earned: 0,
          available_balance: 0,
          pending_balance: 0,
          updated_at: new Date(),
        };
      }

      const row = rows[0];
      return {
        total_earned: Number(row.total_earned),
        available_balance: Number(row.available_balance),
        pending_balance: Number(row.pending_balance),
        updated_at: row.updated_at,
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getByUserId failed');
      throw error;
    }
  },
};
