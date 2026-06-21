import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { descriptionGeneratorService } from '../../../services/ai/description-generator.service';
import { AppError } from '../../../errors/AppError';
import {
  buildCacheKey,
  cacheGet,
  cacheSet,
  callLLMForOptimization,
  fetchProductRagContext,
  parseStructuredResponse,
  CACHE_TTL,
} from '../../../lib/ai-product-optimizer.lib';
import type {
  DescriptionGeneratorOutput,
  DescriptionGeneratorInput,
} from '../../../services/ai/description-generator.service';
import type { EmbeddingSearchResult } from '../../../types/ai.types';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../lib/ai-product-optimizer.lib', () => ({
  buildCacheKey: vi.fn().mockReturnValue('description-generator:fake-hash'),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  callLLMForOptimization: vi.fn().mockResolvedValue('{}'),
  fetchProductRagContext: vi.fn().mockResolvedValue([]),
  parseStructuredResponse: vi.fn().mockImplementation((_raw: string, fallback: unknown) => fallback),
  CACHE_TTL: 604800,
}));

// ============================================================================
// Test constants
// ============================================================================

const USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const VALID_DESCRIPTION = 'A valid product description with enough length for testing';

function makeFallback(desc: string, sources: DescriptionGeneratorOutput['sources'] = []): DescriptionGeneratorOutput {
  return {
    titles: [],
    description: desc,
    objectives: [],
    tags: [],
    metaDescription: desc.slice(0, 155),
    detectedLanguage: 'en',
    sources,
    cached: false,
    degraded: true,
  };
}

function makeValidOutput(overrides: Partial<DescriptionGeneratorOutput> = {}): DescriptionGeneratorOutput {
  return {
    titles: ['Title 1', 'Title 2', 'Title 3'],
    description: 'A great description',
    objectives: ['Obj 1'],
    tags: ['tag1'],
    metaDescription: 'Meta desc',
    detectedLanguage: 'en',
    sources: [],
    cached: false,
    degraded: false,
    ...overrides,
  };
}

const VALID_INPUT: DescriptionGeneratorInput = {
  userId: USER_ID,
  productId: PRODUCT_ID,
  productDescription: VALID_DESCRIPTION,
  productType: 'course',
};

// ============================================================================
// Tests
// ============================================================================

describe('descriptionGeneratorService', () => {
  beforeEach(() => {
    // Re-establish default mock implementations (vi.resetAllMocks clears them)
    vi.mocked(buildCacheKey).mockReturnValue('description-generator:fake-hash');
    vi.mocked(cacheGet).mockResolvedValue(null);
    vi.mocked(cacheSet).mockResolvedValue(undefined);
    vi.mocked(callLLMForOptimization).mockResolvedValue('{}');
    vi.mocked(fetchProductRagContext).mockResolvedValue([]);
    vi.mocked(parseStructuredResponse).mockImplementation((_raw: string, fallback: unknown) => fallback);
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
      try {
        const result = await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'a'.repeat(10),
          productType: 'course',
        });
        expect(result.success).toBe(true);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeUndefined();
    });

    it('accepts description of exactly 5000 characters (boundary)', async () => {
      let caught: unknown;
      try {
        const result = await descriptionGeneratorService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productDescription: 'a'.repeat(5000),
          productType: 'course',
        });
        expect(result.success).toBe(true);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeUndefined();
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

  // =========================================================================
  // T2.3 — RAG fetch with graceful degradation
  // =========================================================================

  describe('T2.3: RAG fetch', () => {
    it('passes RAG results to prompt builder', async () => {
      const ragResults: EmbeddingSearchResult[] = [
        {
          id: 'rag-1',
          source_type: 'lesson',
          source_id: 'lesson-1',
          content: 'Lesson content here',
          metadata: {},
          similarity: 0.95,
        },
      ];
      vi.mocked(fetchProductRagContext).mockResolvedValue(ragResults);
      vi.mocked(callLLMForOptimization).mockResolvedValue('valid json');
      vi.mocked(parseStructuredResponse).mockReturnValue(makeValidOutput());

      await descriptionGeneratorService.generate(VALID_INPUT);

      expect(fetchProductRagContext).toHaveBeenCalledWith(USER_ID, VALID_DESCRIPTION);
      const userPrompt = vi.mocked(callLLMForOptimization).mock.calls[0][1];
      expect(userPrompt).toContain('Lesson content here');
    });

    it('degrades gracefully when RAG throws', async () => {
      vi.mocked(fetchProductRagContext).mockRejectedValue(new Error('RAG down'));
      vi.mocked(callLLMForOptimization).mockResolvedValue('valid json');
      vi.mocked(parseStructuredResponse).mockReturnValue(makeValidOutput());

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.sources).toEqual([]);
    });
  });

  // =========================================================================
  // T2.4 — LLM call + parse + retry
  // =========================================================================

  describe('T2.4: LLM call + parse + retry', () => {
    it('calls callLLMForOptimization with correct system and user prompts', async () => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('raw json');
      vi.mocked(parseStructuredResponse).mockReturnValue(makeValidOutput());

      await descriptionGeneratorService.generate(VALID_INPUT);

      expect(callLLMForOptimization).toHaveBeenCalledTimes(1);
      const [systemPrompt, userPrompt, configPrefix] = vi.mocked(callLLMForOptimization).mock.calls[0];
      expect(systemPrompt).toContain('detect the language');
      expect(systemPrompt).toContain('JSON');
      expect(userPrompt).toContain(VALID_DESCRIPTION);
      expect(userPrompt).toContain('course');
      expect(configPrefix).toBe('description_generator');
    });

    it('retries with stricter prompt when first parse returns degraded', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(callLLMForOptimization)
        .mockResolvedValueOnce('malformed json')
        .mockResolvedValueOnce('still malformed');
      vi.mocked(parseStructuredResponse).mockReturnValue(fallback);

      await descriptionGeneratorService.generate(VALID_INPUT);

      expect(callLLMForOptimization).toHaveBeenCalledTimes(2);
      const secondCallSystemPrompt = vi.mocked(callLLMForOptimization).mock.calls[1][0];
      expect(secondCallSystemPrompt).toContain('ATTENTION');
    });

    it('returns degraded fallback when both LLM attempts fail', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(callLLMForOptimization)
        .mockResolvedValueOnce('malformed')
        .mockResolvedValueOnce('still malformed');
      vi.mocked(parseStructuredResponse).mockReturnValue(fallback);

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.degraded).toBe(true);
    });

    it('returns degraded when retry LLM call throws', async () => {
      vi.mocked(callLLMForOptimization)
        .mockResolvedValueOnce('malformed')
        .mockRejectedValueOnce(new Error('retry LLM down'));
      vi.mocked(parseStructuredResponse).mockReturnValue(makeFallback(VALID_DESCRIPTION));

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(result.data?.degraded).toBe(true);
      // First parse returned fallback (degraded: true) → "malformed JSON" retry prompt
      const retryCall = vi.mocked(callLLMForOptimization).mock.calls[1];
      expect(retryCall[0]).toMatch(/malformed JSON/i);
    });

    it('returns valid output when first parse is degraded but retry succeeds', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(parseStructuredResponse)
        .mockReturnValueOnce(fallback)
        .mockReturnValueOnce(makeValidOutput());
      vi.mocked(callLLMForOptimization)
        .mockResolvedValueOnce('first response')
        .mockResolvedValueOnce('retry response');

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(result.data?.degraded).toBe(false);
      expect(result.data?.titles.length).toBeGreaterThan(0);
      // First parse returned fallback (degraded: true) → "malformed JSON" retry prompt
      const retryCall = vi.mocked(callLLMForOptimization).mock.calls[1];
      expect(retryCall[0]).toMatch(/malformed JSON/i);
    });

    it('returns degraded when LLM returns valid JSON with empty titles', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(parseStructuredResponse)
        .mockReturnValueOnce({ titles: [], description: '...', objectives: ['x'], tags: [], metaDescription: '...', detectedLanguage: 'en', sources: [], cached: false, degraded: false })
        .mockReturnValueOnce(fallback);
      vi.mocked(callLLMForOptimization).mockResolvedValue('{}');

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.degraded).toBe(true);
    });
  });

  // =========================================================================
  // T2.5 — Output building with truncation + degraded flag
  // =========================================================================

  describe('T2.5: output building', () => {
    it('caps titles at 3', async () => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(
        makeValidOutput({ titles: ['A', 'B', 'C', 'D', 'E'] })
      );

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.titles).toHaveLength(3);
    });

    it('caps tags at 10', async () => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(
        makeValidOutput({ tags: Array.from({ length: 15 }, (_, i) => `tag${i}`) })
      );

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.tags).toHaveLength(10);
    });

    it('caps metaDescription at 155 chars', async () => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(
        makeValidOutput({ metaDescription: 'x'.repeat(200) })
      );

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.metaDescription).toHaveLength(155);
    });

    it('sets degraded: true when LLM returns fallback', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(callLLMForOptimization).mockResolvedValue('malformed');
      vi.mocked(parseStructuredResponse).mockReturnValue(fallback);

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.degraded).toBe(true);
    });
  });

  // =========================================================================
  // T2.6 — Cache write after LLM
  // =========================================================================

  describe('T2.6: cache write', () => {
    it('calls cacheSet with correct key, output, and TTL after successful generation', async () => {
      vi.mocked(buildCacheKey).mockReturnValue('description-generator:test-key');
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(makeValidOutput());

      await descriptionGeneratorService.generate(VALID_INPUT);

      expect(cacheSet).toHaveBeenCalledTimes(1);
      const [key, output, ttl] = vi.mocked(cacheSet).mock.calls[0];
      expect(key).toBe('description-generator:test-key');
      expect(ttl).toBe(CACHE_TTL);
      expect((output as DescriptionGeneratorOutput).cached).toBe(false);
    });

    it('does not cache degraded output', async () => {
      const fallback = makeFallback(VALID_DESCRIPTION);
      vi.mocked(parseStructuredResponse).mockReturnValue(fallback);
      vi.mocked(callLLMForOptimization).mockResolvedValue('{}');

      await descriptionGeneratorService.generate(VALID_INPUT);

      expect(cacheSet).not.toHaveBeenCalled();
      expect(callLLMForOptimization).toHaveBeenCalledTimes(2); // first + retry
    });
    it('caches output when retry succeeds after first degraded', async () => {
      vi.mocked(parseStructuredResponse)
        .mockReturnValueOnce(makeFallback(VALID_DESCRIPTION))
        .mockReturnValueOnce(makeValidOutput());
      vi.mocked(callLLMForOptimization)
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('retry');
      vi.mocked(cacheGet).mockResolvedValue(null);

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(true);
      expect(result.data?.degraded).toBe(false);
      expect(cacheSet).toHaveBeenCalledTimes(1);
      const cachedOutput = vi.mocked(cacheSet).mock.calls[0][1] as DescriptionGeneratorOutput;
      expect(cachedOutput.degraded).toBe(false);
    });
  });

  // =========================================================================
  // T2.7 — Error handling wrapper
  // =========================================================================

  describe('T2.7: error handling', () => {
    it('re-throws AppError from validation (passes through)', async () => {
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

    it('returns success: false on unexpected error', async () => {
      vi.mocked(cacheGet).mockResolvedValue(null);
      vi.mocked(fetchProductRagContext).mockResolvedValue([]);
      vi.mocked(callLLMForOptimization).mockRejectedValue(new Error('LLM exploded'));

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // T2.8 — Language detection
  // =========================================================================

  describe('T2.8: language detection', () => {
    it.each(['es', 'en', 'pt'])('passes through detectedLanguage: %s', async (lang) => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(
        makeValidOutput({ detectedLanguage: lang as 'es' | 'en' | 'pt' })
      );

      const result = await descriptionGeneratorService.generate(VALID_INPUT);

      expect(result.data?.detectedLanguage).toBe(lang);
    });

    it('uses English system prompt with language detection instructions', async () => {
      vi.mocked(callLLMForOptimization).mockResolvedValue('json');
      vi.mocked(parseStructuredResponse).mockReturnValue(makeValidOutput());

      await descriptionGeneratorService.generate(VALID_INPUT);

      const systemPrompt = vi.mocked(callLLMForOptimization).mock.calls[0][0];
      expect(systemPrompt).toContain('detect the language');
      expect(systemPrompt).toMatch(/english/i);
    });
  });
});
