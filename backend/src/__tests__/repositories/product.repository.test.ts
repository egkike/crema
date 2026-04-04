import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB pool
const createMockQuery = () => vi.fn();
const createMockConnect = () => vi.fn();
let mockQuery = createMockQuery();
let mockConnect = createMockConnect();

vi.mock('../../db/postgres', () => ({
  default: { 
    query: (...args: any[]) => mockQuery(...args),
    connect: (() => ({ query: mockConnect, release: vi.fn() })) 
  },
}));

vi.mock('../../config/index', () => ({
  config: { db: { schema: 'public' } },
}));

vi.mock('../../utils/logger', () => ({
  default: { error: vi.fn(), warn: vi.fn() },
}));

describe('productRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery = createMockQuery();
    mockConnect = createMockConnect();
  });

  describe('mapRowToProduct', () => {
    it('should map row with numeric conversions', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      
      const row = {
        id: 'prod-1',
        slug: 'test-product',
        creator_id: 'user-1',
        title: 'Test Product',
        description: 'Description',
        type: 'course',
        content_url: 'https://example.com',
        affiliate_commission_percent: '10.5',
        size_bytes: '1024',
        has_structured_content: true,
        status: 'published',
        created_at: new Date(),
        updated_at: new Date(),
        guarantee_days: 7,
        prices: [{ currency: 'ARS', amount: 1000 }],
      };

      const result = productRepository.mapRowToProduct(row);

      expect(result.id).toBe('prod-1');
      expect(result.affiliate_commission_percent).toBe(10.5);
      expect(result.size_bytes).toBe(1024);
    });

    it('should handle null values', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      
      const row = {
        id: 'prod-1',
        slug: 'test',
        creator_id: 'user-1',
        title: 'Test',
        description: null,
        type: 'course',
        content_url: null,
        affiliate_commission_percent: '0',
        size_bytes: null,
        has_structured_content: false,
        status: 'draft',
        created_at: new Date(),
        updated_at: new Date(),
        guarantee_days: undefined,
        prices: [],
      };

      const result = productRepository.mapRowToProduct(row);

      expect(result.description).toBeNull();
      expect(result.size_bytes).toBe(0);
      expect(result.guarantee_days).toBeNull();
    });
  });

  describe('getPublicProducts', () => {
    it('should return published products', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1', status: 'published' }] });

      const result = await productRepository.getPublicProducts();

      expect(result).toHaveLength(1);
    });
  });

  describe('getProductStatus', () => {
    it('should return status for existing product', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ status: 'published' }] });

      const result = await productRepository.getProductStatus('prod-1');

      expect(result).toBe('published');
    });

    it('should return null for non-existent product', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await productRepository.getProductStatus('not-found');

      expect(result).toBeNull();
    });
  });

  describe('getProductByIdOrSlug', () => {
    it('should find product by ID', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1' }] });

      const result = await productRepository.getProductByIdOrSlug('prod-1');

      expect(result).not.toBeNull();
    });

    it('should find product by slug', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1' }] });

      const result = await productRepository.getProductByIdOrSlug('my-slug');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await productRepository.getProductByIdOrSlug('not-found');

      expect(result).toBeNull();
    });
  });

  describe('getProductsByCreator', () => {
    it('should return products by creator', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1' }, { id: 'prod-2' }] });

      const result = await productRepository.getProductsByCreator('user-1');

      expect(result).toHaveLength(2);
    });
  });

  describe('getPriceByCurrency', () => {
    it('should return price for currency', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ amount: '1000.00' }] });

      const result = await productRepository.getPriceByCurrency('prod-1', 'ARS');

      expect(result).toBe(1000);
    });

    it('should return null when price not found', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await productRepository.getPriceByCurrency('prod-1', 'USD');

      expect(result).toBeNull();
    });
  });

  describe('countProductsByCreator', () => {
    it('should return count', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      const result = await productRepository.countProductsByCreator('user-1');

      expect(result).toBe(5);
    });
  });

  describe('countPublishedByCreator', () => {
    it('should return published count', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ count: 3 }] });

      const result = await productRepository.countPublishedByCreator('user-1');

      expect(result).toBe(3);
    });
  });

  describe('deleteProduct', () => {
    it('should return true when deleted', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await productRepository.deleteProduct('prod-1');

      expect(result).toBe(true);
    });

    it('should return false when not found', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await productRepository.deleteProduct('not-found');

      expect(result).toBe(false);
    });
  });

  describe('getAvailableForAffiliate', () => {
    it('should return products excluding creator', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1' }] });

      const result = await productRepository.getAvailableForAffiliate('affiliate-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('getProductsByIds', () => {
    it('should return products by IDs', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'prod-1' }] });

      const result = await productRepository.getProductsByIds(['prod-1', 'prod-2']);

      expect(result).toHaveLength(1);
    });

    it('should return empty array for empty input', async () => {
      const { productRepository } = await import('../../repositories/product.repository');

      const result = await productRepository.getProductsByIds([]);

      expect(result).toHaveLength(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('toggleLessonProgress', () => {
    it('should insert progress when completed', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await productRepository.toggleLessonProgress('user-1', 'prod-1', 'lesson-1', true);

      expect(mockQuery).toHaveBeenCalled();
    });

    it('should delete progress when not completed', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await productRepository.toggleLessonProgress('user-1', 'prod-1', 'lesson-1', false);

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('getUserProductProgress', () => {
    it('should return progress stats', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ total_lessons: 10, completed_lessons: 5 }] });

      const result = await productRepository.getUserProductProgress('prod-1', 'user-1');

      expect(result.total_lessons).toBe(10);
      expect(result.completed_lessons).toBe(5);
      expect(result.percent).toBe(50);
    });

    it('should handle zero lessons', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ total_lessons: 0, completed_lessons: 0 }] });

      const result = await productRepository.getUserProductProgress('prod-1', 'user-1');

      expect(result.percent).toBe(0);
    });
  });

  describe('getLessonQuiz', () => {
    it('should return quiz for lesson', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ id: 'quiz-1', lesson_id: 'lesson-1' }] });

      const result = await productRepository.getLessonQuiz('lesson-1');

      expect(result).not.toBeNull();
    });

    it('should return null when no quiz', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await productRepository.getLessonQuiz('lesson-1');

      expect(result).toBeNull();
    });
  });

  describe('getUserQuizStatus', () => {
    it('should return quiz status', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ best_score: 80, attempts_count: 3, has_passed: true }] });

      const result = await productRepository.getUserQuizStatus('user-1', 'quiz-1');

      expect(result.best_score).toBe(80);
      expect(result.attempts_count).toBe(3);
      expect(result.has_passed).toBe(true);
    });
  });

  describe('saveQuizAttempt', () => {
    it('should insert quiz attempt', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      await productRepository.saveQuizAttempt({
        userId: 'user-1',
        quizId: 'quiz-1',
        score: 75,
        passed: true,
        answers: { q1: 'a' },
      });

      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('getCertificateByCode', () => {
    it('should return certificate with joins', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [{ certificate_code: 'code-123' }] });

      const result = await productRepository.getCertificateByCode('code-123');

      expect(result).not.toBeNull();
    });

    it('should return null when not found', async () => {
      const { productRepository } = await import('../../repositories/product.repository');
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await productRepository.getCertificateByCode('not-found');

      expect(result).toBeNull();
    });
  });
});
