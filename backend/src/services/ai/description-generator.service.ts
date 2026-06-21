// description-generator.service.ts
// Generates optimized product descriptions using LLM + RAG context.

import { AppError } from '../../errors/AppError';
import { buildCacheKey, cacheGet } from '../../lib/ai-product-optimizer.lib';
import logger from '../../utils/logger';

// ==========================================================================
// Types
// ==========================================================================

export type DescriptionProductType =
  | 'course'
  | 'ebook'
  | 'podcast'
  | 'membership'
  | 'software'
  | 'audiobook';

export interface DescriptionGeneratorInput {
  userId: string;
  productId: string;
  productDescription: string;
  productType: DescriptionProductType;
}

export interface DescriptionGeneratorOutput {
  titles: string[];
  description: string;
  objectives: string[];
  tags: string[];
  metaDescription: string;
  detectedLanguage: 'es' | 'en' | 'pt';
  sources: Array<{
    contentType: 'lesson' | 'faq' | 'review';
    contentId: string;
    similarity: number;
  }>;
  cached: boolean;
  degraded: boolean;
}

export interface DescriptionGeneratorResponse {
  success: boolean;
  data?: DescriptionGeneratorOutput;
  error?: string;
}

// ==========================================================================
// Constants
// ==========================================================================

const SCHEMA_VERSION = 1;

// ==========================================================================
// Service
// ==========================================================================

export const descriptionGeneratorService = {
  async generate(
    input: DescriptionGeneratorInput
  ): Promise<DescriptionGeneratorResponse> {
    // 1. Validate input (defense-in-depth: orchestrator path bypasses Zod)
    if (!input.productId || input.productId.trim().length === 0) {
      throw new AppError('productId is required', 400);
    }
    if (!input.productDescription || input.productDescription.trim().length < 10) {
      throw new AppError('productDescription must be at least 10 characters', 400);
    }
    if (input.productDescription.trim().length > 5000) {
      throw new AppError('productDescription must be at most 5000 characters', 400);
    }

    // 2. Check cache
    const cacheKey = buildCacheKey(
      input.productId,
      input.productDescription,
      input.productType,
      SCHEMA_VERSION
    );
    const cached = await cacheGet<DescriptionGeneratorOutput>(cacheKey);
    if (cached) {
      logger.info({ productId: input.productId, cacheKey }, 'Description generator: cache hit');
      return {
        success: true,
        data: { ...cached, cached: true },
      };
    }

    return { success: true };
  },
};
