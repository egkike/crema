import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock productRepository
vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn() as any,
  },
}));

// Mock reviewRepository
vi.mock('../../repositories/ai/review.repository', () => ({
  reviewRepository: {
    createReview: vi.fn() as any,
    getReviewsByProduct: vi.fn() as any,
    getReviewById: vi.fn() as any,
    getUserReview: vi.fn() as any,
    updateReview: vi.fn() as any,
    deleteReview: vi.fn() as any,
    vote: vi.fn() as any,
    getVoteCounts: vi.fn() as any,
    getUserVote: vi.fn() as any,
    removeVote: vi.fn() as any,
    getSettings: vi.fn() as any,
    upsertSettings: vi.fn() as any,
    getRatingDistribution: vi.fn() as any,
  },
}));

// Mock orderRepository
vi.mock('../../repositories/order.repository', () => ({
  orderRepository: {
    checkAccess: vi.fn() as any,
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { reviewService } from '../../services/ai/review.service';
import { productRepository } from '../../repositories/product.repository';
import { reviewRepository } from '../../repositories/ai/review.repository';
import { orderRepository } from '../../repositories/order.repository';
import { AppError } from '../../errors/AppError';

describe('review.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Reviews
  // =========================================================================

  describe('createReview', () => {
    it('should create review when product exists and user has not reviewed', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = { allow_reviews: true, require_verified_purchase: false };
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        title: 'Great product',
        content: 'Loved it!',
        is_verified_purchase: true,
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getUserReview).mockResolvedValue(null);
      vi.mocked(orderRepository.checkAccess).mockResolvedValue(true);
      vi.mocked(reviewRepository.getSettings).mockResolvedValue(mockSettings as any);
      vi.mocked(reviewRepository.createReview).mockResolvedValue(mockReview as any);

      const result = await reviewService.createReview('prod-1', 'user-1', 5, 'Loved it!', 'Great product');

      expect(result.id).toBe('r-1');
    });

    it('should throw when product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(reviewService.createReview('prod-1', 'user-1', 5, 'content'))
        .rejects.toThrow(AppError);
      await expect(reviewService.createReview('prod-1', 'user-1', 5, 'content'))
        .rejects.toThrow('Producto no encontrado');
    });

    it('should throw when user already reviewed', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getUserReview).mockResolvedValue({ id: 'r-1' } as any);

      await expect(reviewService.createReview('prod-1', 'user-1', 5, 'content'))
        .rejects.toThrow('Ya has publicado una review para este producto');
    });

    it('should throw when reviews are disabled', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = { allow_reviews: false };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getUserReview).mockResolvedValue(null);
      vi.mocked(reviewRepository.getSettings).mockResolvedValue(mockSettings as any);

      await expect(reviewService.createReview('prod-1', 'user-1', 5, 'content'))
        .rejects.toThrow('Las reviews están desactivadas para este producto');
    });

    it('should throw when verified purchase required but user has not purchased', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = { allow_reviews: true, require_verified_purchase: true };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getUserReview).mockResolvedValue(null);
      vi.mocked(orderRepository.checkAccess).mockResolvedValue(false);
      vi.mocked(reviewRepository.getSettings).mockResolvedValue(mockSettings as any);

      await expect(reviewService.createReview('prod-1', 'user-1', 5, 'content'))
        .rejects.toThrow('Necesitas haber comprado el producto para publicar una review');
    });

    it('should auto-publish when enabled in settings', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = { allow_reviews: true, auto_publish: true };
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Loved it!',
        is_verified_purchase: false,
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getUserReview).mockResolvedValue(null);
      vi.mocked(orderRepository.checkAccess).mockResolvedValue(false);
      vi.mocked(reviewRepository.getSettings).mockResolvedValue(mockSettings as any);
      vi.mocked(reviewRepository.createReview).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.updateReview).mockResolvedValue({ ...mockReview, is_published: true } as any);

      await reviewService.createReview('prod-1', 'user-1', 5, 'Loved it!');

      expect(reviewRepository.updateReview).toHaveBeenCalled();
    });
  });

  describe('getReviews', () => {
    it('should return reviews when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockResult = {
        reviews: [
          {
            id: 'r-1',
            product_id: 'prod-1',
            user_id: 'user-1',
            rating: 5,
            content: 'Great!',
            is_published: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        total: 1,
        avgRating: 5,
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getReviewsByProduct).mockResolvedValue(mockResult as any);

      const result = await reviewService.getReviews('prod-1');

      expect(result.reviews).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw when product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(reviewService.getReviews('prod-1'))
        .rejects.toThrow(AppError);
    });

    it('should pass includeUnpublished parameter', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getReviewsByProduct).mockResolvedValue({ reviews: [], total: 0, avgRating: 0 } as any);

      await reviewService.getReviews('prod-1', true, 50, 10);

      expect(reviewRepository.getReviewsByProduct).toHaveBeenCalledWith('prod-1', true, 50, 10);
    });
  });

  describe('getReviewById', () => {
    it('should return review when found', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);

      const result = await reviewService.getReviewById('r-1');

      expect(result?.id).toBe('r-1');
    });

    it('should return null when not found', async () => {
      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(null);

      const result = await reviewService.getReviewById('r-1');

      expect(result).toBeNull();
    });
  });

  describe('updateReview', () => {
    it('should update review when it exists', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUpdated = { ...mockReview, rating: 4 };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.updateReview).mockResolvedValue(mockUpdated as any);

      const result = await reviewService.updateReview('r-1', { rating: 4 });

      expect(result.rating).toBe(4);
    });

    it('should throw when review not found', async () => {
      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(null);

      await expect(reviewService.updateReview('r-1', { rating: 4 }))
        .rejects.toThrow(AppError);
    });

    it('should throw when update fails', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.updateReview).mockResolvedValue(null);

      await expect(reviewService.updateReview('r-1', { rating: 4 }))
        .rejects.toThrow(AppError);
    });
  });

  describe('deleteReview', () => {
    it('should delete review when it exists', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.deleteReview).mockResolvedValue(true);

      const result = await reviewService.deleteReview('r-1');

      expect(result).toBe(true);
    });

    it('should throw when review not found', async () => {
      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(null);

      await expect(reviewService.deleteReview('r-1'))
        .rejects.toThrow(AppError);
    });
  });

  // =========================================================================
  // Votes
  // =========================================================================

  describe('voteReview', () => {
    it('should vote and return counts', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUserVote = {
        id: 'vote-1',
        review_id: 'r-1',
        user_id: 'user-1',
        vote_type: 'helpful' as const,
        created_at: new Date(),
      };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.vote).mockResolvedValue(mockUserVote as any);
      vi.mocked(reviewRepository.getVoteCounts).mockResolvedValue({ helpful: 5, not_helpful: 2 });
      vi.mocked(reviewRepository.getUserVote).mockResolvedValue(mockUserVote as any);

      const result = await reviewService.voteReview('r-1', 'user-1', 'helpful');

      expect(result.helpful).toBe(5);
      expect(result.not_helpful).toBe(2);
      expect(result.userVote).toBe('helpful');
    });

    it('should throw when review not found', async () => {
      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(null);

      await expect(reviewService.voteReview('r-1', 'user-1', 'helpful'))
        .rejects.toThrow(AppError);
    });

    it('should return null userVote when no vote exists', async () => {
      const mockReview = {
        id: 'r-1',
        product_id: 'prod-1',
        user_id: 'user-1',
        rating: 5,
        content: 'Great!',
        is_published: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUserVote = {
        id: 'vote-1',
        review_id: 'r-1',
        user_id: 'user-1',
        vote_type: 'helpful' as const,
        created_at: new Date(),
      };

      vi.mocked(reviewRepository.getReviewById).mockResolvedValue(mockReview as any);
      vi.mocked(reviewRepository.vote).mockResolvedValue(mockUserVote as any);
      vi.mocked(reviewRepository.getVoteCounts).mockResolvedValue({ helpful: 5, not_helpful: 2 });
      vi.mocked(reviewRepository.getUserVote).mockResolvedValue(null);

      const result = await reviewService.voteReview('r-1', 'user-1', 'helpful');

      expect(result.userVote).toBeNull();
    });
  });

  describe('removeVote', () => {
    it('should remove vote and return counts', async () => {
      vi.mocked(reviewRepository.removeVote).mockResolvedValue(true);
      vi.mocked(reviewRepository.getVoteCounts).mockResolvedValue({ helpful: 4, not_helpful: 2 });

      const result = await reviewService.removeVote('r-1', 'user-1');

      expect(result.helpful).toBe(4);
      expect(result.not_helpful).toBe(2);
      expect(result.userVote).toBeNull();
    });
  });

  // =========================================================================
  // Settings
  // =========================================================================

  describe('getSettings', () => {
    it('should return settings when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = {
        product_id: 'prod-1',
        allow_reviews: true,
        require_verified_purchase: false,
        auto_publish: true,
        min_rating: 1,
        max_rating: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getSettings).mockResolvedValue(mockSettings as any);

      const result = await reviewService.getSettings('prod-1');

      expect(result?.allow_reviews).toBe(true);
    });

    it('should throw when product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(reviewService.getSettings('prod-1'))
        .rejects.toThrow(AppError);
    });
  });

  describe('updateSettings', () => {
    it('should update settings when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = {
        product_id: 'prod-1',
        allow_reviews: true,
        require_verified_purchase: false,
        auto_publish: true,
        min_rating: 1,
        max_rating: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.upsertSettings).mockResolvedValue(mockSettings as any);

      const result = await reviewService.updateSettings('prod-1', { allowReviews: false });

      expect(result.allow_reviews).toBe(true); // returns from upsert
    });

    it('should throw when product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(reviewService.updateSettings('prod-1', { allowReviews: false }))
        .rejects.toThrow(AppError);
    });

    it('should accept multiple settings to update', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockSettings = {
        product_id: 'prod-1',
        allow_reviews: true,
        require_verified_purchase: true,
        auto_publish: false,
        min_rating: 1,
        max_rating: 5,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.upsertSettings).mockResolvedValue(mockSettings as any);

      await reviewService.updateSettings('prod-1', {
        allowReviews: true,
        requireVerifiedPurchase: true,
        autoPublish: false,
      });

      expect(reviewRepository.upsertSettings).toHaveBeenCalledWith('prod-1', {
        allowReviews: true,
        requireVerifiedPurchase: true,
        autoPublish: false,
      });
    });
  });

  describe('getRatingDistribution', () => {
    it('should return distribution when product exists', async () => {
      const mockProduct = { id: 'prod-1', title: 'Test Product' };
      const mockDistribution = [
        { rating: 5, count: 10 },
        { rating: 4, count: 5 },
        { rating: 3, count: 2 },
      ];

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);
      vi.mocked(reviewRepository.getRatingDistribution).mockResolvedValue(mockDistribution as any);

      const result = await reviewService.getRatingDistribution('prod-1');

      expect(result).toHaveLength(3);
      expect(result[0].rating).toBe(5);
    });

    it('should throw when product not found', async () => {
      vi.mocked(productRepository.getProductById).mockResolvedValue(null);

      await expect(reviewService.getRatingDistribution('prod-1'))
        .rejects.toThrow(AppError);
    });
  });
});