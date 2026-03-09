import { PoolClient } from 'pg';

import pool from '../db/postgres';
import { config } from '../config/index';

export const platformBalanceRepository = {
  async ensureBalanceExists(currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      INSERT INTO "${schema}".platform_balances (currency, pending_balance, available_balance)
      VALUES ($1, 0, 0)
      ON CONFLICT (currency) DO NOTHING;
    `;
    await db.query(query, [currency]);
  },

  async addToPending(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    await this.ensureBalanceExists(currency, client);

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2;
    `;
    await db.query(query, [amount, currency]);
  },

  async releaseBalance(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance - $1,
          available_balance = available_balance + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2 AND pending_balance >= $1;
    `;
    const { rowCount } = await db.query(query, [amount, currency]);
    if (rowCount === 0) throw new Error('Saldo pendiente insuficiente en plataforma para liberar');
  },

  async deductFromPending(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2 AND pending_balance >= $1
      RETURNING pending_balance;
    `;
    const { rowCount } = await db.query(query, [amount, currency]);
    if (rowCount === 0) throw new Error('Saldo pendiente insuficiente para procesar reembolso');
  },

  async getBalances(currency: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".platform_balances WHERE currency = $1`;
    const { rows } = await pool.query(query, [currency]);

    if (rows.length === 0) {
      return {
        currency,
        pending_balance: 0,
        available_balance: 0,
        updated_at: new Date(),
      };
    }

    const row = rows[0];
    return {
      currency: row.currency,
      pending_balance: Number(row.pending_balance),
      available_balance: Number(row.available_balance),
      updated_at: row.updated_at,
    };
  },

  async deductFromAvailable(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      UPDATE "${schema}".platform_balances
      SET available_balance = available_balance - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2 AND available_balance >= $1
      RETURNING available_balance;
    `;
    const { rowCount } = await db.query(query, [amount, currency]);
    if (rowCount === 0) throw new Error('Saldo de plataforma insuficiente');
  },

  async getAvailable(currency: string): Promise<number> {
    const schema = config.db?.schema || 'public';
    const query = `
      SELECT available_balance 
      FROM "${schema}".platform_balances 
      WHERE currency = $1
    `;
    const { rows } = await pool.query(query, [currency]);
    return rows.length > 0 ? Number(rows[0].available_balance) : 0;
  },
};
