/**
 * Concierge Service
 * Phase 7: Concierge Integration
 * 
 * AI Support Chatbot for general user support.
 * Does NOT require product context - handles general questions.
 */

import { AppError } from '../../errors/AppError';
import { withSanitizedErrors } from '../../lib/withSanitizedErrors';
import logger from '../../utils/logger';
import { userContextRepository } from '../../repositories/user-context.repository';
import { configService } from '../config.service';

import { llmService, type LLMMessage } from './llm.service';

// ============================================================================
// Types
// ============================================================================

export interface ConciergeRequest {
  message: string;
  userId: string;
}

export interface ConciergeResponse {
  response: string;
}

// ============================================================================
// Config
// ============================================================================

// Special productId for Concierge (not tied to any product)
const CONCIERGE_PRODUCT_ID = '00000000-0000-0000-0000-000000000000';

// Fallback system prompt if config not set
const DEFAULT_SYSTEM_PROMPT = `You are Crema's support assistant. Your role is to help users with:
- Product access issues
- Refund inquiries
- Platform frequently asked questions
- Subscription status

INSTRUCTIONS:
1. Be kind, professional and patient
2. Use ONLY information from the Crema platform
3. If you don't know the answer, indicate you cannot help with that specific query
4. Do not provide false or made-up information
5. Refer to soporte@crema if needed

LIMITATIONS:
- You do not have access to specific user data
- You cannot process payments or refunds directly
- You can only provide general information`;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Safe type guard for conversation count
 */
function safeConversationCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
}

/**
 * Basic input sanitization - remove control characters
 */
function sanitizeInput(input: string): string {
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
 * Basic prompt injection defense - escape delimiters and wrap user message
 */
function defensiveFramePrompt(message: string): string {
  // Escape < and > to prevent breaking out of the framing tag
  const escaped = message
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<user_message>${escaped}</user_message>`;
}

// ============================================================================
// Service
// ============================================================================

export const conciergeService = {
  /**
   * Handle chat message from user
   */
  async chat(request: ConciergeRequest): Promise<ConciergeResponse> {
    const { message, userId } = request;

    // Check if concierge service is enabled
    const enabled = await configService.getBoolean('support.enabled', true);
    if (!enabled) {
      throw new AppError('Concierge service is currently unavailable', 503);
    }

    // Sanitize input
    const sanitizedMessage = sanitizeInput(message);

    logger.info({ userId, messageLength: sanitizedMessage.length }, 'Concierge: Processing chat');

    try {
      // Get config values
      const [temperature, maxTokens, model, systemPrompt] = await Promise.all([
        configService.getNumber('support.temperature', 0.7),
        configService.getNumber('support.max_tokens', 1000),
        configService.get('support.model'),
        configService.get('support.system_prompt', DEFAULT_SYSTEM_PROMPT),
      ]);

      // Build messages with defensive framing
      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: defensiveFramePrompt(sanitizedMessage) },
      ];

      // Call LLM with model from config
      const llmResponse = await llmService.chat({
        messages,
        model,
        temperature,
        maxTokens,
      });

      const response = llmResponse.content;

      logger.info({ userId, responseLength: response.length }, 'Concierge: Chat completed');

      // Save user context for Concierge history (non-fatal, awaited)
      await withSanitizedErrors('concierge.contextFind', userId, () =>
        userContextRepository.findByUserAndProduct(userId, CONCIERGE_PRODUCT_ID)
      )
        .then((existing) => {
          const existingData = existing?.contextData || {};
          // Use safe type guard for conversation count
          const conversationCount = safeConversationCount(existingData.conversationCount);

          return withSanitizedErrors('concierge.contextUpsert', userId, () =>
            userContextRepository.upsert(userId, CONCIERGE_PRODUCT_ID, {
              ...existingData,
              lastMessage: sanitizedMessage.substring(0, 500), // Truncate for storage
              lastResponse: response.substring(0, 2000),
              conversationCount: conversationCount + 1,
              lastInteraction: new Date().toISOString(),
            })
          );
        })
        .catch((contextError) => {
          logger.warn({ error: contextError }, 'Concierge: Failed to save user context');
        });

      return {
        response,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message, userId }, 'Concierge: Chat failed');

      // Re-throw as AppError with 500
      throw new AppError('Error processing request. Please try again.', 500);
    }
  },
};