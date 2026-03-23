/**
 * AI Q&A Repository
 * Phase 2: Q&A System
 * Handles questions, answers, votes, and FAQs persistence
 */

import pool from '../../db/postgres';
import { config } from '../../config/index';

const schema = config.db?.schema || 'public';

// Types for Q&A
export interface ProductQuestion {
  id: string;
  product_id: string;
  user_id: string;
  question: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: Date | null;
  is_published: boolean;
  is_ai_generated: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface QuestionVote {
  id: string;
  question_id: string;
  user_id: string;
  vote_type: 'helpful' | 'not_helpful';
  created_at: Date;
}

export interface ProductFAQ {
  id: string;
  product_id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateQuestionDTO {
  productId: string;
  userId: string;
  question: string;
}

export interface AnswerQuestionDTO {
  answer: string;
  answeredBy: string;
}

export interface CreateFAQDTO {
  productId: string;
  question: string;
  answer: string;
  sortOrder?: number;
}

export interface UpdateFAQDTO {
  question?: string;
  answer?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export const qaRepository = {
  // =========================================================================
  // Questions
  // =========================================================================

  /**
   * Create a new question
   */
  async createQuestion(data: CreateQuestionDTO): Promise<ProductQuestion> {
    const query = `
      INSERT INTO "${schema}".product_questions (product_id, user_id, question)
      VALUES ($1, $2, $3)
      RETURNING id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
    `;
    const { rows } = await pool.query<ProductQuestion>(query, [
      data.productId,
      data.userId,
      data.question,
    ]);
    return rows[0];
  },

  /**
   * Get question by ID
   */
  async getQuestionById(questionId: string): Promise<ProductQuestion | null> {
    const query = `
      SELECT id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
      FROM "${schema}".product_questions
      WHERE id = $1
    `;
    const { rows } = await pool.query<ProductQuestion>(query, [questionId]);
    return rows[0] || null;
  },

  /**
   * Get questions for a product
   */
  async getQuestionsByProduct(
    productId: string,
    includeUnpublished: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ questions: ProductQuestion[]; total: number }> {
    const countQuery = includeUnpublished
      ? `SELECT COUNT(*) as total FROM "${schema}".product_questions WHERE product_id = $1`
      : `SELECT COUNT(*) as total FROM "${schema}".product_questions WHERE product_id = $1 AND is_published = true`;

    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, [productId]);

    const query = includeUnpublished
      ? `SELECT id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
         FROM "${schema}".product_questions
         WHERE product_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`
      : `SELECT id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
         FROM "${schema}".product_questions
         WHERE product_id = $1 AND is_published = true
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`;

    const { rows } = await pool.query<ProductQuestion>(query, [productId, limit, offset]);

    return {
      questions: rows,
      total: countRows[0]?.total || 0,
    };
  },

  /**
   * Answer a question
   */
  async answerQuestion(questionId: string, data: AnswerQuestionDTO): Promise<ProductQuestion | null> {
    const query = `
      UPDATE "${schema}".product_questions
      SET answer = $2, answered_by = $3, answered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
    `;
    const { rows } = await pool.query<ProductQuestion>(query, [
      questionId,
      data.answer,
      data.answeredBy,
    ]);
    return rows[0] || null;
  },

  /**
   * Update question publication status
   */
  async togglePublish(questionId: string, isPublished: boolean): Promise<ProductQuestion | null> {
    const query = `
      UPDATE "${schema}".product_questions
      SET is_published = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, product_id, user_id, question, answer, answered_by, answered_at, is_published, is_ai_generated, created_at, updated_at
    `;
    const { rows } = await pool.query<ProductQuestion>(query, [questionId, isPublished]);
    return rows[0] || null;
  },

  /**
   * Delete a question
   */
  async deleteQuestion(questionId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".product_questions WHERE id = $1`;
    const result = await pool.query(query, [questionId]);
    return (result.rowCount || 0) > 0;
  },

  // =========================================================================
  // Votes
  // =========================================================================

  /**
   * Vote on a question
   */
  async vote(questionId: string, userId: string, voteType: 'helpful' | 'not_helpful'): Promise<QuestionVote> {
    const query = `
      INSERT INTO "${schema}".question_votes (question_id, user_id, vote_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (question_id, user_id) DO UPDATE SET
        vote_type = EXCLUDED.vote_type
      RETURNING id, question_id, user_id, vote_type, created_at
    `;
    const { rows } = await pool.query<QuestionVote>(query, [questionId, userId, voteType]);
    return rows[0];
  },

  /**
   * Remove vote from a question
   */
  async removeVote(questionId: string, userId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".question_votes WHERE question_id = $1 AND user_id = $2`;
    const result = await pool.query(query, [questionId, userId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Get user's vote for a question
   */
  async getUserVote(questionId: string, userId: string): Promise<QuestionVote | null> {
    const query = `
      SELECT id, question_id, user_id, vote_type, created_at
      FROM "${schema}".question_votes
      WHERE question_id = $1 AND user_id = $2
    `;
    const { rows } = await pool.query<QuestionVote>(query, [questionId, userId]);
    return rows[0] || null;
  },

  /**
   * Get vote counts for a question
   */
  async getVoteCounts(questionId: string): Promise<{ helpful: number; not_helpful: number }> {
    const query = `
      SELECT vote_type, COUNT(*) as count
      FROM "${schema}".question_votes
      WHERE question_id = $1
      GROUP BY vote_type
    `;
    const { rows } = await pool.query<{ vote_type: string; count: number }>(query, [questionId]);

    const result = { helpful: 0, not_helpful: 0 };
    for (const row of rows) {
      if (row.vote_type === 'helpful') result.helpful = Number(row.count);
      if (row.vote_type === 'not_helpful') result.not_helpful = Number(row.count);
    }
    return result;
  },

  // =========================================================================
  // FAQs
  // =========================================================================

  /**
   * Create a FAQ
   */
  async createFAQ(data: CreateFAQDTO): Promise<ProductFAQ> {
    const query = `
      INSERT INTO "${schema}".product_faqs (product_id, question, answer, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING id, product_id, question, answer, sort_order, is_active, created_at, updated_at
    `;
    const { rows } = await pool.query<ProductFAQ>(query, [
      data.productId,
      data.question,
      data.answer,
      data.sortOrder || 0,
    ]);
    return rows[0];
  },

  /**
   * Get FAQ by ID
   */
  async getFAQById(faqId: string): Promise<ProductFAQ | null> {
    const query = `
      SELECT id, product_id, question, answer, sort_order, is_active, created_at, updated_at
      FROM "${schema}".product_faqs
      WHERE id = $1
    `;
    const { rows } = await pool.query<ProductFAQ>(query, [faqId]);
    return rows[0] || null;
  },

  /**
   * Get FAQs for a product
   */
  async getFAQsByProduct(productId: string, includeInactive: boolean = false): Promise<ProductFAQ[]> {
    const query = includeInactive
      ? `SELECT id, product_id, question, answer, sort_order, is_active, created_at, updated_at
         FROM "${schema}".product_faqs
         WHERE product_id = $1
         ORDER BY sort_order ASC, created_at ASC`
      : `SELECT id, product_id, question, answer, sort_order, is_active, created_at, updated_at
         FROM "${schema}".product_faqs
         WHERE product_id = $1 AND is_active = true
         ORDER BY sort_order ASC, created_at ASC`;

    const { rows } = await pool.query<ProductFAQ>(query, [productId]);
    return rows;
  },

  /**
   * Update a FAQ
   */
  async updateFAQ(faqId: string, data: UpdateFAQDTO): Promise<ProductFAQ | null> {
    const updates: string[] = [];
    const params: unknown[] = [faqId];
    let paramIndex = 2;

    if (data.question !== undefined) {
      updates.push(`question = $${paramIndex++}`);
      params.push(data.question);
    }
    if (data.answer !== undefined) {
      updates.push(`answer = $${paramIndex++}`);
      params.push(data.answer);
    }
    if (data.sortOrder !== undefined) {
      updates.push(`sort_order = $${paramIndex++}`);
      params.push(data.sortOrder);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (updates.length === 0) {
      return this.getFAQById(faqId);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE "${schema}".product_faqs
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, product_id, question, answer, sort_order, is_active, created_at, updated_at
    `;

    const { rows } = await pool.query<ProductFAQ>(query, params);
    return rows[0] || null;
  },

  /**
   * Delete a FAQ
   */
  async deleteFAQ(faqId: string): Promise<boolean> {
    const query = `DELETE FROM "${schema}".product_faqs WHERE id = $1`;
    const result = await pool.query(query, [faqId]);
    return (result.rowCount || 0) > 0;
  },

  /**
   * Reorder FAQs for a product
   */
  async reorderFAQs(productId: string, faqIds: string[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < faqIds.length; i++) {
        await client.query(
          `UPDATE "${schema}".product_faqs SET sort_order = $1 WHERE id = $2 AND product_id = $3`,
          [i, faqIds[i], productId]
        );
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
};