/**
 * AI Reviews Repository
 * Phase 3: Reviews/Ratings
 * Handles review, vote, and settings persistence
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';

const schema = config.db?.schema || 'public';

// Types for Reviews
export interface ProductReview {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  content: string;
  is_verified_purchase: boolean;
  is_published: boolean;
  is_ai_generated: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ReviewVote {
  id: string;
  review_id: string;
  user_id: string;
  vote_type: 'helpful' | 'not_helpful';
  created_at: Date;
}

export interface ProductReviewSettings {
  id: string;
  product_id: string;
  allow_reviews: boolean;
  require_verified_purchase: boolean;
  auto_publish: boolean;
  min_rating: number;
  max_rating: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateReviewDTO {
  productId: string;
  userId: string;
  rating: number;
  title?: string;
  content: string;
  isVerifiedPurchase?: boolean;
}

export interface UpdateReviewDTO {
  rating?: number;
  title?: string;
  content?: string;
  isPublished?: boolean;
}

export interface UpdateReviewSettingsDTO {
  allowReviews?: boolean;
  requireVerifiedPurchase?: boolean;
  autoPublish?: boolean;
  minRating?: number;
  maxRating?: number;
}

export const reviewRepository = {
  // =========================================================================
  // Reviews
  // =========================================================================

  /**
   * Create a new review
   */
  async createReview(data: CreateReviewDTO): Promise<ProductReview> {
    const query = `
      INSERT INTO "${schema}".product_reviews (product_id, user_id, rating, title, content, is_verified_purchase)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
    `;
    const { rows } = await pool.query<ProductReview>(query, [
      data.productId,
      data.userId,
      data.rating,
      data.title || null,
      data.content,
      data.isVerifiedPurchase || false,
    ]);
    return rows[0];
  },

  /**
   * Get review by ID
   */
  async getReviewById(reviewId: string): Promise<ProductReview | null> {
    const query = `
      SELECT id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
      FROM "${schema}".product_reviews
      WHERE id = $1
    `;
    const { rows } = await pool.query<ProductReview>(query, [reviewId]);
    return rows[0] || null;
  },

  /**
   * Get reviews for a product
   */
  async getReviewsByProduct(
    productId: string,
    includeUnpublished: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ reviews: ProductReview[]; total: number; avgRating: number }> {
    const countQuery = includeUnpublished
      ? `SELECT COUNT(*) as total FROM "${schema}".product_reviews WHERE product_id = $1`
      : `SELECT COUNT(*) as total FROM "${schema}".product_reviews WHERE product_id = $1 AND is_published = true`;

    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, [productId]);

    // Get average rating
    const avgQuery = includeUnpublished
      ? `SELECT COALESCE(AVG(rating), 0) as avg FROM "${schema}".product_reviews WHERE product_id = $1`
      : `SELECT COALESCE(AVG(rating), 0) as avg FROM "${schema}".product_reviews WHERE product_id = $1 AND is_published = true`;
    const { rows: avgRows } = await pool.query<{ avg: number }>(avgQuery, [productId]);

    const query = includeUnpublished
      ? `SELECT id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
         FROM "${schema}".product_reviews
         WHERE product_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`
      : `SELECT id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
         FROM "${schema}".product_reviews
         WHERE product_id = $1 AND is_published = true
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`;

    const { rows } = await pool.query<ProductReview>(query, [productId, limit, offset]);

    return {
      reviews: rows,
      total: countRows[0]?.total || 0,
      avgRating: parseFloat(String(avgRows[0]?.avg || '0')),
    };
  },

  /**
   * Update a review
   */
  async updateReview(reviewId: string, data: UpdateReviewDTO): Promise<ProductReview | null> {
    const updates: string[] = [];
    const params: unknown[] = [reviewId];
    let paramIndex = 2;

    if (data.rating !== undefined) {
      updates.push(`rating = $${paramIndex++}`);
      params.push(data.rating);
    }
    if (data.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(data.title);
    }
    if (data.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      params.push(data.content);
    }
    if (data.isPublished !== undefined) {
      updates.push(`is_published = $${paramIndex++}`);
      params.push(data.isPublished);
    }

    if (updates.length === 0) {
      return this.getReviewById(reviewId);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE "${schema}".product_reviews
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
    `;

    const { rows } = await pool.query<ProductReview>(query, params);
    return rows[0] || null;
  },

  /**
   * Delete a review
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".product_reviews WHERE id = $1`;
    const result = await pool.query(query, [reviewId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Get user's review for a product
   */
  async getUserReview(productId: string, userId: string): Promise<ProductReview | null> {
    const query = `
      SELECT id, product_id, user_id, rating, title, content, is_verified_purchase, is_published, is_ai_generated, created_at, updated_at
      FROM "${schema}".product_reviews
      WHERE product_id = $1 AND user_id = $2
    `;
    const { rows } = await pool.query<ProductReview>(query, [productId, userId]);
    return rows[0] || null;
  },

  // =========================================================================
  // Votes
  // =========================================================================

  /**
   * Vote on a review
   */
  async vote(reviewId: string, userId: string, voteType: 'helpful' | 'not_helpful'): Promise<ReviewVote> {
    const query = `
      INSERT INTO "${schema}".review_votes (review_id, user_id, vote_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (review_id, user_id) DO UPDATE SET
        vote_type = EXCLUDED.vote_type
      RETURNING id, review_id, user_id, vote_type, created_at
    `;
    const { rows } = await pool.query<ReviewVote>(query, [reviewId, userId, voteType]);
    return rows[0];
  },

  /**
   * Remove vote from a review
   */
  async removeVote(reviewId: string, userId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".review_votes WHERE review_id = $1 AND user_id = $2`;
    const result = await pool.query(query, [reviewId, userId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Get user's vote for a review
   */
  async getUserVote(reviewId: string, userId: string): Promise<ReviewVote | null> {
    const query = `
      SELECT id, review_id, user_id, vote_type, created_at
      FROM "${schema}".review_votes
      WHERE review_id = $1 AND user_id = $2
    `;
    const { rows } = await pool.query<ReviewVote>(query, [reviewId, userId]);
    return rows[0] || null;
  },

  /**
   * Get vote counts for a review
   */
  async getVoteCounts(reviewId: string): Promise<{ helpful: number; not_helpful: number }> {
    const query = `
      SELECT vote_type, COUNT(*) as count
      FROM "${schema}".review_votes
      WHERE review_id = $1
      GROUP BY vote_type
    `;
    const { rows } = await pool.query<{ vote_type: string; count: number }>(query, [reviewId]);

    const result = { helpful: 0, not_helpful: 0 };
    for (const row of rows) {
      if (row.vote_type === 'helpful') result.helpful = Number(row.count);
      if (row.vote_type === 'not_helpful') result.not_helpful = Number(row.count);
    }
    return result;
  },

  // =========================================================================
  // Settings
  // =========================================================================

  /**
   * Create or update review settings for a product
   */
  async upsertSettings(productId: string, data: UpdateReviewSettingsDTO): Promise<ProductReviewSettings> {
    const updates: string[] = [];
    const params: unknown[] = [productId];
    let paramIndex = 2;

    if (data.allowReviews !== undefined) {
      updates.push(`allow_reviews = $${paramIndex++}`);
      params.push(data.allowReviews);
    }
    if (data.requireVerifiedPurchase !== undefined) {
      updates.push(`require_verified_purchase = $${paramIndex++}`);
      params.push(data.requireVerifiedPurchase);
    }
    if (data.autoPublish !== undefined) {
      updates.push(`auto_publish = $${paramIndex++}`);
      params.push(data.autoPublish);
    }
    if (data.minRating !== undefined) {
      updates.push(`min_rating = $${paramIndex++}`);
      params.push(data.minRating);
    }
    if (data.maxRating !== undefined) {
      updates.push(`max_rating = $${paramIndex++}`);
      params.push(data.maxRating);
    }

    if (updates.length === 0) {
      const existing = await this.getSettings(productId);
      if (existing) return existing;
      throw new Error('No settings to create');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      INSERT INTO "${schema}".product_review_settings (product_id, ${updates.join(', ')})
      VALUES ($1, ${updates.map((_, i) => `$${i + 2}`).join(', ')})
      ON CONFLICT (product_id) DO UPDATE SET
        ${updates.join(', ')}
      RETURNING id, product_id, allow_reviews, require_verified_purchase, auto_publish, min_rating, max_rating, created_at, updated_at
    `;

    const { rows } = await pool.query<ProductReviewSettings>(query, params);
    return rows[0];
  },

  /**
   * Get review settings for a product
   */
  async getSettings(productId: string): Promise<ProductReviewSettings | null> {
    const query = `
      SELECT id, product_id, allow_reviews, require_verified_purchase, auto_publish, min_rating, max_rating, created_at, updated_at
      FROM "${schema}".product_review_settings
      WHERE product_id = $1
    `;
    const { rows } = await pool.query<ProductReviewSettings>(query, [productId]);
    return rows[0] || null;
  },

  /**
   * Get rating distribution for a product
   */
  async getRatingDistribution(productId: string): Promise<{ rating: number; count: number }[]> {
    const query = `
      SELECT rating, COUNT(*) as count
      FROM "${schema}".product_reviews
      WHERE product_id = $1 AND is_published = true
      GROUP BY rating
      ORDER BY rating DESC
    `;
    const { rows } = await pool.query<{ rating: number; count: number }>(query, [productId]);
    return rows;
  },
};