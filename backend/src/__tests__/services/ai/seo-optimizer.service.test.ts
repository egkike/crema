import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  seoOptimizerService,
  truncateToLength,
  extractKeywords,
  getSchemaType,
} from '../../../services/ai/seo-optimizer.service';
import { memoryService } from '../../../services/ai/memory.service';
import { llmService } from '../../../services/ai/llm.service';
import { AppError } from '../../../errors/AppError';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('../../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn(),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
  },
}));

vi.mock('../../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue(null),
  },
}));

// ============================================================================
// Test constants
// ============================================================================

const USER_ID = '00000000-0000-0000-0000-000000000001';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000020';
const PRODUCT_NAME = 'Curso de TypeScript Profesional';
const PRODUCT_DESCRIPTION =
  'Aprende TypeScript desde cero hasta nivel avanzado. Cubrimos tipos, genéricos, decoradores y más.';
const PRODUCT_TYPE = 'course';
const CREATOR_NAME = 'Juan Pérez';

// ============================================================================
// Tests
// ============================================================================

describe('seoOptimizerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // =========================================================================
  // truncateToLength
  // =========================================================================

  describe('truncateToLength', () => {
    it('should truncate text longer than maxLength and append "..."', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateToLength(text, 20);

      expect(result.length).toBeLessThanOrEqual(23); // 20 + "..."
      expect(result.endsWith('...')).toBe(true);
    });

    it('should preserve text shorter than maxLength unchanged', () => {
      const text = 'Short text';
      const result = truncateToLength(text, 50);

      expect(result).toBe(text);
    });

    it('should preserve text exactly at maxLength unchanged', () => {
      const text = 'Exactly twenty characters';
      const result = truncateToLength(text, 27);

      expect(result).toBe(text);
    });
  });

  // =========================================================================
  // extractKeywords
  // =========================================================================

  describe('extractKeywords', () => {
    it('should extract keywords from text filtering common words', () => {
      const text = 'TypeScript is a great programming language for web development';
      const result = extractKeywords(text, 5);

      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should limit results to maxKeywords', () => {
      const text = 'one two three four five six seven eight nine ten';
      const result = extractKeywords(text, 3);

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for empty string', () => {
      const result = extractKeywords('');

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // getSchemaType
  // =========================================================================

  describe('getSchemaType', () => {
    it('should map course to Course', () => {
      expect(getSchemaType('course')).toBe('Course');
    });

    it('should map ebook to Book', () => {
      expect(getSchemaType('ebook')).toBe('Book');
    });

    it('should map podcast to PodcastSeries', () => {
      expect(getSchemaType('podcast')).toBe('PodcastSeries');
    });

    it('should map membership to Course', () => {
      expect(getSchemaType('membership')).toBe('Course');
    });

    it('should map software to SoftwareApplication', () => {
      expect(getSchemaType('software')).toBe('SoftwareApplication');
    });

    it('should map audiobook to Audiobook', () => {
      expect(getSchemaType('audiobook')).toBe('Audiobook');
    });
  });

  // =========================================================================
  // generate()
  // =========================================================================

  describe('generate()', () => {
    it('should throw AppError(400) if productId is missing', async () => {
      await expect(
        seoOptimizerService.generate({
          userId: USER_ID,
          productId: '',
          productName: PRODUCT_NAME,
          productDescription: PRODUCT_DESCRIPTION,
          productType: PRODUCT_TYPE,
        })
      ).rejects.toThrow(AppError);
    });

    it('should throw AppError(400) if productDescription is less than 10 chars', async () => {
      await expect(
        seoOptimizerService.generate({
          userId: USER_ID,
          productId: PRODUCT_ID,
          productName: PRODUCT_NAME,
          productDescription: 'short',
          productType: PRODUCT_TYPE,
        })
      ).rejects.toThrow(new AppError('Product description is required for SEO generation', 400));
    });

    it('should return SEO data on successful LLM response', async () => {
      const mockLLMResponse = JSON.stringify({
        metaTitle: 'Curso de TypeScript Profesional | Aprende desde cero',
        metaDescription:
          'Domina TypeScript con nuestro curso completo. Aprende tipos, genéricos y más.',
        ogTitle: 'Curso de TypeScript Profesional',
        ogDescription: 'Aprende TypeScript desde cero hasta avanzado',
        keywords: ['typescript', 'programación', 'curso', 'web', 'desarrollo'],
      });

      vi.mocked(llmService.chat).mockResolvedValue({
        content: mockLLMResponse,
        model: 'test-model',
      });

      vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);

      const result = await seoOptimizerService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        productType: PRODUCT_TYPE,
        creatorName: CREATOR_NAME,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.metaTitle).toBeDefined();
      expect(result.data?.metaTitle.length).toBeLessThanOrEqual(60);
      expect(result.data?.schemaMarkup).toBeDefined();
      expect(result.data?.keywords).toBeDefined();
    });

    it('should call memoryService.searchSimilar with correct params for RAG context', async () => {
      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          metaTitle: 'Test Title Long Enough For SEO Validation',
          metaDescription: 'Test description for testing',
          ogTitle: 'Test OG',
          ogDescription: 'Test OG desc',
          keywords: ['test'],
        }),
        model: 'test-model',
      });

      vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);

      await seoOptimizerService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        productType: PRODUCT_TYPE,
      });

      expect(memoryService.searchSimilar).toHaveBeenCalledWith(
        USER_ID,
        `${PRODUCT_NAME} ${PRODUCT_DESCRIPTION}`,
        10,
        ['lesson', 'faq', 'review']
      );
    });

    it('should truncate metaTitle to 60 chars max', async () => {
      const longTitle = 'A'.repeat(100);
      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          metaTitle: longTitle,
          metaDescription: 'Valid description here',
          ogTitle: 'Short OG',
          ogDescription: 'Short OG desc',
          keywords: ['test'],
        }),
        model: 'test-model',
      });

      vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);

      const result = await seoOptimizerService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        productType: PRODUCT_TYPE,
      });

      expect(result.success).toBe(true);
      expect(result.data?.metaTitle.length).toBeLessThanOrEqual(60);
    });

    it('should return success=false if LLM returns metaTitle shorter than 30 chars', async () => {
      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          metaTitle: 'Too short',
          metaDescription:
            'Valid description here with enough characters to pass other validations',
          ogTitle: 'Short OG',
          ogDescription: 'Short OG desc',
          keywords: ['test'],
        }),
        model: 'test-model',
      });

      vi.mocked(memoryService.searchSimilar).mockResolvedValue([]);

      const result = await seoOptimizerService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        productType: PRODUCT_TYPE,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('metaTitle shorter than 30');
      expect(result.data).toBeUndefined();
    });

    it('should include sources in output when RAG returns results', async () => {
      const mockSources = [
        {
          id: 'emb-1',
          source_type: 'lesson' as const,
          source_id: 'lesson-uuid-1',
          content: 'This is lesson content about TypeScript',
          metadata: {},
          similarity: 0.85,
        },
      ];

      vi.mocked(llmService.chat).mockResolvedValue({
        content: JSON.stringify({
          metaTitle: 'Test Title Long Enough For SEO Validation',
          metaDescription: 'Valid description here',
          ogTitle: 'Short OG',
          ogDescription: 'Short OG desc',
          keywords: ['test'],
        }),
        model: 'test-model',
      });

      vi.mocked(memoryService.searchSimilar).mockResolvedValue(mockSources);

      const result = await seoOptimizerService.generate({
        userId: USER_ID,
        productId: PRODUCT_ID,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        productType: PRODUCT_TYPE,
      });

      expect(result.success).toBe(true);
      expect(result.data?.sources).toBeDefined();
      expect(result.data?.sources?.length).toBe(1);
      expect(result.data?.sources?.[0]?.source_type).toBe('lesson');
      expect(result.data?.sources?.[0]?.similarity).toBeCloseTo(0.85, 2);
    });
  });
});
