/**
 * SEO Optimizer Service
 * Generates SEO meta tags automatically for product pages.
 * Uses RAG context from memory service for better SEO generation.
 *
 * SDD: docs/project/ai-features/sdd/seo-optimizer/
 */

import type { EmbeddingSearchResult } from '../../types/ai.types';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { configService } from '../config.service';

import { llmService } from './llm.service';
import { memoryService } from './memory.service';

// ============================================================================
// Types
// ============================================================================

export type SEOProductType =
  | 'course'
  | 'ebook'
  | 'podcast'
  | 'membership'
  | 'software'
  | 'audiobook';

export interface SEOOptimizerInput {
  userId: string;
  productId: string;
  productName: string;
  productDescription: string;
  productType: SEOProductType;
  creatorName?: string;
}

export interface SEOOptimizerOutput {
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  ogType: string;
  ogSiteName: string;
  canonicalUrl: string;
  schemaMarkup: Record<string, unknown>;
  keywords: string[];
  sources?: Array<{
    source_type: 'lesson' | 'faq' | 'review';
    source_id: string;
    content: string;
    similarity: number;
  }>;
}

export interface SEOOptimizerResponse {
  success: boolean;
  data?: SEOOptimizerOutput;
  error?: string;
}

// ============================================================================
// Config Keys
// ============================================================================

const CONFIG_TEMPERATURE = 'seo_optimizer.temperature';
const CONFIG_MAX_TOKENS = 'seo_optimizer.max_tokens';
const CONFIG_MODEL = 'seo_optimizer.model';

// ============================================================================
// Constants
// ============================================================================

const SCHEMA_TYPE_MAP: Record<SEOProductType, string> = {
  course: 'Course',
  ebook: 'Book',
  podcast: 'PodcastSeries',
  membership: 'Course',
  software: 'SoftwareApplication',
  audiobook: 'Audiobook',
};

const SEO_SYSTEM_PROMPT = `Eres un experto en SEO para productos digitales en español.
Tu tarea es generar meta tags optimizados para SEO y redes sociales.

REGLAS ESTRICTAS:
- metaTitle: Máximo 60 caracteres, mínimo 30 caracteres, debe ser atractivo y descriptivo
- metaDescription: Máximo 100-155 caracteres, debe incluir call-to-action implícito
- ogTitle: Máximo 60 caracteres, puede ser igual al metaTitle
- ogDescription: Máximo 100 caracteres, debe ser impactante para redes
- keywords: Array de 5-10 keywords relevantes
- schemaMarkup: Objeto JSON-LD completo según tipo de producto

Responde SOLO con JSON válido, sin texto adicional:
{
  "metaTitle": "...",
  "metaDescription": "...",
  "ogTitle": "...",
  "ogDescription": "...",
  "ogImageUrl": "...",
  "keywords": ["...", "...", "..."],
  "schemaMarkup": { "@context": "https://schema.org", "@type": "Course", ... }
}`;

const STOP_WORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'de',
  'del',
  'al',
  'y',
  'o',
  'pero',
  'que',
  'se',
  'en',
  'con',
  'por',
  'para',
  'sin',
  'sobre',
  'entre',
  'desde',
  'hasta',
  'como',
  'más',
  'menos',
  'muy',
  'tan',
  'tanto',
  'este',
  'esta',
  'estos',
  'estas',
  'ese',
  'esa',
  'esos',
  'esas',
  'aquel',
  'aquella',
  'su',
  'sus',
  'mi',
  'mis',
  'tu',
  'tus',
  'nuestro',
  'vuestra',
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'with',
  'from',
  'by',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
]);

// ============================================================================
// Helper Functions (exported for testing)
// ============================================================================

/**
 * Truncates text to max length, appending "..." if truncated.
 */
export function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3).trimEnd() + '...';
}

/**
 * Simple keyword extraction using word frequency, removing stop words.
 */
export function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const frequency = new Map<string, number>();
  for (const word of words) {
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  const sorted = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);

  return sorted;
}

/**
 * Maps product type to Schema.org type.
 */
export function getSchemaType(productType: SEOProductType): string {
  return SCHEMA_TYPE_MAP[productType] ?? 'Product';
}

// ============================================================================
// Service
// ============================================================================

export const seoOptimizerService = {
  /**
   * Generate SEO meta tags for a product using LLM + RAG context.
   */
  async generate(input: SEOOptimizerInput): Promise<SEOOptimizerResponse> {
    // 1. Validate input (throws before entering try-catch)
    if (!input.productId || input.productId.trim().length === 0) {
      throw new AppError('productId is required', 400);
    }

    if (!input.productDescription || input.productDescription.trim().length < 10) {
      throw new AppError('Product description is required for SEO generation', 400);
    }

    try {
      // 2. RAG Context: search for similar content to ground the SEO generation
      const ragResults: EmbeddingSearchResult[] = await memoryService.searchSimilar(
        input.userId,
        `${input.productName} ${input.productDescription}`,
        10,
        ['lesson', 'faq', 'review']
      );

      // 3. Build context from RAG results
      let contextContent = '';
      if (ragResults.length > 0) {
        contextContent = ragResults.map((r, i) => `[Context ${i + 1}] ${r.content}`).join('\n\n');
      }

      // 4. Build user prompt with product details
      const userPrompt = buildUserPrompt(input, contextContent);

      // 5. Read config
      const temperature = await configService.getNumber(CONFIG_TEMPERATURE, 0.7);
      const maxTokens = await configService.getNumber(CONFIG_MAX_TOKENS, 2000);
      const model = await configService.get(CONFIG_MODEL);

      // 6. Call LLM
      const llmResponse = await llmService.chat({
        messages: [
          { role: 'system', content: SEO_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        model: model || undefined,
        temperature,
        maxTokens,
      });

      // 7. Parse JSON response
      const parsed = parseLLMResponse(llmResponse.content);

      // 8. Apply truncation rules
      const metaTitle = truncateToLength(parsed.metaTitle, 60);
      const metaDescription = truncateToLength(parsed.metaDescription, 155);
      const ogTitle = truncateToLength(parsed.ogTitle ?? parsed.metaTitle, 60);
      const ogDescription = truncateToLength(parsed.ogDescription ?? parsed.metaDescription, 100);

      // 9. Build schema markup
      const schemaType = getSchemaType(input.productType);
      const schemaMarkup = buildSchemaMarkup(
        schemaType,
        input.productName,
        parsed.metaDescription,
        input.creatorName
      );

      // 10. Extract keywords if not provided by LLM
      const keywords =
        parsed.keywords.length > 0
          ? parsed.keywords
          : extractKeywords(`${input.productName} ${input.productDescription}`, 8);

      // 11. Build canonical URL
      const canonicalUrl = `https://crema.com/product/${input.productId}`;

      // 12. Map RAG sources for output
      const sources = ragResults.map(r => ({
        source_type: r.source_type as 'lesson' | 'faq' | 'review',
        source_id: r.source_id,
        content: r.content,
        similarity: r.similarity,
      }));

      const output: SEOOptimizerOutput = {
        metaTitle,
        metaDescription,
        ogTitle,
        ogDescription,
        ogImageUrl: parsed.ogImageUrl ?? '',
        ogType: 'product',
        ogSiteName: 'Crema',
        canonicalUrl,
        schemaMarkup,
        keywords,
        sources,
      };

      logger.info({ productId: input.productId }, 'SEO meta tags generated successfully');

      return { success: true, data: output };
    } catch (error) {
      if (error instanceof AppError) {
        logger.error({ error: error.message, productId: input.productId }, 'SEO generation failed');
        return { success: false, error: error.message };
      }
      logger.error({ error, productId: input.productId }, 'SEO generation unexpected error');
      return { success: false, error: 'Failed to generate SEO meta tags' };
    }
  },
};

// ============================================================================
// Internal Helpers
// ============================================================================

interface ParsedLLMResponse {
  metaTitle: string;
  metaDescription: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  keywords: string[];
  schemaMarkup?: Record<string, unknown>;
}

/**
 * Build user prompt with product details and optional RAG context.
 */
function buildUserPrompt(input: SEOOptimizerInput, contextContent: string): string {
  let prompt = `Genera SEO meta tags para el siguiente producto digital:\n\n`;
  prompt += `**Nombre del producto**: ${input.productName}\n`;
  prompt += `**Descripción**: ${input.productDescription}\n`;
  prompt += `**Tipo**: ${input.productType}\n`;

  if (input.creatorName) {
    prompt += `**Creador**: ${input.creatorName}\n`;
  }

  if (contextContent.length > 0) {
    prompt += `\n**Contexto adicional del producto** (usa esta información para mejorar los meta tags):\n\n`;
    prompt += contextContent;
  }

  prompt += `\n\nGenera el JSON con los meta tags optimizados.`;
  return prompt;
}

/**
 * Parse LLM response, extracting JSON from possible markdown code blocks.
 */
function parseLLMResponse(rawContent: string): ParsedLLMResponse {
  let jsonStr = rawContent.trim();

  // Strip markdown code fences if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr) as ParsedLLMResponse;
    return {
      metaTitle: parsed.metaTitle ?? '',
      metaDescription: parsed.metaDescription ?? '',
      ogTitle: parsed.ogTitle,
      ogDescription: parsed.ogDescription,
      ogImageUrl: parsed.ogImageUrl,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      schemaMarkup: parsed.schemaMarkup,
    };
  } catch {
    logger.warn(
      { rawContent: jsonStr.slice(0, 200) },
      'SEO Optimizer: failed to parse LLM JSON response'
    );
    return {
      metaTitle: '',
      metaDescription: '',
      keywords: [],
    };
  }
}

/**
 * Build Schema.org JSON-LD markup for the product.
 */
function buildSchemaMarkup(
  schemaType: string,
  productName: string,
  description: string,
  creatorName?: string
): Record<string, unknown> {
  const markup: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: productName,
    description: description,
  };

  if (creatorName) {
    markup.author = {
      '@type': 'Person',
      name: creatorName,
    };
  }

  if (schemaType === 'Course') {
    markup.provider = {
      '@type': 'Organization',
      name: 'Crema',
    };
  }

  return markup;
}
