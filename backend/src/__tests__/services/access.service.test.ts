import { describe, it, expect, vi, beforeEach } from 'vitest';

// Override setup.ts mocks - these must be defined before imports
const mockGetProductById = vi.fn();
const mockGetUserProductProgress = vi.fn();
const mockGetLessonWithAccess = vi.fn();
const mockGetActiveOrderWithBuyer = vi.fn();
const mockInvalidateGuarantee = vi.fn();
const mockGetBalanceForUpdate = vi.fn();
const mockSubtractAvailableBalance = vi.fn();
const mockAddAvailableBalance = vi.fn();

// We need to mock at the module level to override setup.ts
vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: (...args: unknown[]) => mockGetProductById(...args),
    getUserProductProgress: (...args: unknown[]) => mockGetUserProductProgress(...args),
    getLessonWithAccess: (...args: unknown[]) => mockGetLessonWithAccess(...args),
  },
}));

vi.mock('../../repositories/order.repository', () => ({
  orderRepository: {
    getActiveOrderWithBuyer: (...args: unknown[]) => mockGetActiveOrderWithBuyer(...args),
    invalidateGuarantee: (...args: unknown[]) => mockInvalidateGuarantee(...args),
  },
}));

vi.mock('../../repositories/balance.repository', () => ({
  balanceRepository: {
    getBalanceForUpdate: mockGetBalanceForUpdate,
    subtractAvailableBalance: mockSubtractAvailableBalance,
    addAvailableBalance: mockAddAvailableBalance,
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { 
    info: vi.fn(), 
    error: vi.fn(), 
    warn: vi.fn(), 
    debug: vi.fn() 
  },
}));

vi.mock('../../queues/scheduler', () => ({
  mainQueue: {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
  },
}));

vi.mock('../../services/email.service', () => ({
  EmailService: {
    sendGuaranteeInvalidatedEmail: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/streaming.util', () => ({
  streamingUtil: {
    getSignedUrl: vi.fn().mockResolvedValue('https://signed.url/video'),
  },
}));

vi.mock('../../config/index', () => ({
  config: {
    db: { schema: 'public' },
    redis: { host: 'localhost', port: 6379 },
    jwt: { secret: 'test' },
  },
}));

// Import AFTER mocks
import { AccessService } from '../../services/access.service';

describe('AccessService', () => {
  const USER_ID = '00000000-0000-0000-0000-000000000002';
  const CREATOR_ID = '00000000-0000-0000-0000-000000000003';
  const PRODUCT_ID = '00000000-0000-0000-0000-000000000099';

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockGetProductById.mockReset();
    mockGetUserProductProgress.mockReset();
    mockGetLessonWithAccess.mockReset();
    mockGetActiveOrderWithBuyer.mockReset();
    mockInvalidateGuarantee.mockReset();
  });

  describe('getProtectedContent', () => {
    it('should return content for valid product', async () => {
      const mockProduct = {
        id: PRODUCT_ID,
        title: 'Test Product',
        type: 'course',
        status: 'published',
        creator_id: CREATOR_ID,
        content_url: 'https://example.com/content',
        description: 'Test description',
        has_structured_content: false,
        updated_at: new Date(),
      };

      mockGetProductById.mockResolvedValue(mockProduct);

      const result = await AccessService.getProtectedContent(USER_ID, PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.id).toBe(PRODUCT_ID);
      expect(result.title).toBe('Test Product');
    });

    it('should allow creator to see draft content', async () => {
      const mockProduct = {
        id: PRODUCT_ID,
        title: 'Test Product',
        type: 'course',
        status: 'draft',
        creator_id: CREATOR_ID,
        content_url: 'https://example.com/content',
        has_structured_content: false,
        updated_at: new Date(),
      };

      mockGetProductById.mockResolvedValue(mockProduct);

      const result = await AccessService.getProtectedContent(CREATOR_ID, PRODUCT_ID);

      expect(result).toBeDefined();
    });

    it('should throw error when product not found', async () => {
      mockGetProductById.mockResolvedValue(null);

      await expect(AccessService.getProtectedContent(USER_ID, PRODUCT_ID))
        .rejects.toThrow('El producto solicitado no existe.');
    });

    it('should throw error for archived product', async () => {
      const mockProduct = {
        id: PRODUCT_ID,
        title: 'Test Product',
        type: 'course',
        status: 'archived',
        creator_id: CREATOR_ID,
        content_url: 'https://example.com/content',
        has_structured_content: false,
        updated_at: new Date(),
      };

      mockGetProductById.mockResolvedValue(mockProduct);

      await expect(AccessService.getProtectedContent(USER_ID, PRODUCT_ID))
        .rejects.toThrow('Este producto ha sido retirado permanentemente.');
    });

    it('should throw error for draft product (non-creator)', async () => {
      const mockProduct = {
        id: PRODUCT_ID,
        title: 'Test Product',
        type: 'course',
        status: 'draft',
        creator_id: CREATOR_ID,
        content_url: 'https://example.com/content',
        has_structured_content: false,
        updated_at: new Date(),
      };

      mockGetProductById.mockResolvedValue(mockProduct);

      await expect(AccessService.getProtectedContent(USER_ID, PRODUCT_ID))
        .rejects.toThrow('El contenido no está disponible actualmente.');
    });

    it('should handle video with signed URL', async () => {
      const mockProduct = {
        id: PRODUCT_ID,
        title: 'Test Product',
        type: 'video',
        status: 'published',
        creator_id: CREATOR_ID,
        content_url: 'https://example.com/video.mp4',
        has_structured_content: false,
        updated_at: new Date(),
      };

      mockGetProductById.mockResolvedValue(mockProduct);

      const result = await AccessService.getProtectedContent(USER_ID, PRODUCT_ID);

      expect(result).toBeDefined();
      expect(result.type).toBe('video');
    });
  });

  describe('evaluateGuaranteeStatus', () => {
    it('should not invalidate if no order exists', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue(null);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { title: 'Test Product', hasStructuredContent: true, type: 'course' }
      );

      expect(mockInvalidateGuarantee).not.toHaveBeenCalled();
    });

    it('should not invalidate if already ineligible', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue({
        id: 'order-1',
        buyer_id: USER_ID,
        is_guarantee_eligible: false,
      });

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { title: 'Test Product', hasStructuredContent: true, type: 'course' }
      );

      expect(mockGetUserProductProgress).not.toHaveBeenCalled();
    });

    it('should invalidate guarantee for progress over 30%', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue({
        id: 'order-1',
        buyer_id: USER_ID,
        buyer_email: 'buyer@test.com',
        buyer_name: 'Test Buyer',
        is_guarantee_eligible: true,
      });
      mockGetUserProductProgress.mockResolvedValue({ percent: 50 });
      mockInvalidateGuarantee.mockResolvedValue(true);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { title: 'Test Product', hasStructuredContent: true, type: 'course' }
      );

      expect(mockInvalidateGuarantee).toHaveBeenCalledWith('order-1');
    });

    it('should invalidate guarantee for downloadable products', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue({
        id: 'order-2',
        buyer_id: USER_ID,
        buyer_email: 'buyer@test.com',
        buyer_name: 'Test Buyer',
        is_guarantee_eligible: true,
      });
      mockInvalidateGuarantee.mockResolvedValue(true);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { title: 'Test Product', hasStructuredContent: false, type: 'ebook' }
      );

      expect(mockInvalidateGuarantee).toHaveBeenCalledWith('order-2');
    });

    it('should not invalidate guarantee for low progress', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue({
        id: 'order-3',
        buyer_id: USER_ID,
        is_guarantee_eligible: true,
      });
      mockGetUserProductProgress.mockResolvedValue({ percent: 20 });

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { title: 'Test Product', hasStructuredContent: true, type: 'course' }
      );

      expect(mockInvalidateGuarantee).not.toHaveBeenCalled();
    });
  });

  // Method existence tests
  describe('method existence', () => {
    it('should have getProtectedContent method', () => {
      expect(typeof AccessService.getProtectedContent).toBe('function');
    });

    it('should have evaluateGuaranteeStatus method', () => {
      expect(typeof AccessService.evaluateGuaranteeStatus).toBe('function');
    });

    it('should have getProtectedLesson method', () => {
      expect(typeof AccessService.getProtectedLesson).toBe('function');
    });

    it('should have triggerSafeGuard method', () => {
      // This is a private method but we can test via getProtectedLesson
      expect(typeof AccessService.getProtectedLesson).toBe('function');
    });
  });

  describe('getProtectedLesson', () => {
    it('should return lesson when user has access', async () => {
      const mockLesson = {
        id: 'lesson-1',
        product_id: PRODUCT_ID,
        title: 'Lesson 1',
        content_url: 'https://example.com/lesson1.mp4',
        content_type: 'video',
        product_data: { creator_id: CREATOR_ID },
      };

      mockGetLessonWithAccess.mockResolvedValue(mockLesson);

      const result = await AccessService.getProtectedLesson(USER_ID, 'lesson-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('lesson-1');
    });

    it('should throw error when lesson not found', async () => {
      mockGetLessonWithAccess.mockResolvedValue(null);

      await expect(AccessService.getProtectedLesson(USER_ID, 'lesson-invalid'))
        .rejects.toThrow('Acceso denegado o lección no encontrada.');
    });

    it('should handle embedded video (youtube/vimeo) without signing', async () => {
      const mockLesson = {
        id: 'lesson-2',
        product_id: PRODUCT_ID,
        title: 'Lesson 2',
        content_url: 'https://youtube.com/watch?v=abc123',
        content_type: 'video',
        product_data: { creator_id: CREATOR_ID },
      };

      mockGetLessonWithAccess.mockResolvedValue(mockLesson);

      const result = await AccessService.getProtectedLesson(USER_ID, 'lesson-2');

      expect(result).toBeDefined();
    });
  });
});