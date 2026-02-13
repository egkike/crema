import { PoolClient } from 'pg';

import pool from '../db/postgres';
import { config } from '../config/index';

export const platformBalanceRepository = {
  /**
   * Asegura que exista el registro de balance para una moneda.
   * Útil para evitar errores de FK o registros inexistentes.
   */
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

  /**
   * Suma una ganancia al balance PENDIENTE de la plataforma.
   */
  async addToPending(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    // Primero nos aseguramos que la moneda exista en la tabla
    await this.ensureBalanceExists(currency, client);

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2;
    `;
    await db.query(query, [amount, currency]);
  },

  /**
   * Mueve dinero de Pendiente a Disponible (Liberación de Garantía).
   */
  async releaseBalance(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance - $1,
          available_balance = available_balance + $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2;
    `;
    await db.query(query, [amount, currency]);
  },

  /**
   * Deduce del balance pendiente por un reembolso.
   */
  async deductFromPending(amount: number, currency: string, client?: PoolClient) {
    const db = client || pool;
    const schema = config.db?.schema || 'public';

    const query = `
      UPDATE "${schema}".platform_balances
      SET pending_balance = pending_balance - $1,
          updated_at = CURRENT_TIMESTAMP
      WHERE currency = $2;
    `;
    await db.query(query, [amount, currency]);
  },

  /**
   * Obtiene el estado actual de los balances de la plataforma.
   */
  async getBalances(currency: string) {
    const schema = config.db?.schema || 'public';
    const query = `SELECT * FROM "${schema}".platform_balances WHERE currency = $1`;
    const { rows } = await pool.query(query, [currency]);

    // ✅ Ajuste: Si no existe, devolvemos un estado inicial coherente
    return (
      rows[0] || {
        currency,
        pending_balance: '0.00000000',
        available_balance: '0.00000000',
        updated_at: new Date(),
      }
    );
  },

  /**
   * Deduce del balance DISPONIBLE (usado para retiros de la empresa)
   */
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
};
