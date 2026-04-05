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
  });

  describe('evaluateGuaranteeStatus', () => {
    it('should not invalidate if no order exists', async () => {
      mockGetActiveOrderWithBuyer.mockResolvedValue(null);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { id: PRODUCT_ID, has_structured_content: true }
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
        { id: PRODUCT_ID, has_structured_content: true }
      );

      expect(mockGetUserProductProgress).not.toHaveBeenCalled();
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
  });
});