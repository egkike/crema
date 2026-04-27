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

// Import AI services
import { llmService, type LLMMessage, type LLMRequest, type ChatStreamOptions } from './llm.service';
import { embeddingService } from './embedding.service';
import { conciergeService } from './concierge.service';

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
    throw new Error('Invalid input: must be an object');
  }

  const obj = input as Record<string, unknown>;

  if (!Array.isArray(obj.messages)) {
    throw new Error('Invalid input: messages is required and must be an array');
  }

  if (obj.messages.length === 0) {
    throw new Error('Invalid input: messages array cannot be empty');
  }

  for (const msg of obj.messages) {
    if (!msg || typeof msg !== 'object') {
      throw new Error('Invalid input: each message must be an object');
    }
    const m = msg as Record<string, unknown>;
    if (typeof m.role !== 'string' || typeof m.content !== 'string') {
      throw new Error('Invalid input: each message must have role and content as strings');
    }
    if (!['system', 'user', 'assistant'].includes(m.role as string)) {
      throw new Error('Invalid input: message role must be system, user, or assistant');
    }
  }
}

/**
 * Validate temperature range (0-2 for most LLMs)
 */
function validateTemperature(temp: unknown): void {
  if (temp !== undefined && (typeof temp !== 'number' || temp < 0 || temp > 2)) {
    throw new Error('Invalid input: temperature must be a number between 0 and 2');
  }
}

/**
 * Validate maxTokens positive integer
 */
function validateMaxTokens(maxTokens: unknown): void {
  if (maxTokens !== undefined) {
    if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens <= 0) {
      throw new Error('Invalid input: maxTokens must be a positive integer');
    }
  }
}

/**
 * Validate text input for embedding
 */
function validateTextInput(input: unknown): asserts input is { text: string } {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: must be an object');
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.text !== 'string' || obj.text.trim().length === 0) {
    throw new Error('Invalid input: text is required and must be a non-empty string');
  }
}

/**
 * Validate texts batch input
 */
function validateTextsInput(input: unknown): asserts input is { texts: string[] } {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input: must be an object');
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.texts)) {
    throw new Error('Invalid input: texts is required and must be an array');
  }
  if (obj.texts.length === 0) {
    throw new Error('Invalid input: texts array cannot be empty');
  }
  for (const text of obj.texts) {
    if (typeof text !== 'string') {
      throw new Error('Invalid input: each text must be a string');
    }
  }
}

/**
 * Validate model name (basic format check)
 */
function validateModel(model: unknown): void {
  if (model !== undefined && typeof model !== 'string') {
    throw new Error('Invalid input: model must be a string');
  }
}

// ============================================================================
// Skill definitions
// ============================================================================

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
    ],
    options: { timeout: 60000, retries: 2, cacheable: false, streaming: true },
    handler: async (input: unknown, context?: { onChunk?: (chunk: string) => void; signal?: AbortSignal }) => {
      validateLLMInput(input);
      validateTemperature(input.temperature);
      validateModel(input.model);

      const options: ChatStreamOptions = {
        messages: input.messages,
        model: input.model,
        temperature: input.temperature,
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
      { name: 'message', type: 'string', required: true },
      { name: 'userId', type: 'string', required: true },
    ],
    options: { timeout: 30000, retries: 2, cacheable: false },
    handler: async (input: unknown) => {
      if (!input || typeof input !== 'object') {
        throw new AppError('Invalid input: must be an object', 400);
      }
      const { message, userId } = input as { message: unknown; userId: unknown };
      
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
      
      return conciergeService.chat({ message, userId });
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