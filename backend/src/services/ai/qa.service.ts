/**
 * Q&A Service
 * Phase 2: Q&A System
 * Manages questions, answers, votes, and FAQs for products
 */

import { qaRepository, type ProductQuestion, type ProductFAQ } from '../../repositories/ai/qa.repository';
import { productRepository } from '../../repositories/product.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const qaService = {
  // =========================================================================
  // Questions
  // =========================================================================

  /**
   * Ask a question on a product
   */
  async createQuestion(
    productId: string,
    userId: string,
    question: string
  ): Promise<ProductQuestion> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Create question
    const result = await qaRepository.createQuestion({
      productId,
      userId,
      question,
    });

    logger.info({ productId, userId, questionId: result.id }, 'Question created');
    return result;
  },

  /**
   * Get questions for a product (public)
   */
  async getQuestions(
    productId: string,
    includeUnpublished: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ questions: ProductQuestion[]; total: number }> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return qaRepository.getQuestionsByProduct(productId, includeUnpublished, limit, offset);
  },

  /**
   * Get a single question by ID
   */
  async getQuestionById(questionId: string): Promise<ProductQuestion | null> {
    return qaRepository.getQuestionById(questionId);
  },

  /**
   * Answer a question (creator or admin)
   */
  async answerQuestion(
    questionId: string,
    answer: string,
    answeredBy: string
  ): Promise<ProductQuestion> {
    const question = await qaRepository.getQuestionById(questionId);
    if (!question) {
      throw new AppError('Pregunta no encontrada', 404);
    }

    // TODO: Verify answeredBy is the creator or admin
    // For now, we'll allow any user to answer

    const result = await qaRepository.answerQuestion(questionId, {
      answer,
      answeredBy,
    });

    if (!result) {
      throw new AppError('Error al responder la pregunta', 500);
    }

    logger.info({ questionId, answeredBy }, 'Question answered');
    return result;
  },

  /**
   * Toggle question publication (creator or admin)
   */
  async togglePublishQuestion(
    questionId: string,
    isPublished: boolean
  ): Promise<ProductQuestion> {
    const question = await qaRepository.getQuestionById(questionId);
    if (!question) {
      throw new AppError('Pregunta no encontrada', 404);
    }

    const result = await qaRepository.togglePublish(questionId, isPublished);
    if (!result) {
      throw new AppError('Error al actualizar la pregunta', 500);
    }

    logger.info({ questionId, isPublished }, 'Question publication toggled');
    return result;
  },

  /**
   * Delete a question
   */
  async deleteQuestion(questionId: string): Promise<boolean> {
    const question = await qaRepository.getQuestionById(questionId);
    if (!question) {
      throw new AppError('Pregunta no encontrada', 404);
    }

    // TODO: Verify user is the question owner, creator, or admin

    return qaRepository.deleteQuestion(questionId);
  },

  // =========================================================================
  // Votes
  // =========================================================================

  /**
   * Vote on a question
   */
  async voteQuestion(
    questionId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful'
  ): Promise<{ helpful: number; not_helpful: number; userVote: string | null }> {
    const question = await qaRepository.getQuestionById(questionId);
    if (!question) {
      throw new AppError('Pregunta no encontrada', 404);
    }

    // Vote
    await qaRepository.vote(questionId, userId, voteType);

    // Get updated counts
    const counts = await qaRepository.getVoteCounts(questionId);
    const userVote = await qaRepository.getUserVote(questionId, userId);

    logger.info({ questionId, userId, voteType }, 'Question voted');

    return {
      ...counts,
      userVote: userVote?.vote_type || null,
    };
  },

  /**
   * Remove vote from a question
   */
  async removeVote(
    questionId: string,
    userId: string
  ): Promise<{ helpful: number; not_helpful: number; userVote: string | null }> {
    await qaRepository.removeVote(questionId, userId);

    // Get updated counts
    const counts = await qaRepository.getVoteCounts(questionId);

    logger.info({ questionId, userId }, 'Question vote removed');

    return {
      ...counts,
      userVote: null,
    };
  },

  // =========================================================================
  // FAQs
  // =========================================================================

  /**
   * Create a FAQ for a product
   */
  async createFAQ(
    productId: string,
    question: string,
    answer: string,
    sortOrder?: number
  ): Promise<ProductFAQ> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // TODO: Verify user is the product creator

    const result = await qaRepository.createFAQ({
      productId,
      question,
      answer,
      sortOrder: sortOrder ?? 0,
    });

    logger.info({ productId, faqId: result.id }, 'FAQ created');
    return result;
  },

  /**
   * Get FAQs for a product (public)
   */
  async getFAQs(
    productId: string,
    includeInactive: boolean = false
  ): Promise<ProductFAQ[]> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return qaRepository.getFAQsByProduct(productId, includeInactive);
  },

  /**
   * Get a single FAQ by ID
   */
  async getFAQById(faqId: string): Promise<ProductFAQ | null> {
    return qaRepository.getFAQById(faqId);
  },

  /**
   * Update a FAQ
   */
  async updateFAQ(
    faqId: string,
    data: { question?: string; answer?: string; sortOrder?: number; isActive?: boolean }
  ): Promise<ProductFAQ> {
    const faq = await qaRepository.getFAQById(faqId);
    if (!faq) {
      throw new AppError('FAQ no encontrado', 404);
    }

    // TODO: Verify user is the product creator

    const result = await qaRepository.updateFAQ(faqId, data);
    if (!result) {
      throw new AppError('Error al actualizar el FAQ', 500);
    }

    logger.info({ faqId }, 'FAQ updated');
    return result;
  },

  /**
   * Delete a FAQ
   */
  async deleteFAQ(faqId: string): Promise<boolean> {
    const faq = await qaRepository.getFAQById(faqId);
    if (!faq) {
      throw new AppError('FAQ no encontrado', 404);
    }

    // TODO: Verify user is the product creator

    return qaRepository.deleteFAQ(faqId);
  },

  /**
   * Reorder FAQs for a product
   */
  async reorderFAQs(productId: string, faqIds: string[]): Promise<void> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // TODO: Verify user is the product creator

    await qaRepository.reorderFAQs(productId, faqIds);

    logger.info({ productId, faqIds }, 'FAQs reordered');
  },
};