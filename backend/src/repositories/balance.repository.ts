import type { PoolClient } from 'pg';

import pool from '../db/postgres';
import { config } from '../config/index';
import logger from '../utils/logger';

export interface UserBalance {
  total_earned: number;
  available_balance: number;
  pending_balance: number;
  currency: string;
  updated_at: Date;
}

export const balanceRepository = {
  /**
   * Suma al balance pendiente y total ganado.
   * Si no existe la fila para ese usuario/moneda, la crea (Upsert).
   */
  async addPendingBalance(userId: string, amount: number, currency: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      INSERT INTO "${schema}".user_balances (user_id, total_earned, pending_balance, currency)
      VALUES ($1, $2, $2, $3)
      ON CONFLICT (user_id, currency) 
      DO UPDATE SET
        total_earned = (user_balances.total_earned + EXCLUDED.total_earned)::numeric,
        pending_balance = (user_balances.pending_balance + EXCLUDED.pending_balance)::numeric,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

    try {
      const db = client || pool;
      const { rows } = await db.query(query, [userId, amount, currency]);
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
        { error: error.message, userId, amount, currency },
        'DB Error: addPendingBalance failed'
      );
      throw error;
    }
  },

  /**
   * Pasa dinero de pendiente a disponible (Fin de periodo de garantía).
   */
  async releaseBalance(userId: string, amount: number, currency: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".user_balances 
      SET pending_balance = (pending_balance - $1)::numeric,
          available_balance = (available_balance + $1)::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND currency = $3 AND pending_balance >= $1
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [amount, userId, currency]);
      if (rows.length === 0)
        throw new Error(`Saldo pendiente insuficiente en ${currency} para liberar`);
      const row = rows[0];
      return {
        total_earned: Number(row.total_earned),
        available_balance: Number(row.available_balance),
        pending_balance: Number(row.pending_balance),
        currency: row.currency,
        updated_at: row.updated_at,
      };
    } catch (error: any) {
      logger.error({ error: error.message, userId, currency }, 'DB Error: releaseBalance failed');
      throw error;
    }
  },

  /**
   * Deduce saldo del disponible (Payouts/Retiros).
   */
  async subtractAvailableBalance(userId: string, amount: number, currency: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".user_balances 
      SET available_balance = (available_balance - $1)::numeric, 
          updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $2 AND currency = $3 AND available_balance >= $1
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [amount, userId, currency]);
      if (rows.length === 0)
        throw new Error('Saldo disponible insuficiente o balance no encontrado');
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
        'DB Error: subtractAvailableBalance failed'
      );
      throw error;
    }
  },

  /**
   * Deduce del pendiente (Refunds/Devoluciones).
   */
  async deductPendingEarnings(userId: string, amount: number, currency: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".user_balances 
      SET total_earned = (total_earned - $1)::numeric,
          pending_balance = (pending_balance - $1)::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND currency = $3 AND pending_balance >= $1
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [amount, userId, currency]);
      if (rows.length === 0) throw new Error('Saldo pendiente insuficiente para deducir');
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
        'DB Error: deductPendingEarnings failed'
      );
      throw error;
    }
  },

  /**
   * Suma directamente al disponible (Ajustes manuales o devoluciones de payouts).
   */
  async addAvailableBalance(userId: string, amount: number, currency: string, client?: PoolClient) {
    const schema = config.db?.schema || 'public';
    const query = `
      UPDATE "${schema}".user_balances 
      SET available_balance = (available_balance + $1)::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2 AND currency = $3
      RETURNING *;
    `;
    try {
      const db = client || pool;
      const { rows } = await db.query(query, [amount, userId, currency]);
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
        'DB Error: addAvailableBalance failed'
      );
      throw error;
    }
  },

  async getByUserIdAndCurrency(userId: string, currency: string = 'ARS'): Promise<UserBalance> {
    const schema = config.db?.schema || 'public';
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
    const schema = config.db?.schema || 'public';
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

  /**
   * Obtiene el balance bloqueando la fila para actualización (FOR UPDATE).
   * Útil para validar saldos antes de restar en procesos transaccionales.
   */
  async getBalanceForUpdate(
    userId: string,
    currency: string,
    client: any
  ): Promise<UserBalance | null> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT total_earned, available_balance, pending_balance, currency, updated_at
      FROM "${schema}".user_balances 
      WHERE user_id = $1 AND currency = $2 
      FOR UPDATE;
    `;
    try {
      // Usamos client directamente porque FOR UPDATE requiere estar en una transacción
      const { rows } = await client.query(query, [userId, currency]);

      if (rows.length === 0) return null;

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
        'DB Error: getBalanceForUpdate failed'
      );
      throw error;
    }
  },
};
