/**
 * AI Credits Repository
 * Phase 1: Foundation (Memory + Credits)
 * Handles credit balance and transaction persistence
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';
import { InsufficientCreditsError } from '../../errors/InsufficientCreditsError';
import type {
  AICredit,
  AICreditPackage,
  AICreditTransaction,
} from '../../types/ai.types';

const schema = config.db?.schema || 'public';

export const creditsRepository = {
  /**
   * Get user's credit balance
   */
  async getBalance(userId: string): Promise<AICredit | null> {
    const query = `
      SELECT id, user_id, balance, expires_at, created_at, updated_at
      FROM "${schema}".ai_credits
      WHERE user_id = $1
    `;
    const { rows } = await pool.query<AICredit>(query, [userId]);
    return rows[0] || null;
  },

  /**
   * Create initial credit record for user
   */
  async create(userId: string, initialBalance: number = 0, expiresAt?: Date): Promise<AICredit> {
    const expires = expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year default
    const query = `
      INSERT INTO "${schema}".ai_credits (user_id, balance, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, balance, expires_at, created_at, updated_at
    `;
    const { rows } = await pool.query<AICredit>(query, [userId, initialBalance, expires]);
    return rows[0];
  },

  /**
   * Update credit balance
   */
  async updateBalance(userId: string, newBalance: number): Promise<AICredit | null> {
    const query = `
      UPDATE "${schema}".ai_credits
      SET balance = $2, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
      RETURNING id, user_id, balance, expires_at, created_at, updated_at
    `;
    const { rows } = await pool.query<AICredit>(query, [userId, newBalance]);
    return rows[0] || null;
  },

  /**
   * Add credits to user balance (atomic operation)
   */
  async addCredits(userId: string, amount: number, description: string): Promise<AICredit> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Upsert credit record
      const upsertQuery = `
        INSERT INTO "${schema}".ai_credits (user_id, balance, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          balance = ai_credits.balance + EXCLUDED.balance,
          expires_at = GREATEST(ai_credits.expires_at, EXCLUDED.expires_at),
          updated_at = CURRENT_TIMESTAMP
        RETURNING id, user_id, balance, expires_at, created_at, updated_at
      `;
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const { rows: creditRows } = await client.query<AICredit>(upsertQuery, [userId, amount, expiresAt]);

      // Record transaction
      const txQuery = `
        INSERT INTO "${schema}".ai_credit_transactions (user_id, amount, type, description)
        VALUES ($1, $2, 'purchase', $3)
        RETURNING id, user_id, amount, type, description, reference_id, created_at
      `;
      await client.query(txQuery, [userId, amount, description]);

      await client.query('COMMIT');
      return creditRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Use credits from user balance (atomic operation)
   */
  async useCredits(userId: string, amount: number, description: string, referenceId?: string): Promise<AICredit> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check balance
      const checkQuery = `
        SELECT balance FROM "${schema}".ai_credits WHERE user_id = $1 FOR UPDATE
      `;
      const { rows: checkRows } = await client.query<{ balance: number }>(checkQuery, [userId]);
      
      if (checkRows.length === 0 || checkRows[0].balance < amount) {
        throw new InsufficientCreditsError('Insufficient credits');
      }

      // Deduct balance
      const updateQuery = `
        UPDATE "${schema}".ai_credits
        SET balance = balance - $2, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        RETURNING id, user_id, balance, expires_at, created_at, updated_at
      `;
      const { rows: creditRows } = await client.query<AICredit>(updateQuery, [userId, amount]);

      // Record transaction
      const txQuery = `
        INSERT INTO "${schema}".ai_credit_transactions (user_id, amount, type, description, reference_id)
        VALUES ($1, $2, 'usage', $3, $4)
        RETURNING id, user_id, amount, type, description, reference_id, created_at
      `;
      await client.query(txQuery, [userId, -amount, description, referenceId]);

      await client.query('COMMIT');
      return creditRows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Get all transactions for user
   */
  async getTransactions(userId: string, limit: number = 50, offset: number = 0): Promise<{ transactions: AICreditTransaction[]; total: number }> {
    const countQuery = `
      SELECT COUNT(*) as total
      FROM "${schema}".ai_credit_transactions
      WHERE user_id = $1
    `;
    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, [userId]);

    const query = `
      SELECT id, user_id, amount, type, description, reference_id, created_at
      FROM "${schema}".ai_credit_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query<AICreditTransaction>(query, [userId, limit, offset]);

    return {
      transactions: rows,
      total: countRows[0]?.total || 0,
    };
  },

  /**
   * Get available credit packages
   */
  async getPackages(includeInactive: boolean = false): Promise<AICreditPackage[]> {
    const query = includeInactive
      ? `SELECT id, name, credits, price_usd, price_ars, is_active, created_at FROM "${schema}".ai_credit_packages ORDER BY credits ASC`
      : `SELECT id, name, credits, price_usd, price_ars, is_active, created_at FROM "${schema}".ai_credit_packages WHERE is_active = true ORDER BY credits ASC`;
    
    const { rows } = await pool.query<AICreditPackage>(query);
    return rows;
  },

  /**
   * Get package by ID
   */
  async getPackageById(packageId: string): Promise<AICreditPackage | null> {
    const query = `
      SELECT id, name, credits, price_usd, price_ars, is_active, created_at
      FROM "${schema}".ai_credit_packages
      WHERE id = $1
    `;
    const { rows } = await pool.query<AICreditPackage>(query, [packageId]);
    return rows[0] || null;
  },

  /**
   * Get expired credits (for cleanup jobs)
   */
  async getExpiredCredits(): Promise<AICredit[]> {
    const query = `
      SELECT id, user_id, balance, expires_at, created_at, updated_at
      FROM "${schema}".ai_credits
      WHERE expires_at < CURRENT_TIMESTAMP AND balance > 0
    `;
    const { rows } = await pool.query<AICredit>(query);
    return rows;
  },

  /**
   * Expire old credits (set balance to 0)
   */
  async expireCredits(userId: string): Promise<void> {
    const query = `
      UPDATE "${schema}".ai_credits
      SET balance = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND expires_at < CURRENT_TIMESTAMP
    `;
    await pool.query(query, [userId]);
  },
};
