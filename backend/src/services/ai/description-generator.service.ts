// description-generator.service.ts
// Generates optimized product descriptions using LLM + RAG context.

import { AppError } from '../../errors/AppError';
import {
  buildCacheKey,
  cacheGet,
  cacheSet,
  fetchProductRagContext,
  callLLMForOptimization,
  parseStructuredResponse,
  CACHE_TTL,
} from '../../lib/ai-product-optimizer.lib';
import type { EmbeddingSearchResult } from '../../types/ai.types';
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
const CONFIG_PREFIX = 'description_generator';
const VALID_SOURCE_TYPES = new Set(['lesson', 'faq', 'review'] as const);

// ==========================================================================
// LLM Prompt Templates (system prompt in English per design §3.1)
// ==========================================================================

const SYSTEM_PROMPT = `You are an expert in digital marketing and content optimization for educational digital products.

Your task: analyze the product description provided and generate optimized content for conversion and SEO.

LANGUAGE INSTRUCTION (CRITICAL):
1. FIRST, detect the language of the product description (Spanish, English, or Portuguese).
2. THEN, generate ALL output content IN THE SAME LANGUAGE detected.
3. Never respond in a different language than the input.

OUTPUT FORMAT (strict JSON, no additional text):
{
  "titles": ["title 1", "title 2", "title 3"],
  "description": "full conversion-optimized description, one paragraph",
  "objectives": ["objective 1", "objective 2", "objective 3", "objective 4", "objective 5"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
  "metaDescription": "one-line meta description for SEO (max 155 characters)",
  "detectedLanguage": "en"
}

RULES:
- titles: exactly 3 attractive and distinct alternatives
- description: one persuasive paragraph describing the value and benefits
- objectives: 3 to 5 concrete and measurable learning objectives
- tags: 5 to 10 relevant SEO keywords, in the detected language
- metaDescription: one attractive line of max 155 characters for search engines
- detectedLanguage: "es", "en", or "pt" per detected language

IMPORTANT: Respond ONLY with valid JSON. No markdown, no additional text.`;

const USER_PROMPT_TEMPLATE = `Generate optimized content for the following product:

**Product type**: {productType}
**Product description**:
{productDescription}

{ragContext}

Generate the JSON with the optimized content.`;

// ==========================================================================
// Module-level helpers (extracted for testability)
// ==========================================================================

function buildUserPrompt(
  productType: string,
  productDescription: string,
  ragContext: string
): string {
  return USER_PROMPT_TEMPLATE
    .replace('{productType}', productType)
    .replace('{productDescription}', productDescription)
    .replace('{ragContext}', ragContext || '');
}

function buildRagContext(ragResults: EmbeddingSearchResult[]): string {
  if (ragResults.length === 0) return '';
  const chunks = ragResults.map(
    (r, i) => `[Context ${i + 1}] (${r.source_type}): ${r.content}`
  );
  return '\n**Additional product context** (lessons, FAQs, reviews):\n\n' + chunks.join('\n\n');
}

function mapSources(ragResults: EmbeddingSearchResult[]): DescriptionGeneratorOutput['sources'] {
  return ragResults
    .filter(r => VALID_SOURCE_TYPES.has(r.source_type as 'lesson' | 'faq' | 'review'))
    .map(r => ({
      contentType: r.source_type as 'lesson' | 'faq' | 'review',
      contentId: r.source_id,
      similarity: r.similarity,
    }));
}

/**
 * Post-parse validation: even if JSON parsed successfully, check required fields.
 * Returns true if the parsed output is degraded (empty/missing required fields).
 */
function hasDegradedFields(parsed: DescriptionGeneratorOutput): boolean {
  return !parsed.titles || parsed.titles.length === 0 || !parsed.objectives || parsed.objectives.length === 0;
}

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

    try {
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

      // 3. RAG context (non-blocking — degrade gracefully on failure)
      let ragResults: EmbeddingSearchResult[] = [];
      try {
        ragResults = await fetchProductRagContext(input.userId, input.productDescription);
      } catch (ragErr) {
        logger.warn(
          { err: ragErr instanceof Error ? ragErr.message : String(ragErr), productId: input.productId },
          'RAG fetch failed, continuing without context'
        );
      }

      // 4. Build prompts
      const ragContext = buildRagContext(ragResults);
      const userPrompt = buildUserPrompt(input.productType, input.productDescription, ragContext);

      // 5. Call LLM (first attempt)
      let rawResponse: string;
      try {
        rawResponse = await callLLMForOptimization(SYSTEM_PROMPT, userPrompt, CONFIG_PREFIX);
      } catch (llmErr) {
        logger.error(
          { err: llmErr instanceof Error ? llmErr.message : String(llmErr), productId: input.productId },
          'First LLM call failed'
        );
        throw new AppError('Failed to generate description', 500);
      }

      // 6. Parse response (first attempt)
      const fallback: DescriptionGeneratorOutput = {
        titles: [],
        description: input.productDescription,
        objectives: [],
        tags: [],
        metaDescription: input.productDescription.slice(0, 155),
        detectedLanguage: 'en',
        sources: [],
        cached: false,
        degraded: true,
      };

      let parsed = parseStructuredResponse<DescriptionGeneratorOutput>(rawResponse, fallback);
      let isDegraded = parsed.degraded === true || hasDegradedFields(parsed);
      const isParseFailure = parsed.degraded === true;

      // 7. Retry once with stricter prompt if first parse was degraded
      if (isDegraded) {
        logger.warn({ productId: input.productId }, 'First parse degraded, retrying with stricter prompt');
        const retryMessage = isParseFailure
          ? 'ATTENTION: The previous response was malformed JSON. Respond EXCLUSIVELY with valid JSON. No markdown.'
          : 'ATTENTION: The previous response had missing required fields (titles and objectives must not be empty). Respond EXCLUSIVELY with complete JSON. No markdown.';
        const strictPrompt = SYSTEM_PROMPT + '\n\n' + retryMessage;
        try {
          const retryResponse = await callLLMForOptimization(strictPrompt, userPrompt, CONFIG_PREFIX);
          parsed = parseStructuredResponse<DescriptionGeneratorOutput>(retryResponse, fallback);
          if (parsed.degraded === true || hasDegradedFields(parsed)) {
            isDegraded = true;
          } else {
            isDegraded = false;
          }
        } catch (retryErr) {
          logger.error(
            { err: retryErr instanceof Error ? retryErr.message : String(retryErr), productId: input.productId },
            'Retry LLM call failed'
          );
          isDegraded = true;
        }
      }

      // 8. Build final output with truncation and defaults
      const output: DescriptionGeneratorOutput = {
        titles: (parsed.titles ?? []).slice(0, 3),
        description: parsed.description || input.productDescription,
        objectives: (parsed.objectives ?? []).slice(0, 5),
        tags: (parsed.tags ?? []).slice(0, 10),
        metaDescription: (parsed.metaDescription || '').slice(0, 155),
        detectedLanguage: ['es', 'en', 'pt'].includes(parsed.detectedLanguage)
          ? parsed.detectedLanguage
          : 'en',
        sources: mapSources(ragResults),
        cached: false,
        degraded: isDegraded,
      };

      // 9. Store in cache (skip degraded output — don't cache fallback data)
      if (!isDegraded) {
        await cacheSet(cacheKey, output, CACHE_TTL);
      }

      logger.info({ productId: input.productId }, 'Description generated successfully');
      return { success: true, data: output };
    } catch (error) {
      if (error instanceof AppError) {
        logger.error({ error: error.message, productId: input.productId }, 'Description generation failed');
        return { success: false, error: error.message };
      }
      logger.error(
        { err: error instanceof Error ? error.message : String(error), productId: input.productId },
        'Description generation unexpected error'
      );
      return { success: false, error: 'Failed to generate product description' };
    }
  },
};
