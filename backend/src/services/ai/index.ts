/**
 * AI Services Boot Registration
 * Phase 2: Orchestrator SDD
 * 
 * Registers all AI services as skills in the Orchestrator at boot time
 * All handlers include input validation and parameter range checks
 */

import { skillsRegistry, type Skill } from '../skills-registry.service';
import logger from '../../utils/logger';
import { AppError } from '../../errors/AppError';
import type { EmbeddingSourceType } from '../../types/ai.types';
import type { ContentProcessingOptions } from '../../types/ai-content.types';

// Import AI services
import { llmService, type LLMMessage, type LLMRequest, type ChatStreamOptions } from './llm.service';
import { embeddingService } from './embedding.service';
import { conciergeService } from './concierge.service';
import { memoryService } from './memory.service';
import { aiCreditService } from './credits.service';
import { qaAgentService, tutorService, insightsService, analyticsService } from './agents.service';
import { contentAssistantService, type ProductType } from './content/content-assistant.service';
import { contentReaderService } from './content/content-reader.service';
import { quizGeneratorService, type QuizQuestionType } from './content/quiz-generator.service';
import { transcriptionService } from './content/transcription.service';
import { qaService } from './qa.service';
import { reviewService } from './review.service';
import { reportService } from './denunciation.service';

// ============================================================================
// Validation helpers
// ============================================================================

/**
 * Validate LLM input structure
 */
function validateLLMInput(input: unknown): asserts input is {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
} {
  if (!input || typeof input !== 'object') {
    throw new AppError('Invalid input: must be an object', 400);
  }

  const obj = input as Record<string, unknown>;

  if (!Array.isArray(obj.messages)) {
    throw new AppError('Invalid input: messages is required and must be an array', 400);
  }

  const messages = obj.messages;
  if (messages.length === 0) {
    throw new AppError('Invalid input: messages array cannot be empty', 400);
  }

  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      throw new AppError('Invalid input: each message must be an object', 400);
    }
    const m = msg as Record<string, unknown>;
    if (typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw new AppError('Invalid input: each message must have role and content as strings', 400);
    }
    if (!['system', 'user', 'assistant'].includes(m.role as string)) {
      throw new AppError('Invalid input: message role must be system, user, or assistant', 400);
    }
  }
}

/**
 * Validate temperature range (0-2 for most LLMs)
 */
function validateTemperature(temp: unknown): void {
  if (temp !== undefined && (typeof temp !== 'number' || temp < 0 || temp > 2)) {
    throw new AppError('Invalid input: temperature must be a number between 0 and 2', 400);
  }
}

/**
 * Validate maxTokens positive integer
 */
function validateMaxTokens(maxTokens: unknown): void {
  if (maxTokens !== undefined) {
    if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new AppError('Invalid input: maxTokens must be a positive integer', 400);
    }
  }
}

/**
 * Validate text input for embedding
 */
function validateTextInput(input: unknown): asserts input is { text: string } {
  if (!input || typeof input !== 'object') {
    throw new AppError('Invalid input: must be an object', 400);
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.text !== 'string' || obj.text.trim().length === 0) {
    throw new AppError('Invalid input: text is required and must be a non-empty string', 400);
  }
}

/**
 * Validate texts batch input
 */
function validateTextsInput(input: unknown): asserts input is { texts: string[] } {
  if (!input || typeof input !== 'object') {
    throw new AppError('Invalid input: must be an object', 400);
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.texts)) {
    throw new AppError('Invalid input: texts is required and must be an array', 400);
  }
  if (obj.texts.length === 0) {
    throw new AppError('Invalid input: texts array cannot be empty', 400);
  }
  // WARNING: Add array size limit to prevent DoS
  if (obj.texts.length > 1000) {
    throw new AppError('texts array exceeds maximum size of 1000', 400);
  }
  for (const text of obj.texts) {
    if (typeof text !== 'string') {
      throw new AppError('Invalid input: each text must be a string', 400);
    }
  }
}

/**
 * Validate model name (basic format check)
 */
function validateModel(model: unknown): void {
  if (model !== undefined && typeof model !== 'string') {
    throw new AppError('Invalid input: model must be a string', 400);
  }
  // Log model for visibility (allows detecting unknown models in logs)
  if (model !== undefined) {
    logger.debug({ model }, 'LLM model requested');
  }
}

// ============================================================================
// Skill definitions
// ============================================================================
// NOTE: Rate limiting is handled at the API Gateway level (Orchestrator route),
// not in individual skill handlers. Configure rate limits in the route definitions.

const skills: Skill[] = [
  // ========================================================================
  // LLM Service Skills
  // ========================================================================
  {
    id: 'llm-chat',
    name: 'LLM Chat',
    capability: 'llm.chat',
    description: 'Chat completion with LLM (GPT, Claude, Gemini, Ollama)',
    parameters: [
      { name: 'messages', type: 'array', required: true },
      { name: 'model', type: 'string', required: false },
      { name: 'temperature', type: 'number', required: false },
      { name: 'maxTokens', type: 'number', required: false },
    ],
    options: { timeout: 60000, retries: 2, cacheable: false, streaming: false },
    handler: async (input: unknown) => {
      validateLLMInput(input);
      validateTemperature(input.temperature);
      validateMaxTokens(input.maxTokens);
      validateModel(input.model);

      const request: LLMRequest = {
        messages: input.messages,
        model: input.model,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      };
      return llmService.chat(request);
    },
  },
  {
    id: 'llm-stream',
    name: 'LLM Stream',
    capability: 'llm.stream',
    description: 'Streaming chat completion with LLM',
parameters: [
    { name: 'messages', type: 'array', required: true },
    { name: 'model', type: 'string', required: false },
    { name: 'temperature', type: 'number', required: false },
    { name: 'maxTokens', type: 'number', required: false },
  ],
    options: { timeout: 60000, retries: 2, cacheable: false, streaming: true },
    handler: async (input: unknown, context?: { onChunk?: (chunk: string) => void; signal?: AbortSignal }) => {
      validateLLMInput(input);
      validateTemperature(input.temperature);
      validateMaxTokens(input.maxTokens);
      validateModel(input.model);

const options: ChatStreamOptions = {
    messages: input.messages,
    model: input.model,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    onChunk: context?.onChunk,
    signal: context?.signal,
  };
      return llmService.chatStream(options);
    },
  },

  // ========================================================================
  // Embedding Service Skills
  // ========================================================================
  {
    id: 'embedding-generate',
    name: 'Embedding Generate',
    capability: 'embedding.generate',
    description: 'Generate vector embedding for text',
    parameters: [
      { name: 'text', type: 'string', required: true },
    ],
    options: { timeout: 30000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      validateTextInput(input);
      return embeddingService.generateEmbedding(input.text);
    },
  },
  {
    id: 'embedding-batch',
    name: 'Embedding Batch',
    capability: 'embedding.batch',
    description: 'Generate vector embeddings for multiple texts',
    parameters: [
      { name: 'texts', type: 'array', required: true },
    ],
    options: { timeout: 60000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      validateTextsInput(input);
      // Additional limit check in handler for defense in depth
      if (input.texts.length > 1000) {
        throw new AppError('texts array exceeds maximum batch size of 1000', 400);
      }
      return embeddingService.generateEmbeddings(input.texts);
    },
  },
  // ========================================================================
  // Concierge Service
  // ========================================================================
  {
    id: 'concierge-chat',
    name: 'Concierge Support',
    capability: 'concierge.chat',
    description: 'AI Support Chatbot for general user support',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'message', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
    ],
    options: { timeout: 30000, retries: 2, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, message, userId } = input as {
        requestingUserId: unknown;
        message: unknown;
        userId: unknown;
      };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate message
      if (typeof message !== 'string' || message.length === 0) {
        throw new AppError('message is required and must be a non-empty string', 400);
      }
      if (message.length > 2000) {
        throw new AppError('message must be less than 2000 characters', 400);
      }

      // Validate userId
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('userId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns this resource
      if (requestingUserId !== userId) {
        throw new AppError('Unauthorized access to user concierge', 403);
      }

      return conciergeService.chat({ message, userId });
    },
  },

  // ========================================================================
  // Memory Service Skills
  // ========================================================================
  {
    id: 'memory-search',
    name: 'Memory Search',
    capability: 'memory.search',
    description: 'Search similar content from memory/vector store',
    parameters: [
      { name: 'userId', type: 'string', required: false },
      { name: 'query', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false },
      { name: 'sourceTypes', type: 'array', required: false },
    ],
    options: { timeout: 30000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { userId, query, limit, sourceTypes } = input as {
        userId: unknown;
        query: unknown;
        limit: unknown;
        sourceTypes: unknown;
      };

      // Validate query (required)
      if (typeof query !== 'string' || query.trim().length === 0) {
        throw new AppError('query is required and must be a non-empty string', 400);
      }

      // Optional limit validation
      if (limit !== undefined) {
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
          throw new AppError('limit must be a positive integer between 1 and 100', 400);
        }
      }

      // Optional sourceTypes validation
      if (sourceTypes !== undefined) {
        if (!Array.isArray(sourceTypes)) {
          throw new AppError('sourceTypes must be an array', 400);
        }
        // WARNING: Add array size limit to prevent DoS
        if (sourceTypes.length > 20) {
          throw new AppError('sourceTypes array exceeds maximum size of 20', 400);
        }
        const validSourceTypes = ['lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard'];
        for (const type of sourceTypes) {
          if (typeof type !== 'string' || !validSourceTypes.includes(type)) {
            throw new AppError(`sourceTypes must be one of: ${validSourceTypes.join(', ')}`, 400);
          }
        }
      }

      // userId can be null for public search - only validate if provided
      if (userId !== null && userId !== undefined && typeof userId !== 'string') {
        throw new AppError('userId must be a string or null', 400);
      }

      return memoryService.searchSimilar(
        userId as string | null,
        query,
        limit as number | undefined,
        sourceTypes as EmbeddingSourceType[] | undefined
      );
    },
  },

  // ========================================================================
  // Credits Service Skills
  // ========================================================================
  {
    id: 'credits-balance',
    name: 'Credits Balance',
    capability: 'credits.balance',
    description: 'Get AI credits balance for user',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
    ],
    options: { timeout: 10000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, userId } = input as { requestingUserId: unknown; userId: unknown };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate userId (required)
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('userId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns this resource
      if (requestingUserId !== userId) {
        throw new AppError('Unauthorized access to user credits', 403);
      }

      return aiCreditService.getBalance(userId);
    },
  },

  // ========================================================================
  // Agent Service Skills (QA, Tutor, Insights, Analytics)
  // ========================================================================
  {
    id: 'qa-chat',
    name: 'QA Agent Chat',
    capability: 'qa.chat',
    description: 'AI-powered Q&A agent chat for products',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'productId', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
      { name: 'message', type: 'string', required: true },
    ],
    options: { timeout: 60000, retries: 2, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, productId, userId, message } = input as {
        requestingUserId: unknown;
        productId: unknown;
        userId: unknown;
        message: unknown;
      };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate message
      if (typeof message !== 'string' || message.length === 0) {
        throw new AppError('message is required and must be a non-empty string', 400);
      }
      if (message.length > 2000) {
        throw new AppError('message must be less than 2000 characters', 400);
      }

      // Validate productId
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new AppError('productId is required and must be a non-empty string', 400);
      }

      // Validate userId
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('userId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns or has access to the resource
      if (requestingUserId !== userId) {
        throw new AppError('Unauthorized access to user resource', 403);
      }

      return qaAgentService.chat(productId, userId, message);
    },
  },
  {
    id: 'tutor-chat',
    name: 'Tutor Chat',
    capability: 'tutor.chat',
    description: 'AI-powered tutor chat for learning',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'productId', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
      { name: 'message', type: 'string', required: true },
    ],
    options: { timeout: 60000, retries: 2, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, productId, userId, message } = input as {
        requestingUserId: unknown;
        productId: unknown;
        userId: unknown;
        message: unknown;
      };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate message
      if (typeof message !== 'string' || message.length === 0) {
        throw new AppError('message is required and must be a non-empty string', 400);
      }
      if (message.length > 2000) {
        throw new AppError('message must be less than 2000 characters', 400);
      }

      // Validate productId
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new AppError('productId is required and must be a non-empty string', 400);
      }

      // Validate userId
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('userId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns or has access to the resource
      if (requestingUserId !== userId) {
        throw new AppError('Unauthorized access to user resource', 403);
      }

      return tutorService.chat(productId, userId, message);
    },
  },
  {
    id: 'insights-ask',
    name: 'Insights Query',
    capability: 'insights.ask',
    description: 'Query analytics insights with natural language',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
      { name: 'naturalLanguageQuery', type: 'string', required: true },
    ],
    options: { timeout: 30000, retries: 2, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, userId, naturalLanguageQuery } = input as {
        requestingUserId: unknown;
        userId: unknown;
        naturalLanguageQuery: unknown;
      };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate query (required)
      if (typeof naturalLanguageQuery !== 'string' || naturalLanguageQuery.trim().length === 0) {
        throw new AppError('naturalLanguageQuery is required and must be a non-empty string', 400);
      }
      if (naturalLanguageQuery.length > 500) {
        throw new AppError('naturalLanguageQuery must be less than 500 characters', 400);
      }

      // Validate userId
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new AppError('userId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns this resource
      if (requestingUserId !== userId) {
        throw new AppError('Unauthorized access to user insights', 403);
      }

      return insightsService.query(userId, naturalLanguageQuery);
    },
  },
  {
    id: 'analytics-metrics',
    name: 'Analytics Metrics',
    capability: 'analytics.metrics',
    description: 'Get dashboard metrics for creator',
    parameters: [
      { name: 'requestingUserId', type: 'string', required: true },
      { name: 'creatorId', type: 'string', required: true },
      { name: 'startDate', type: 'string', required: false },
      { name: 'endDate', type: 'string', required: false },
    ],
    options: { timeout: 10000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { requestingUserId, creatorId, startDate, endDate } = input as {
        requestingUserId: unknown;
        creatorId: unknown;
        startDate: unknown;
        endDate: unknown;
      };

      // Validate requestingUserId (required for authorization)
      if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
        throw new AppError('requestingUserId is required and must be a non-empty string', 400);
      }

      // Validate creatorId (required)
      if (typeof creatorId !== 'string' || creatorId.length === 0) {
        throw new AppError('creatorId is required and must be a non-empty string', 400);
      }

      // Authorization: verify caller owns this dashboard
      if (requestingUserId !== creatorId) {
        throw new AppError('Unauthorized access to creator analytics', 403);
      }

      // Optional date validation (ISO format)
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      if (startDate !== undefined) {
        if (typeof startDate !== 'string' || !isoDateRegex.test(startDate)) {
          throw new AppError('startDate must be a valid ISO date string (YYYY-MM-DD)', 400);
        }
        const d = new Date(startDate);
        if (isNaN(d.getTime())) {
          throw new AppError('startDate must be a valid date', 400);
        }
        parsedStartDate = d;
      }
      if (endDate !== undefined) {
        if (typeof endDate !== 'string' || !isoDateRegex.test(endDate)) {
          throw new AppError('endDate must be a valid ISO date string (YYYY-MM-DD)', 400);
        }
        const d = new Date(endDate);
        if (isNaN(d.getTime())) {
          throw new AppError('endDate must be a valid date', 400);
        }
        parsedEndDate = d;
      }

      return analyticsService.getDashboardMetrics(creatorId, parsedStartDate, parsedEndDate);
    },
  },

  // ========================================================================
  // Content Service Skills
  // ========================================================================
{
  id: 'content-analyze',
  name: 'Content Analyze',
  capability: 'content.analyze',
  description: 'Analyze content (summary, topics, questions)',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'userId', type: 'string', required: false },
    { name: 'content', type: 'string', required: false },
    { name: 'filePath', type: 'string', required: false },
    { name: 'productType', type: 'string', required: false },
    { name: 'analysisType', type: 'string', required: true },
    { name: 'maxSummaryLength', type: 'number', required: false },
  ],
  options: { timeout: 60000, retries: 1, cacheable: true },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, userId, content, filePath, productType, analysisType, maxSummaryLength } = input as {
      requestingUserId: unknown;
      userId: unknown;
      content: unknown;
      filePath: unknown;
      productType: unknown;
      analysisType: unknown;
      maxSummaryLength: unknown;
    };

    // Authorization: verify caller owns this resource
    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (userId !== undefined && typeof userId !== 'string') {
      throw new AppError('userId must be a string if provided', 400);
    }
    // Authorization: if userId is provided and non-empty, verify ownership
    if (typeof userId === 'string' && userId.length > 0 && requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user content resource', 403);
    }

    // Validate analysisType (required)
    if (typeof analysisType !== 'string' || analysisType.length === 0) {
      throw new AppError('analysisType is required and must be a non-empty string', 400);
    }
    const validAnalysisTypes = ['summary', 'topics', 'questions', 'full'];
    if (!validAnalysisTypes.includes(analysisType)) {
      throw new AppError(`analysisType must be one of: ${validAnalysisTypes.join(', ')}`, 400);
    }

    // Validate content or filePath (at least one required)
    if (typeof content !== 'string' && typeof filePath !== 'string') {
      throw new AppError('Either content or filePath is required', 400);
    }
    if (typeof content === 'string' && content.length === 0) {
      throw new AppError('content must be a non-empty string if provided', 400);
    }
    // WARNING: Add content length limit to prevent DoS
    if (typeof content === 'string' && content.length > 50000) {
      throw new AppError('content exceeds maximum length of 50000 characters', 400);
    }
    if (typeof filePath === 'string' && filePath.length === 0) {
      throw new AppError('filePath must be a non-empty string if provided', 400);
    }

    // Optional userId validation (only validate if provided)
    if (userId !== undefined && (typeof userId !== 'string' || userId.length === 0)) {
      throw new AppError('userId must be a non-empty string if provided', 400);
    }

      // Optional productType validation
      let parsedProductType: ProductType | undefined;
      if (productType !== undefined) {
        if (typeof productType !== 'string') {
          throw new AppError('productType must be a string', 400);
        }
        const validProductTypes: ProductType[] = ['course', 'book', 'article', 'document', 'podcast', 'video'];
        if (!validProductTypes.includes(productType as ProductType)) {
          throw new AppError(`productType must be one of: ${validProductTypes.join(', ')}`, 400);
        }
        parsedProductType = productType as ProductType;
      }

      // Optional maxSummaryLength validation
      if (maxSummaryLength !== undefined) {
        if (typeof maxSummaryLength !== 'number' || !Number.isInteger(maxSummaryLength) || maxSummaryLength <= 0) {
          throw new AppError('maxSummaryLength must be a positive integer', 400);
        }
      }

      // analysisType is already validated above
      return contentAssistantService.analyze({
        userId: userId as string | undefined,
        content: content as string,
        filePath: filePath as string | undefined,
        productType: parsedProductType,
        analysisType: analysisType as 'summary' | 'topics' | 'questions' | 'full',
        maxSummaryLength: maxSummaryLength as number | undefined,
      });
    },
  },
{
  id: 'content-read',
  name: 'Content Read',
  capability: 'content.read',
  description: 'Read and extract content from files',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'filePath', type: 'string', required: true },
    { name: 'options', type: 'object', required: false },
  ],
  options: { timeout: 30000, retries: 1, cacheable: false },
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, filePath, options } = input as {
      requestingUserId: unknown;
      filePath: unknown;
      options: unknown;
    };

    // Authorization: verify caller is authenticated
    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }

    // Validate filePath (required)
    if (typeof filePath !== 'string' || filePath.length === 0) {
      throw new AppError('filePath is required and must be a non-empty string', 400);
    }
    // Path traversal validation is handled internally by contentReaderService.readContent

      // Optional options validation
      let parsedOptions: Partial<ContentProcessingOptions> | undefined;
      if (options !== undefined) {
        if (typeof options !== 'object') {
          throw new AppError('options must be an object', 400);
        }
        const opts = options as { countWords?: unknown };
        if (opts.countWords !== undefined && typeof opts.countWords !== 'boolean') {
          throw new AppError('options.countWords must be a boolean', 400);
        }
        parsedOptions = { countWords: opts.countWords as boolean | undefined };
      }

      return contentReaderService.readContent(filePath, parsedOptions);
    },
  },
  {
    id: 'content-quiz',
    name: 'Content Quiz',
    capability: 'content.quiz',
    description: 'Generate quiz questions from content',
    parameters: [
      { name: 'userId', type: 'string', required: false },
      { name: 'content', type: 'string', required: false },
      { name: 'filePath', type: 'string', required: false },
      { name: 'productType', type: 'string', required: false },
      { name: 'options', type: 'object', required: false },
    ],
    options: { timeout: 60000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { userId, content, filePath, productType, options } = input as {
        userId: unknown;
        content: unknown;
        filePath: unknown;
        productType: unknown;
        options: unknown;
      };

      // Validate content or filePath (at least one required)
      if (typeof content !== 'string' && typeof filePath !== 'string') {
        throw new AppError('Either content or filePath is required', 400);
      }
      if (typeof content === 'string' && content.length === 0) {
        throw new AppError('content must be a non-empty string if provided', 400);
      }
      // Add content length limit to prevent DoS
      if (typeof content === 'string' && content.length > 50000) {
        throw new AppError('content exceeds maximum length of 50000 characters', 400);
      }
      if (typeof filePath === 'string' && filePath.length === 0) {
        throw new AppError('filePath must be a non-empty string if provided', 400);
      }

      // Optional userId validation
      if (userId !== undefined && (typeof userId !== 'string' || userId.length === 0)) {
        throw new AppError('userId must be a non-empty string if provided', 400);
      }

      // Optional productType validation
      if (productType !== undefined && typeof productType !== 'string') {
        throw new AppError('productType must be a string', 400);
      }
      // Add productType enum validation similar to content-analyze
      if (productType !== undefined) {
        const validProductTypes: string[] = ['course', 'book', 'article', 'document', 'podcast', 'video'];
        if (!validProductTypes.includes(productType as string)) {
          throw new AppError(`productType must be one of: ${validProductTypes.join(', ')}`, 400);
        }
      }

      // Optional options validation
      let parsedOptions: {
        questionCount?: number;
        questionTypes?: QuizQuestionType[];
        difficulty?: 'easy' | 'medium' | 'hard';
        language?: 'es' | 'en';
      } | undefined;
      if (options !== undefined) {
        if (typeof options !== 'object') {
          throw new AppError('options must be an object', 400);
        }
        const opts = options as Record<string, unknown>;
        if (
          opts.questionCount !== undefined &&
          (typeof opts.questionCount !== 'number' ||
            !Number.isInteger(opts.questionCount) ||
            opts.questionCount <= 0 ||
            opts.questionCount > 50)
        ) {
          throw new AppError('options.questionCount must be a positive integer between 1 and 50', 400);
        }
        if (opts.questionTypes !== undefined) {
          if (!Array.isArray(opts.questionTypes)) {
            throw new AppError('options.questionTypes must be an array', 400);
          }
          const validQuestionTypes: QuizQuestionType[] = ['multiple-choice', 'true-false', 'fill-blank', 'matching'];
          for (const qt of opts.questionTypes) {
            if (typeof qt !== 'string' || !validQuestionTypes.includes(qt as QuizQuestionType)) {
              throw new AppError(`options.questionTypes must be one of: ${validQuestionTypes.join(', ')}`, 400);
            }
          }
        }
        if (opts.difficulty !== undefined) {
          if (typeof opts.difficulty !== 'string') {
            throw new AppError('options.difficulty must be a string', 400);
          }
          const validDifficulties = ['easy', 'medium', 'hard'];
          if (!validDifficulties.includes(opts.difficulty)) {
            throw new AppError(`options.difficulty must be one of: ${validDifficulties.join(', ')}`, 400);
          }
        }
        if (opts.language !== undefined) {
          if (typeof opts.language !== 'string') {
            throw new AppError('options.language must be a string', 400);
          }
          const validLanguages = ['es', 'en'];
          if (!validLanguages.includes(opts.language)) {
            throw new AppError(`options.language must be one of: ${validLanguages.join(', ')}`, 400);
          }
        }
        parsedOptions = {
          questionCount: opts.questionCount as number | undefined,
          questionTypes: opts.questionTypes as QuizQuestionType[] | undefined,
          difficulty: opts.difficulty as 'easy' | 'medium' | 'hard' | undefined,
          language: opts.language as 'es' | 'en' | undefined,
        };
      }

      // productType already validated above
      let parsedProductType: ProductType | undefined;
      if (productType !== undefined) {
        parsedProductType = productType as ProductType;
      }

      return quizGeneratorService.generate({
        userId: userId as string | undefined,
        content: content as string | undefined,
        filePath: filePath as string | undefined,
        productType: parsedProductType,
        options: parsedOptions,
      });
    },
  },
{
  id: 'content-transcribe',
  name: 'Content Transcribe',
  capability: 'content.transcribe',
  description: 'Transcribe audio/video to text',
  parameters: [
    { name: 'requestingUserId', type: 'string', required: true },
    { name: 'userId', type: 'string', required: true },
    { name: 'file', type: 'object', required: true },
    { name: 'fileName', type: 'string', required: false },
    { name: 'mimeType', type: 'string', required: false },
  ],
  options: { timeout: 120000, retries: 1, cacheable: false },
  // Note: Usage tracking for transcription is in-memory; use Redis/DB for production
  handler: async (input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new AppError('Invalid input: must be an object', 400);
    }
    const { requestingUserId, userId, file, fileName, mimeType } = input as {
      requestingUserId: unknown;
      userId: unknown;
      file: unknown;
      fileName: unknown;
      mimeType: unknown;
    };

    // Authorization: verify caller owns this resource
    if (typeof requestingUserId !== 'string' || requestingUserId.length === 0) {
      throw new AppError('requestingUserId is required', 400);
    }
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new AppError('userId is required and must be a non-empty string', 400);
    }
    if (requestingUserId !== userId) {
      throw new AppError('Unauthorized access to user transcription resource', 403);
    }

      // Validate file (Buffer)
      if (!file) {
        throw new AppError('file is required and must be a Buffer object', 400);
      }

      // Convert file to Buffer FIRST to check actual byte size
      // Handle both direct Buffer and object format { type: 'Buffer', data: number[] }
      const buffer = Buffer.isBuffer(file)
        ? file
        : (() => {
            if (!file || typeof file !== 'object') {
              throw new AppError('file must be a Buffer object', 400);
            }
const fileObj = file as { type?: string; data?: number[] };
  // Use || to ensure EITHER type is Buffer OR data is array triggers error
  if (fileObj.type !== 'Buffer' || !Array.isArray(fileObj.data)) {
    throw new AppError('file must be a Buffer object', 400);
  }
            return Buffer.from(fileObj.data || []);
          })();

      // WARNING: Validate actual buffer byte size to prevent DoS (25MB max)
      // Must check after creating Buffer because array length != byte length
      if (buffer.length > 25 * 1024 * 1024) {
        throw new AppError('File buffer exceeds maximum size of 25MB', 400);
      }

      // Optional fileName validation
      if (fileName !== undefined && typeof fileName !== 'string') {
        throw new AppError('fileName must be a string', 400);
      }

      // Optional mimeType validation
      if (mimeType !== undefined && typeof mimeType !== 'string') {
        throw new AppError('mimeType must be a string', 400);
      }
      // Validate MIME type format - must be audio/* or video/*
      if (mimeType !== undefined) {
        const isValidMimeType = /^audio\//.test(mimeType as string) || /^video\//.test(mimeType as string);
        if (!isValidMimeType) {
          throw new AppError('mimeType must be audio/* or video/*', 400);
        }
      }

      return transcriptionService.transcribe({
        userId,
        file: buffer,
        fileName: fileName as string | undefined,
        mimeType: mimeType as string | undefined,
      });
    },
  },

  // ========================================================================
  // QA & Review Service Skills
  // ========================================================================
  {
    id: 'qa-list',
    name: 'QA List',
    capability: 'qa.list',
    description: 'Get questions for a product',
    parameters: [
      { name: 'productId', type: 'string', required: true },
      { name: 'includeUnpublished', type: 'boolean', required: false },
      { name: 'limit', type: 'number', required: false },
      { name: 'offset', type: 'number', required: false },
    ],
    options: { timeout: 10000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { productId, includeUnpublished, limit, offset } = input as {
        productId: unknown;
        includeUnpublished: unknown;
        limit: unknown;
        offset: unknown;
      };

      // Validate productId (required)
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new AppError('productId is required and must be a non-empty string', 400);
      }

      // Optional includeUnpublished validation
      if (includeUnpublished !== undefined && typeof includeUnpublished !== 'boolean') {
        throw new AppError('includeUnpublished must be a boolean', 400);
      }

      // Optional limit validation
      if (limit !== undefined) {
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
          throw new AppError('limit must be a positive integer between 1 and 100', 400);
        }
      }

      // Optional offset validation
      if (offset !== undefined) {
        if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
          throw new AppError('offset must be a non-negative integer', 400);
        }
      }

      return qaService.getQuestions(
        productId,
        includeUnpublished as boolean | undefined,
        limit as number | undefined,
        offset as number | undefined
      );
    },
  },
  {
    id: 'review-list',
    name: 'Review List',
    capability: 'review.list',
    description: 'Get reviews for a product',
    parameters: [
      { name: 'productId', type: 'string', required: true },
      { name: 'includeUnpublished', type: 'boolean', required: false },
      { name: 'limit', type: 'number', required: false },
      { name: 'offset', type: 'number', required: false },
    ],
    options: { timeout: 10000, retries: 1, cacheable: true },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { productId, includeUnpublished, limit, offset } = input as {
        productId: unknown;
        includeUnpublished: unknown;
        limit: unknown;
        offset: unknown;
      };

      // Validate productId (required)
      if (typeof productId !== 'string' || productId.length === 0) {
        throw new AppError('productId is required and must be a non-empty string', 400);
      }

      // Optional includeUnpublished validation
      if (includeUnpublished !== undefined && typeof includeUnpublished !== 'boolean') {
        throw new AppError('includeUnpublished must be a boolean', 400);
      }

      // Optional limit validation
      if (limit !== undefined) {
        if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0 || limit > 100) {
          throw new AppError('limit must be a positive integer between 1 and 100', 400);
        }
      }

      // Optional offset validation
      if (offset !== undefined) {
        if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
          throw new AppError('offset must be a non-negative integer', 400);
        }
      }

      return reviewService.getReviews(
        productId,
        includeUnpublished as boolean | undefined,
        limit as number | undefined,
        offset as number | undefined
      );
    },
  },

  // ========================================================================
  // Report/Denunciation Service Skills
  // ========================================================================
  {
    id: 'reports-create',
    name: 'Report Create',
    capability: 'reports.create',
    description: 'Create a report/denunciation for content',
    parameters: [
      { name: 'reporterId', type: 'string', required: true },
      { name: 'contentType', type: 'string', required: true },
      { name: 'contentId', type: 'string', required: true },
      { name: 'reasonCode', type: 'string', required: true },
      { name: 'description', type: 'string', required: false },
    ],
    options: { timeout: 30000, retries: 1, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { reporterId, contentType, contentId, reasonCode, description } = input as {
        reporterId: unknown;
        contentType: unknown;
        contentId: unknown;
        reasonCode: unknown;
        description: unknown;
      };

      // Validate reporterId (required)
      if (typeof reporterId !== 'string' || reporterId.length === 0) {
        throw new AppError('reporterId is required and must be a non-empty string', 400);
      }

      // Validate contentType (required)
      if (typeof contentType !== 'string' || contentType.length === 0) {
        throw new AppError('contentType is required and must be a non-empty string', 400);
      }
      const validContentTypes = ['product', 'review', 'question', 'answer', 'faq', 'user'];
      if (!validContentTypes.includes(contentType)) {
        throw new AppError(`contentType must be one of: ${validContentTypes.join(', ')}`, 400);
      }

      // Validate contentId (required)
      if (typeof contentId !== 'string' || contentId.length === 0) {
        throw new AppError('contentId is required and must be a non-empty string', 400);
      }

      // Validate reasonCode (required)
      if (typeof reasonCode !== 'string' || reasonCode.length === 0) {
        throw new AppError('reasonCode is required and must be a non-empty string', 400);
      }

      // Optional description validation
      if (description !== undefined) {
        if (typeof description !== 'string') {
          throw new AppError('description must be a string', 400);
        }
        if (description.length > 1000) {
          throw new AppError('description must be less than 1000 characters', 400);
        }
      }

      // contentType and contentId are already type-narrowed from the validContentTypes check above
      return reportService.createReport(
        reporterId,
        contentType as 'product' | 'review' | 'question' | 'answer' | 'faq' | 'user',
        contentId as string,
        reasonCode as string,
        description as string | undefined
      );
    },
  },
];

// ============================================================================
// Registration function
// ============================================================================

/**
 * Register all AI services as Orchestrator skills
 * Called at application boot time
 * 
 * @throws Error if any skill fails to register (consistent with Scheduler pattern)
 */
export async function registerAISkills(): Promise<void> {
  logger.info('AI Services: Starting skills registration...');

  // Register all skills
  const results = await Promise.allSettled(
    skills.map(async (skill) => {
      await skillsRegistry.register(skill);
      return skill.capability;
    })
  );

  // Log results
  let successCount = 0;
  let failCount = 0;
  const failedSkills: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successCount++;
      logger.info({ capability: result.value }, 'AI Services: Skill registered');
    } else {
      failCount++;
      const capability = skills[index].capability;
      failedSkills.push(capability);
      logger.error(
        { capability, error: result.reason },
        'AI Services: Failed to register skill'
      );
    }
  });

  logger.info(
    { success: successCount, failed: failCount },
    'AI Services: Skills registration complete'
  );

  // Throw on any failure — consistent with Scheduler "Fallo crítico" pattern
  if (failCount > 0) {
    logger.error(
      { failedSkills, total: skills.length, failed: failCount },
      'AI Services: CRITICAL — Some skills failed to register'
    );
    throw new Error(`AI Services: Failed to register ${failCount}/${skills.length} skills: ${failedSkills.join(', ')}`);
  }
}