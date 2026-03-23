/**
 * Review Service
 * Phase 3: Reviews/Ratings
 * Manages reviews, votes, and settings for products
 */

import { reviewRepository, type ProductReview, type ProductReviewSettings } from '../../repositories/ai/review.repository';
import { productRepository } from '../../repositories/product.repository';
import { orderRepository } from '../../repositories/order.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

export const reviewService = {
  // =========================================================================
  // Reviews
  // =========================================================================

  /**
   * Create a review for a product
   */
  async createReview(
    productId: string,
    userId: string,
    rating: number,
    content: string,
    title?: string
  ): Promise<ProductReview> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // Check if user already reviewed
    const existingReview = await reviewRepository.getUserReview(productId, userId);
    if (existingReview) {
      throw new AppError('Ya has publicado una review para este producto', 400);
    }

    // Check if user purchased the product (verified purchase) using checkAccess
    const hasPurchased = await orderRepository.checkAccess(userId, productId);

    // Get review settings to check if reviews are allowed
    const settings = await reviewRepository.getSettings(productId);
    if (settings && !settings.allow_reviews) {
      throw new AppError('Las reviews están desactivadas para este producto', 403);
    }

    // If verified purchase is required and user hasn't purchased
    if (settings?.require_verified_purchase && !hasPurchased) {
      throw new AppError('Necesitas haber comprado el producto para publicar una review', 403);
    }

    // Build review data - only include title if provided
    const reviewData: { productId: string; userId: string; rating: number; content: string; isVerifiedPurchase: boolean } & ({ title: string } | {}) = {
      productId,
      userId,
      rating,
      content,
      isVerifiedPurchase: hasPurchased || false,
    };
    
    if (title) {
      Object.assign(reviewData, { title });
    }
    
    const result = await reviewRepository.createReview(reviewData);

    // Auto-publish if enabled in settings
    if (settings?.auto_publish) {
      await reviewRepository.updateReview(result.id, { isPublished: true });
    }

    logger.info({ productId, userId, reviewId: result.id, rating }, 'Review created');
    return result;
  },

  /**
   * Get reviews for a product (public)
   */
  async getReviews(
    productId: string,
    includeUnpublished: boolean = false,
    limit: number = 20,
    offset: number = 0
  ): Promise<{ reviews: ProductReview[]; total: number; avgRating: number }> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return reviewRepository.getReviewsByProduct(productId, includeUnpublished, limit, offset);
  },

  /**
   * Get a single review by ID
   */
  async getReviewById(reviewId: string): Promise<ProductReview | null> {
    return reviewRepository.getReviewById(reviewId);
  },

  /**
   * Update a review
   */
  async updateReview(
    reviewId: string,
    data: { rating?: number; title?: string; content?: string; isPublished?: boolean }
  ): Promise<ProductReview> {
    const review = await reviewRepository.getReviewById(reviewId);
    if (!review) {
      throw new AppError('Review no encontrada', 404);
    }

    // TODO: Verify user is the review owner, creator, or admin

    const result = await reviewRepository.updateReview(reviewId, data);
    if (!result) {
      throw new AppError('Error al actualizar la review', 500);
    }

    logger.info({ reviewId }, 'Review updated');
    return result;
  },

  /**
   * Delete a review
   */
  async deleteReview(reviewId: string): Promise<boolean> {
    const review = await reviewRepository.getReviewById(reviewId);
    if (!review) {
      throw new AppError('Review no encontrada', 404);
    }

    // TODO: Verify user is the review owner, creator, or admin

    return reviewRepository.deleteReview(reviewId);
  },

  // =========================================================================
  // Votes
  // =========================================================================

  /**
   * Vote on a review
   */
  async voteReview(
    reviewId: string,
    userId: string,
    voteType: 'helpful' | 'not_helpful'
  ): Promise<{ helpful: number; not_helpful: number; userVote: string | null }> {
    const review = await reviewRepository.getReviewById(reviewId);
    if (!review) {
      throw new AppError('Review no encontrada', 404);
    }

    // Vote
    await reviewRepository.vote(reviewId, userId, voteType);

    // Get updated counts
    const counts = await reviewRepository.getVoteCounts(reviewId);
    const userVote = await reviewRepository.getUserVote(reviewId, userId);

    logger.info({ reviewId, userId, voteType }, 'Review voted');

    return {
      ...counts,
      userVote: userVote?.vote_type || null,
    };
  },

  /**
   * Remove vote from a review
   */
  async removeVote(
    reviewId: string,
    userId: string
  ): Promise<{ helpful: number; not_helpful: number; userVote: string | null }> {
    await reviewRepository.removeVote(reviewId, userId);

    // Get updated counts
    const counts = await reviewRepository.getVoteCounts(reviewId);

    logger.info({ reviewId, userId }, 'Review vote removed');

    return {
      ...counts,
      userVote: null,
    };
  },

  // =========================================================================
  // Settings
  // =========================================================================

  /**
   * Get review settings for a product
   */
  async getSettings(productId: string): Promise<ProductReviewSettings | null> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return reviewRepository.getSettings(productId);
  },

  /**
   * Update review settings for a product
   */
  async updateSettings(
    productId: string,
    data: {
      allowReviews?: boolean;
      requireVerifiedPurchase?: boolean;
      autoPublish?: boolean;
      minRating?: number;
      maxRating?: number;
    }
  ): Promise<ProductReviewSettings> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    // TODO: Verify user is the product creator

    const result = await reviewRepository.upsertSettings(productId, data);
    logger.info({ productId }, 'Review settings updated');
    return result;
  },

  /**
   * Get rating distribution for a product
   */
  async getRatingDistribution(productId: string): Promise<{ rating: number; count: number }[]> {
    // Verify product exists
    const product = await productRepository.getProductById(productId);
    if (!product) {
      throw new AppError('Producto no encontrado', 404);
    }

    return reviewRepository.getRatingDistribution(productId);
  },
};