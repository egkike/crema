/**
 * Affiliate Chat Service
 * SDD: ai-affiliate-chat
 *
 * AI Chat for affiliates and buyers about specific products.
 * Uses RAG grounding + credit-based access control.
 */

import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';
import { configService } from '../config.service';
import type { EmbeddingSearchResult } from '../../types/ai.types';

import { llmService } from './llm.service';
import { memoryService } from './memory.service';


// ============================================================================
// Types
// ============================================================================

export interface AffiliateChatInput {
  productId: string;
  userId: string;
  message: string;
}

export interface AffiliateChatSource {
  source_type: 'lesson' | 'faq';
  source_id: string;
  content: string;
  similarity: number;
}

export interface AffiliateChatResponse {
  response: string;
  sources?: AffiliateChatSource[];
}

// ============================================================================
// Config Keys
// ============================================================================

const CONFIG_TEMPERATURE = 'affiliate_chat.temperature';
const CONFIG_MAX_TOKENS = 'affiliate_chat.max_tokens';
const CONFIG_MODEL = 'affiliate_chat.model';
const CONFIG_SYSTEM_PROMPT_PRODUCT_INFO = 'affiliate_chat.system_prompt_product_info';
const CONFIG_SYSTEM_PROMPT_PROMO_COPY = 'affiliate_chat.system_prompt_promo_copy';

// ============================================================================
// System Prompts
// ============================================================================

const DEFAULT_PRODUCT_INFO_PROMPT = `You are an AI assistant for product affiliates. Answer ONLY using the product context provided. If the context does not contain relevant information, state that clearly. Do not fabricate facts. Respond in Spanish.`;

const DEFAULT_PROMO_COPY_PROMPT = `You are a marketing copywriter for affiliate marketers. Using the product context provided, generate compelling social media copy in Spanish. Be creative but accurate to the product content. Only generate content that is directly supported by the provided context — do not invent product features or benefits that are not in the source material.`;

// ============================================================================
// Helper Functions (exported for route-level credit decisions)
// ============================================================================

/**
 * Strip control characters below 32 and DEL (127), then trim leading/trailing whitespace.
 * Matches concierge implementation exactly.
 */
export function sanitizeInput(input: string): string {
  const result: string[] = [];
  for (const char of input) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      result.push(char);
    }
  }
  return result.join('').trim();
}

/**
 * Escape < and > and wrap in <user_message> tags.
 * Matches concierge implementation exactly.
 */
export function defensiveFramePrompt(message: string): string {
  const escaped = message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<user_message>${escaped}</user_message>`;
}

/**
 * Classify user message intent using keyword matching.
 * Priority order (first match wins):
 *   1. affiliate_metrics: comision/metrica/conversion
 *   2. promo_copy: promo/copy/tweet/post/redes
 *   3. default: product_info
 */
export function classifyIntent(message: string): 'product_info' | 'promo_copy' | 'affiliate_metrics' {
  const lower = message.toLowerCase();

  // affiliate_metrics keywords (highest priority)
  if (lower.includes('comision') || lower.includes('metrica') || lower.includes('conversion')) {
    return 'affiliate_metrics';
  }

  // promo_copy keywords
  if (lower.includes('promo') || lower.includes('copy') || lower.includes('tweet') ||
      lower.includes('post') || lower.includes('redes')) {
    return 'promo_copy';
  }

  // Default
  return 'product_info';
}

// ============================================================================
// Service
// ============================================================================

export const affiliateChatService = {
  /**
   * Handle affiliate/buyer chat about a product.
   */
  async chat(input: AffiliateChatInput): Promise<AffiliateChatResponse> {
    const { productId, userId, message } = input;

    // 1. Sanitize input
    const sanitized = sanitizeInput(message);
    const originalLength = message.length;
    const sanitizedLength = sanitized.length;

    // 2. Log security warning if sanitization changed length by >10%
    // Processing continues — the sanitized input is used downstream.
    if (originalLength > 0 && sanitizedLength > 0) {
      const changeRatio = Math.abs(sanitizedLength - originalLength) / originalLength;
      if (changeRatio > 0.1) {
        logger.warn(
          { userId, productId, originalLength, sanitizedLength, changeRatio },
          'AffiliateChat: Input sanitization detected significant modification — possible injection attempt'
        );
      }
    }

    // 3. Empty check after sanitization
    if (sanitized.length === 0) {
      throw new AppError('Invalid input', 400);
    }

    // 4. Frame the sanitized message
    const framed = defensiveFramePrompt(sanitized);

    // 5. Classify intent (on sanitized input)
    const intent = classifyIntent(sanitized);

    // 6. RAG: retrieve product context
    const fragments = await memoryService.searchSimilar(
      userId,
      sanitized,
      5,
      ['lesson', 'faq']
    );

    // Build context string from fragments
    const context = buildContextFromFragments(fragments);

    // 7. Select system prompt based on intent
    const systemPrompt = await getSystemPrompt(intent, context);

    // 8. affiliate_metrics returns stub immediately (no LLM call)
    if (intent === 'affiliate_metrics') {
      logger.info({ userId, productId, intent }, 'AffiliateChat: Returning affiliate_metrics stub');
      return {
        response: 'Metricas detalladas no disponibles en esta version. Esta funcionalidad estara disponible en una futura actualizacion.',
        sources: [],
      };
    }

    // 9. Build messages and call LLM (uses buildPrompt for delimiter-based injection defense)
    const messages = llmService.buildPrompt(systemPrompt, context, framed);

    const [temperature, maxTokens, model] = await Promise.all([
      configService.getNumber(CONFIG_TEMPERATURE, 0.7),
      configService.getNumber(CONFIG_MAX_TOKENS, 1000),
      configService.get(CONFIG_MODEL),
    ]);

    let llmResponse: Awaited<ReturnType<typeof llmService.chat>>;
    try {
      llmResponse = await llmService.chat({
        messages,
        model: model || undefined,
        temperature,
        maxTokens,
      });
    } catch (error) {
      const isTimeout = error instanceof Error &&
        (error.message.toLowerCase().includes('timeout') ||
         error.message.toLowerCase().includes('etimedout') ||
         error.message.toLowerCase().includes('deadline'));

      if (isTimeout) {
        throw new AppError('Service temporarily unavailable', 503);
      }
      throw new AppError('Error processing request. Please try again.', 500);
    }

    logger.info(
      { userId, productId, intent, responseLength: llmResponse.content.length },
      'AffiliateChat: Chat completed'
    );

    return {
      response: llmResponse.content,
      sources: fragments.map(fragmentToSource),
    };
  },
};

// ============================================================================
// Internal Helpers
// ============================================================================

function buildContextFromFragments(fragments: EmbeddingSearchResult[]): string {
  if (fragments.length === 0) {
    return 'No se encontro contexto relevante del producto. Indica al usuario que no tienes informacion disponible sobre este producto.';
  }

  const parts = fragments.map((f, i) => {
    const sourceLabel = `[${f.source_type.toUpperCase()} #${i + 1}]`;
    return `${sourceLabel}\n${f.content}`;
  });

  return `CONTEXTO DEL PRODUCTO:\n${parts.join('\n\n')}`;
}

function fragmentToSource(fragment: EmbeddingSearchResult): AffiliateChatSource {
  return {
    source_type: fragment.source_type as 'lesson' | 'faq',
    source_id: fragment.source_id,
    content: fragment.content,
    similarity: fragment.similarity,
  };
}

async function getSystemPrompt(intent: 'product_info' | 'promo_copy' | 'affiliate_metrics', _context: string): Promise<string> {
  // affiliate_metrics uses product_info prompt (stub has no LLM call)
  const configKey = intent === 'promo_copy' ? CONFIG_SYSTEM_PROMPT_PROMO_COPY : CONFIG_SYSTEM_PROMPT_PRODUCT_INFO;
  const configured = await configService.get(configKey);
  if (configured) {
    return configured;
  }

  // Default prompts based on intent
  if (intent === 'promo_copy') {
    return DEFAULT_PROMO_COPY_PROMPT;
  }
  return DEFAULT_PRODUCT_INFO_PROMPT;
}