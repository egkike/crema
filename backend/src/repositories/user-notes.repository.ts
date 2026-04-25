/**
 * UserNotesRepository for user_notes table
 * Part of SDD: docs/project/architecture-improvements/sdd/user-context/
 * 
 * Security: All methods require userId for ownership validation
 */

import pool from '../db/postgres';
import logger from '../utils/logger';

export type NoteType = 'highlight' | 'bookmark' | 'note';

export interface UserNote {
  id: string;
  userId: string;
  productId: string;
  noteText: string;
  noteType: NoteType;
  position: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserNotesRepository {
  findById(id: string, userId?: string): Promise<UserNote | null>;
  findByUserAndProduct(userId: string, productId: string): Promise<UserNote[]>;
  findByUser(userId: string): Promise<UserNote[]>;
  findByUserAndProductAndType(userId: string, productId: string, noteType: NoteType): Promise<UserNote[]>;
  create(data: {
    userId: string;
    productId: string;
    noteText: string;
    noteType: NoteType;
    position?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<UserNote>;
  update(id: string, userId: string, noteText: string): Promise<UserNote>;
  delete(id: string, userId: string): Promise<boolean>;
}

export const userNotesRepository: IUserNotesRepository = {
  async findById(id: string, userId?: string): Promise<UserNote | null> {
    let query = `
      SELECT id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
      FROM user_notes
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
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, id }, 'UserNotesRepository: findById failed');
      throw error;
    }
  },

  async findByUserAndProduct(userId: string, productId: string): Promise<UserNote[]> {
    const query = `
      SELECT id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
      FROM user_notes
      WHERE user_id = $1 AND product_id = $2
      ORDER BY created_at DESC
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId]);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserNotesRepository: findByUserAndProduct failed');
      throw error;
    }
  },

  async findByUser(userId: string): Promise<UserNote[]> {
    const query = `
      SELECT id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
      FROM user_notes
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    try {
      const { rows } = await pool.query(query, [userId]);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, userId }, 'UserNotesRepository: findByUser failed');
      throw error;
    }
  },

  async findByUserAndProductAndType(userId: string, productId: string, noteType: NoteType): Promise<UserNote[]> {
    const query = `
      SELECT id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
      FROM user_notes
      WHERE user_id = $1 AND product_id = $2 AND note_type = $3
      ORDER BY created_at DESC
    `;
    try {
      const { rows } = await pool.query(query, [userId, productId, noteType]);
      return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error, userId, productId, noteType }, 'UserNotesRepository: findByUserAndProductAndType failed');
      throw error;
    }
  },

  async create(data: {
    userId: string;
    productId: string;
    noteText: string;
    noteType: NoteType;
    position?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<UserNote> {
    const query = `
      INSERT INTO user_notes (user_id, product_id, note_text, note_type, position, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [
        data.userId,
        data.productId,
        data.noteText,
        data.noteType,
        data.position || null,
        data.metadata || {},
      ]);
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, data }, 'UserNotesRepository: create failed');
      throw error;
    }
  },

  async update(id: string, userId: string, noteText: string): Promise<UserNote> {
    // SECURITY: Include userId in WHERE clause for ownership validation
    const query = `
      UPDATE user_notes
      SET note_text = $3, updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, user_id, product_id, note_text, note_type, position, metadata, created_at, updated_at
    `;
    try {
      const { rows } = await pool.query(query, [id, userId, noteText]);
      if (rows.length === 0) {
        throw new Error('Note not found or not owned by user');
      }
      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        productId: row.product_id,
        noteText: row.note_text,
        noteType: row.note_type,
        position: row.position,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error({ error, id, userId }, 'UserNotesRepository: update failed');
      throw error;
    }
  },

  async delete(id: string, userId: string): Promise<boolean> {
    // SECURITY: Include userId in WHERE clause for ownership validation
    const query = `DELETE FROM user_notes WHERE id = $1 AND user_id = $2 RETURNING id`;
    try {
      const { rows } = await pool.query(query, [id, userId]);
      return rows.length > 0;
    } catch (error) {
      logger.error({ error, id, userId }, 'UserNotesRepository: delete failed');
      throw error;
    }
  },
};