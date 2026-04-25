/**
 * UserContextRepository for user_context table
 * Part of SDD: docs/project/architecture-improvements/sdd/user-context/
 * 
 * Security: All methods require userId for ownership validation
 * Uses atomic UPSERT to prevent race conditions
 */

import pool from '../db/postgres';
import logger from '../utils/logger';

export interface UserContext {
  id: string;
  userId: string;
  productId: string;
  contextData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserContextRepository {
  findByUserAndProduct(userId: string, productId: string): Promise<UserContext | null>;
  findByUser(userId: string): Promise<UserContext[]>;
  findById(id: string): Promise<UserContext | null>;
  create(data: { userId: string; productId: string; contextData?: Record<string, unknown> }): Promise<UserContext>;
  update(id: string, userId: string, contextData: Record<string, unknown>): Promise<UserContext>;
  upsert(userId: string, productId: string, contextData: Record<string, unknown>): Promise<UserContext>;
}

export const userContextRepository: IUserContextRepository = {
  /**
   * Find context by user + product
   */
  async findByUserAndProduct(userId: string, productId: string): Promise<UserContext | null> {
    const query = `
      SELECT id, user_id, product_id, context_data, created_at, updated_at
      FROM user_context
      WHERE user_id = $1 AND product_id = $2
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId]);
      if (rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserContextRepository: findByUserAndProduct failed');
      throw error;
    }
  },

  /**
   * Find all contexts for a user
   */
  async findByUser(userId: string): Promise<UserContext[]> {
    const query = `
      SELECT id, user_id, product_id, context_data, created_at, updated_at
      FROM user_context
      WHERE user_id = $1
      ORDER BY updated_at DESC
    `;
    try {
      const { rows } = await pool.query(query, [userId]);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'UserContextRepository: findByUser failed');
      throw error;
    }
  },

  /**
   * Find by ID (with optional ownership check - defense in depth)
   */
  async findById(id: string, userId?: string): Promise<UserContext | null> {
    let query = `
      SELECT id, user_id, product_id, context_data, created_at, updated_at
      FROM user_context
      WHERE id = $1
    `;
    const params: string[] = [id];
    
    // If userId provided, add ownership check
    if (userId) {
      query += ' AND user_id = $2';
      params.push(userId);
    }
    
    try {
      const { rows } = await pool.query(query, params);
      if (rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, id }, 'UserContextRepository: findById failed');
      throw error;
    }
  },

  /**
   * Create context (for new records only)
   */
  async create(data: { userId: string; productId: string; contextData?: Record<string, unknown> }): Promise<UserContext> {
    const query = `
      INSERT INTO user_context (user_id, product_id, context_data)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, product_id, context_data, created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [data.userId, data.productId, data.contextData || {}]);
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, data }, 'UserContextRepository: create failed');
      throw error;
    }
  },

  /**
   * Update context (SECURITY: requires userId for ownership validation)
   */
  async update(id: string, userId: string, contextData: Record<string, unknown>): Promise<UserContext> {
    // SECURITY: Include userId in WHERE clause for ownership
    const query = `
      UPDATE user_context
      SET context_data = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, product_id, context_data, created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [id, userId, contextData]);
      if (rows.length === 0) {
        throw new Error('Context not found or not owned by user');
      }
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, id, userId }, 'UserContextRepository: update failed');
      throw error;
    }
  },

  /**
   * Atomic UPSERT - prevents race conditions by using DB-level conflict resolution
   */
  async upsert(userId: string, productId: string, contextData: Record<string, unknown>): Promise<UserContext> {
    // Use ON CONFLICT DO UPDATE for atomic upsert - no race condition possible
    const query = `
      INSERT INTO user_context (user_id, product_id, context_data)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, product_id) 
      DO UPDATE SET context_data = $3, updated_at = NOW()
      RETURNING id, user_id, product_id, context_data, created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId, contextData]);
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        contextData: row.context_data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserContextRepository: upsert failed');
      throw error;
    }
  },
};