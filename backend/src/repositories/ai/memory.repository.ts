/**
 * AI Memory Repository
 * Phase 1: Foundation (Memory + Credits)
 * Handles vector embedding persistence and search
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';
import type {
  AIEmbedding,
  EmbeddingSourceType,
  EmbeddingSearchResult,
} from '../../types/ai.types';

const schema = config.db?.schema || 'public';

// Type for database row (embedding stored as vector)
interface AIEmbeddingRow {
  id: string;
  user_id: string | null;
  source_type: string;
  source_id: string;
  content: string;
  embedding: string; // pgvector stores as string
  metadata: Record<string, unknown>;
  created_at: Date;
}

export const memoryRepository = {
  /**
   * Create a new embedding
   */
  async createEmbedding(
    userId: string | null,
    sourceType: EmbeddingSourceType,
    sourceId: string,
    content: string,
    embedding: number[],
    metadata: Record<string, unknown> = {}
  ): Promise<AIEmbedding> {
    const query = `
      INSERT INTO "${schema}".ai_embeddings (user_id, source_type, source_id, content, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, source_type, source_id, content, embedding, metadata, created_at
    `;
    
    const { rows } = await pool.query<AIEmbeddingRow>(query, [
      userId,
      sourceType,
      sourceId,
      content,
      `[${embedding.join(',')}]`, // Convert array to vector format
      JSON.stringify(metadata),
    ]);

    return this.mapRowToEmbedding(rows[0]);
  },

  /**
   * Get embedding by source
   */
  async getBySource(sourceType: EmbeddingSourceType, sourceId: string): Promise<AIEmbedding | null> {
    const query = `
      SELECT id, user_id, source_type, source_id, content, embedding, metadata, created_at
      FROM "${schema}".ai_embeddings
      WHERE source_type = $1 AND source_id = $2
    `;
    const { rows } = await pool.query<AIEmbeddingRow>(query, [sourceType, sourceId]);
    return rows[0] ? this.mapRowToEmbedding(rows[0]) : null;
  },

  /**
   * Get all embeddings for a user
   */
  async getByUser(userId: string, limit: number = 100): Promise<AIEmbedding[]> {
    const query = `
      SELECT id, user_id, source_type, source_id, content, embedding, metadata, created_at
      FROM "${schema}".ai_embeddings
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const { rows } = await pool.query<AIEmbeddingRow>(query, [userId, limit]);
    return rows.map(row => this.mapRowToEmbedding(row));
  },

  /**
   * Delete embedding by source
   */
  async deleteBySource(sourceType: EmbeddingSourceType, sourceId: string): Promise<boolean> {
    const query = `
      DELETE FROM "${schema}".ai_embeddings
      WHERE source_type = $1 AND source_id = $2
    `;
    const result = await pool.query(query, [sourceType, sourceId]);
    return result.rowCount !== null && result.rowCount > 0;
  },

  /**
   * Delete all embeddings for a user
   */
  async deleteByUser(userId: string): Promise<number> {
    const query = `
      DELETE FROM "${schema}".ai_embeddings
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rowCount || 0;
  },

  /**
   * Semantic search using vector similarity (cosine distance)
   */
  async semanticSearch(
    query: string,
    userId: string | null,
    limit: number = 10,
    sourceTypes?: EmbeddingSourceType[]
  ): Promise<EmbeddingSearchResult[]> {
    // Note: This requires the query to be embedded first
    // The actual embedding should be passed as an array and converted here
    // For now, we assume the embedding is provided directly
    
    let sql = `
      SELECT id, source_type, source_id, content, metadata,
             1 - (embedding <=> $1::vector) as similarity
      FROM "${schema}".ai_embeddings
      WHERE ($2::uuid IS NULL OR user_id = $2::uuid)
    `;

    const params: unknown[] = [query, userId];

    if (sourceTypes && sourceTypes.length > 0) {
      sql += ` AND source_type = ANY($${params.length + 1}::text[])`;
      params.push(sourceTypes);
    }

    sql += ` ORDER BY similarity DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const { rows } = await pool.query<{
      id: string;
      source_type: string;
      source_id: string;
      content: string;
      metadata: Record<string, unknown>;
      similarity: number;
    }>(sql, params);

    return rows.map(row => ({
      id: row.id,
      source_type: row.source_type as EmbeddingSourceType,
      source_id: row.source_id,
      content: row.content,
      metadata: row.metadata,
      similarity: row.similarity,
    }));
  },

  /**
   * Count embeddings by source type
   */
  async countBySourceType(sourceType: EmbeddingSourceType): Promise<number> {
    const query = `
      SELECT COUNT(*) as count
      FROM "${schema}".ai_embeddings
      WHERE source_type = $1
    `;
    const { rows } = await pool.query<{ count: number }>(query, [sourceType]);
    return rows[0]?.count || 0;
  },

  /**
   * Rebuild index for a product (delete and recreate embeddings)
   * This is a placeholder - actual rebuild requires re-embedding all content
   */
  async rebuildIndex(productId: string): Promise<{ deleted: number; message: string }> {
    // For now, just delete embeddings for this product
    const query = `
      DELETE FROM "${schema}".ai_embeddings
      WHERE source_id = $1
    `;
    const result = await pool.query(query, [productId]);
    return {
      deleted: result.rowCount || 0,
      message: 'Index rebuild requested. Embeddings need to be regenerated.',
    };
  },

  /**
   * Helper: Map database row to AIEmbedding
   */
  mapRowToEmbedding(row: AIEmbeddingRow): AIEmbedding {
    // Parse embedding from string format "[1,2,3]" to number[]
    let embedding: number[] = [];
    if (row.embedding) {
      // Remove brackets and split by comma
      const cleanStr = row.embedding.replace(/[[\]]/g, '');
      if (cleanStr) {
        embedding = cleanStr.split(',').map(s => parseFloat(s.trim()));
      }
    }

    return {
      id: row.id,
      user_id: row.user_id || '',
      source_type: row.source_type as EmbeddingSourceType,
      source_id: row.source_id,
      content: row.content,
      embedding,
      metadata: row.metadata,
      created_at: row.created_at,
    };
  },
};
