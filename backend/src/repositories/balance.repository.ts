import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

const schema = config.db.schema;

export interface UserBalance {
  total_earned: number;
  available_balance: number;
  pending_balance: number;
  currency: string;
  updated_at: Date;
}

export const balanceRepository = {
  /**
   * Suma dinero al saldo PENDIENTE y al total acumulado histórico.
   * Este es el método que llama el CommissionService.
   */
  async addPendingBalance(userId: string, amount: number, currency: string, client?: any) {
    const query = `
      INSERT INTO "${schema}".user_balances (user_id, total_earned, pending_balance, currency)
      VALUES ($1, $2, $2, $3)
      ON CONFLICT (user_id, currency) 
      DO UPDATE SET
        total_earned = user_balances.total_earned + EXCLUDED.total_earned,
        pending_balance = user_balances.pending_balance + EXCLUDED.pending_balance,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    try {
      const db = client || pool;
      const { rows } = await db.query(query, [userId, amount, currency]);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, userId, amount, currency },
        'DB Error: addPendingBalance failed'
      );
      throw error;
    }
  },

  /**
   * Mueve saldo de 'pending' a 'available' (Liberación de fondos).
   */
  async releaseBalance(userId: string, amount: number, currency: string, client?: any) {
    const query = `
      UPDATE "${schema}".user_balances 
      SET pending_balance = pending_balance - $1,
          available_balance = available_balance + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND currency = $3 AND pending_balance >= $1
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [amount, userId, currency]);
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, userId, amount, currency },
        'DB Error: releaseBalance failed'
      );
      throw error;
    }
  },

  /**
   * Resta saldo disponible (Payouts).
   */
  async subtractAvailableBalance(userId: string, amount: number, currency: string, client: any) {
    const query = `
      UPDATE "${schema}".user_balances 
      SET available_balance = available_balance - $1, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $2 AND currency = $3 AND available_balance >= $1
      RETURNING *;
    `;

    try {
      const { rows } = await client.query(query, [amount, userId, currency]);
      if (rows.length === 0) {
        throw new Error('Saldo insuficiente o balance no encontrado');
      }
      return rows[0];
    } catch (error: any) {
      logger.error(
        { error: error.message, userId, amount, currency },
        'DB Error: subtractAvailableBalance failed'
      );
      throw error;
    }
  },

  /**
   * Deduce del pendiente (Refunds/Devoluciones).
   */
  async deductPendingEarnings(userId: string, amount: number, currency: string, client: any) {
    const query = `
      UPDATE "${schema}".user_balances 
      SET total_earned = total_earned - $1,
          pending_balance = pending_balance - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND currency = $3 AND pending_balance >= $1
      RETURNING *;
    `;
    try {
      const { rows } = await client.query(query, [amount, userId, currency]);
      return rows[0];
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: deductPendingEarnings failed');
      throw error;
    }
  },

  async getByUserIdAndCurrency(userId: string, currency: string = 'ARS'): Promise<UserBalance> {
    const query = `
      SELECT total_earned, available_balance, pending_balance, currency, updated_at
      FROM "${schema}".user_balances 
      WHERE user_id = $1 AND currency = $2;
    `;

    try {
      const { rows } = await pool.query(query, [userId, currency]);
      if (rows.length === 0) {
        return {
          total_earned: 0,
          available_balance: 0,
          pending_balance: 0,
          currency,
          updated_at: new Date(),
        };
      }
      const row = rows[0];
      return {
        total_earned: Number(row.total_earned),
        available_balance: Number(row.available_balance),
        pending_balance: Number(row.pending_balance),
        currency: row.currency,
        updated_at: row.updated_at,
      };
    } catch (error: any) {
      logger.error(
        { error: error.message, userId, currency },
        'DB Error: getByUserIdAndCurrency failed'
      );
      throw error;
    }
  },

  async getAllBalancesByUserId(userId: string): Promise<UserBalance[]> {
    const query = `
      SELECT total_earned, available_balance, pending_balance, currency, updated_at
      FROM "${schema}".user_balances 
      WHERE user_id = $1
      ORDER BY currency ASC;
    `;
    try {
      const { rows } = await pool.query(query, [userId]);
      return rows.map(row => ({
        total_earned: Number(row.total_earned),
        available_balance: Number(row.available_balance),
        pending_balance: Number(row.pending_balance),
        currency: row.currency,
        updated_at: row.updated_at,
      }));
    } catch (error: any) {
      logger.error({ error: error.message, userId }, 'DB Error: getAllBalancesByUserId failed');
      throw error;
    }
  },
};
