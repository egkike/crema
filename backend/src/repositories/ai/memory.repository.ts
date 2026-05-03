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
   * Update embedding content and vector
   * Returns the updated embedding row via RETURNING clause
   */
  async updateEmbedding(
    sourceId: string,
    sourceType: EmbeddingSourceType,
    content: string,
    embedding: number[],
    metadata: Record<string, unknown>
  ): Promise<AIEmbedding> {
    const query = `
      UPDATE "${schema}".ai_embeddings
      SET content = $1,
          embedding = $2,
          metadata = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE source_type = $4 AND source_id = $5
      RETURNING id, user_id, source_type, source_id, content, embedding, metadata, created_at
    `;
    const { rows } = await pool.query<AIEmbeddingRow>(query, [
      content,
      `[${embedding.join(',')}]`,
      JSON.stringify(metadata),
      sourceType,
      sourceId,
    ]);

    if (rows.length === 0) {
      throw new Error(`Embedding not found for source_type=${sourceType}, source_id=${sourceId}`);
    }

    return this.mapRowToEmbedding(rows[0]);
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
   *
   * WARNING #7 (theoretical): Vector search without statement_timeout can block connection pool.
   * This project likely handles this at connection level. If issues arise, consider:
   * - SET statement_timeout = '30s' at session level
   * - Or add per-query timeout using pool.query with cancellation
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
   * Validate if user has access to products associated with embeddings
   * Uses same RBAC pattern as ai.routes.ts:1233-1256
   *
   * @param userId - User to check access for
   * @param sourceTypes - Array of source types to validate
   * @returns true if user has access to at least one product, false otherwise
   *
   * WARNING #4: Combined into single query with UNION ALL to reduce round trips
   */
  async validateProductAccess(
    userId: string,
    sourceTypes: EmbeddingSourceType[]
  ): Promise<boolean> {
    const schema = config.db?.schema || 'public';

    // Get all embeddings for the given source types and find product_ids via JOINs in single query
    const embeddingsQuery = `
      WITH embedding_products AS (
        SELECT DISTINCT ae.source_id, ae.source_type,
          COALESCE(
            pm.product_id,
            pf.product_id,
            pr.product_id
          ) AS product_id
        FROM "${schema}".ai_embeddings ae
        LEFT JOIN "${schema}".product_lessons pl ON ae.source_id = pl.id AND ae.source_type = 'lesson'
        LEFT JOIN "${schema}".product_modules pm ON pm.id = pl.module_id
        LEFT JOIN "${schema}".product_faqs pf ON ae.source_id = pf.id AND ae.source_type = 'faq'
        LEFT JOIN "${schema}".product_reviews pr ON ae.source_id = pr.id AND ae.source_type = 'review'
        WHERE ae.source_type = ANY($1::text[])
      ),
      product_ids AS (
        SELECT DISTINCT product_id FROM embedding_products WHERE product_id IS NOT NULL
      )
      SELECT 1 FROM (
        SELECT id FROM "${schema}".products WHERE id IN (SELECT product_id FROM product_ids) AND creator_id = $2
        UNION ALL
        SELECT id FROM "${schema}".orders WHERE product_id IN (SELECT product_id FROM product_ids) AND buyer_id = $2 AND status = 'completed'
        UNION ALL
        SELECT id FROM "${schema}".affiliate_sales WHERE product_id IN (SELECT product_id FROM product_ids) AND affiliate_id = $2
      ) AS access_check
      LIMIT 1
    `;

    const { rows } = await pool.query(embeddingsQuery, [sourceTypes, userId]);
    return rows.length > 0;
  },

  /**
   * Get accessible source types for a user based on their products
   * Returns all source types for embeddings associated with products the user can access
   *
   * WARNING #6: Note that policy, qa, insight, and saved_dashboard types are globally
   * accessible (skip product validation) - this is intentional per design since these
   * types don't have product associations.
   */
  async getAccessibleSourceTypes(userId: string): Promise<EmbeddingSourceType[]> {
    const schema = config.db?.schema || 'public';

    const query = `
      WITH accessible_products AS (
        SELECT id FROM "${schema}".products WHERE creator_id = $1
        UNION ALL
        SELECT product_id FROM "${schema}".orders WHERE buyer_id = $1 AND status = 'completed'
        UNION ALL
        SELECT product_id FROM "${schema}".affiliate_sales WHERE affiliate_id = $1
      ),
      accessible_source_types AS (
        SELECT DISTINCT ae.source_type
        FROM "${schema}".ai_embeddings ae
        LEFT JOIN "${schema}".product_lessons pl ON ae.source_id = pl.id AND ae.source_type = 'lesson'
        LEFT JOIN "${schema}".product_modules pm ON pl.module_id = pm.id
        LEFT JOIN "${schema}".product_faqs pf ON ae.source_id = pf.id AND ae.source_type = 'faq'
        LEFT JOIN "${schema}".product_reviews pr ON ae.source_id = pr.id AND ae.source_type = 'review'
        WHERE (
          pm.product_id IN (SELECT id FROM accessible_products)
          OR pf.product_id IN (SELECT id FROM accessible_products)
          OR pr.product_id IN (SELECT id FROM accessible_products)
          OR ae.source_type NOT IN ('lesson', 'faq', 'review')
        )
      )
      SELECT source_type FROM accessible_source_types
    `;

    const { rows } = await pool.query<{ source_type: string }>(query, [userId]);
    return rows.map(r => r.source_type as EmbeddingSourceType);
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
