import { describe, it, expect, vi, beforeEach } from 'vitest';

import { USER_ID, CREATOR_ID, PRODUCT_ID } from '../setup';
// eslint-disable-next-line import/order
import { AccessService } from '../../services/access.service';

vi.mock('../../repositories/product.repository', () => ({
  productRepository: {
    getProductById: vi.fn(),
    getUserProductProgress: vi.fn(),
    getLessonWithAccess: vi.fn(),
  },
}));

vi.mock('../../repositories/order.repository', () => ({
  orderRepository: {
    getActiveOrderWithBuyer: vi.fn(),
    invalidateGuarantee: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
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
  },
}));

vi.mock('../../config/redis', () => ({
  redisConnection: {
    host: 'localhost',
    port: 6379,
  },
}));

import { productRepository } from '../../repositories/product.repository';
import { orderRepository } from '../../repositories/order.repository';

describe('AccessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);

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
        description: 'Test description',
        has_structured_content: false,
        updated_at: new Date(),
      };

      vi.mocked(productRepository.getProductById).mockResolvedValue(mockProduct as any);

      const result = await AccessService.getProtectedContent(CREATOR_ID, PRODUCT_ID);

      expect(result).toBeDefined();
    });
  });

  describe('evaluateGuaranteeStatus', () => {
    it('should not invalidate if no order exists', async () => {
      vi.mocked(orderRepository.getActiveOrderWithBuyer).mockResolvedValue(null);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { id: PRODUCT_ID, has_structured_content: true }
      );

      expect(orderRepository.invalidateGuarantee).not.toHaveBeenCalled();
    });

    it('should not invalidate if already ineligible', async () => {
      vi.mocked(orderRepository.getActiveOrderWithBuyer).mockResolvedValue({
        id: 'order-1',
        buyer_id: USER_ID,
        is_guarantee_eligible: false,
      } as any);

      await AccessService.evaluateGuaranteeStatus(
        USER_ID,
        PRODUCT_ID,
        { id: PRODUCT_ID, has_structured_content: true }
      );

      expect(productRepository.getUserProductProgress).not.toHaveBeenCalled();
    });
  });
});
