import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { descriptionGeneratorService } from '../../../services/ai/description-generator.service';
import { AppError } from '../../../errors/AppError';
import { buildCacheKey, cacheGet, callLLMForOptimization } from '../../../lib/ai-product-optimizer.lib';
import type { DescriptionGeneratorOutput } from '../../../services/ai/description-generator.service';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../lib/ai-product-optimizer.lib', () => ({
  buildCacheKey: vi.fn().mockReturnValue('description-generator:fake-hash'),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  // Mocked for forward-compat with PR 2b. The service does not yet import
  // callLLMForOptimization, but the test asserts the cache-hit path never
  // calls it (safeguard for PR 2b).
  callLLMForOptimization: vi.fn().mockResolvedValue('{}'),
  CACHE_TTL: 604800,
}));

// ============================================================================
// Test constants
// ============================================================================

const USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const VALID_DESCRIPTION = 'A valid product description with enough length for testing';

// ============================================================================
// Tests
// ============================================================================

describe('descriptionGeneratorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // T2.0 — Service skeleton
  // =========================================================================

  describe('T2.0: service skeleton', () => {
    it('is exported and has generate() method', () => {
      expect(descriptionGeneratorService).toBeDefined();
      expect(typeof descriptionGeneratorService.generate).toBe('function');
    });
  });

  // =========================================================================
  // T2.1 — Input validation
  // =========================================================================

  describe('T2.1: input validation', () => {
    it('rejects empty productId with 400', async () => {
      let caught: unknown;
      try {
        await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: '',
          productDescription: VALID_DESCRIPTION,
          productType: 'course',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).statusCode).toBe(400);
    });

    it('rejects description shorter than 10 chars with 400', async () => {
      let caught: unknown;
      try {
        await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'short',
          productType: 'course',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).statusCode).toBe(400);
    });

    it('rejects description longer than 5000 chars with 400', async () => {
      let caught: unknown;
      try {
        await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'a'.repeat(5001),
          productType: 'course',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      expect((caught as AppError).statusCode).toBe(400);
    });

    it('accepts description of exactly 10 characters (boundary)', async () => {
      let caught: unknown;
      let result: Awaited<ReturnType<typeof descriptionGeneratorService.generate>> | undefined;
      try {
        result = await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'a'.repeat(10),
          productType: 'course',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeUndefined();
      expect(result).toEqual({ success: true });
    });

    it('accepts description of exactly 5000 characters (boundary)', async () => {
      let caught: unknown;
      let result: Awaited<ReturnType<typeof descriptionGeneratorService.generate>> | undefined;
      try {
        result = await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'a'.repeat(5000),
          productType: 'course',
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeUndefined();
      expect(result).toEqual({ success: true });
    });
  });

  // =========================================================================
  // T2.2 — Cache check
  // =========================================================================

  describe('T2.2: cache check', () => {
    const cachedOutput: DescriptionGeneratorOutput = {
      titles: ['Title 1', 'Title 2', 'Title 3'],
      description: 'Cached description',
      objectives: ['Objective 1'],
      tags: ['tag1', 'tag2'],
      metaDescription: 'Cached meta',
      detectedLanguage: 'es',
      sources: [],
      cached: false,
      degraded: false,
    };

    it('returns cached output with cached: true on cache hit', async () => {
      vi.mocked(buildCacheKey).mockReturnValue('description-generator:test-key');
      vi.mocked(cacheGet).mockResolvedValue(cachedOutput);

      const result = await descriptionGeneratorService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productDescription: VALID_DESCRIPTION,
        productType: 'course',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.cached).toBe(true);
      expect(result.data?.titles).toEqual(['Title 1', 'Title 2', 'Title 3']);
      expect(result.data?.description).toBe('Cached description');
    });

    /**
     * Forward-compat test for PR 2b. The service does not currently call
     * callLLMForOptimization, but once PR 2b adds the LLM call, this test
     * ensures the cache-hit short-circuit is preserved.
     */
    it('does not call LLM on cache hit', async () => {
      vi.mocked(buildCacheKey).mockReturnValue('description-generator:test-key');
      vi.mocked(cacheGet).mockResolvedValue(cachedOutput);

      await descriptionGeneratorService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productDescription: VALID_DESCRIPTION,
        productType: 'course',
      });

      expect(callLLMForOptimization).not.toHaveBeenCalled();
    });
  });
});
