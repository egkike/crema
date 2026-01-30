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
   * Suma ganancias al balance específico de una moneda.
   */
  async addEarnings(userId: string, amount: number, client?: any, currency: string = 'ARS') {
    const query = `
      INSERT INTO "${schema}".user_balances (user_id, total_earned, pending_balance, currency)
      VALUES ($1, $2, $2, $3)
      ON CONFLICT (user_id, currency) 
      DO UPDATE SET
        total_earned = user_balances.total_earned + EXCLUDED.total_earned,
        pending_balance = user_balances.pending_balance + EXCLUDED.pending_balance,
        updated_at = CURRENT_TIMESTAMP;
    `;

    try {
      const db = client || pool;
      return await db.query(query, [userId, amount, currency]);
    } catch (error: any) {
      logger.error(
        { error: error.message, userId, amount, currency },
        'DB Error: addEarnings failed'
      );
      throw error;
    }
  },

  /**
   * ✅ NUEVO: Resta saldo disponible al solicitar un retiro.
   * Se ejecuta dentro de una transacción de Payout.
   */
  async subtractAvailableBalance(userId: string, amount: number, currency: string, client: any) {
    const query = `
      UPDATE "${schema}".user_balances 
      SET available_balance = available_balance - $1, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $2 AND currency = $3
      RETURNING *;
    `;

    try {
      // Usamos obligatoriamente el client de la transacción
      const { rows } = await client.query(query, [amount, userId, currency]);

      if (rows.length === 0) {
        throw new Error('No se encontró el balance para actualizar');
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
   * Obtiene el balance de un usuario para una moneda específica.
   */
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

  /**
   * Obtiene todos los balances de un usuario.
   */
  async getAllBalancesByUserId(userId: string): Promise<UserBalance[]> {
    const query = `
      SELECT total_earned, available_balance, pending_balance, currency, updated_at
      FROM "${schema}".user_balances 
      WHERE user_id = $1;
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
