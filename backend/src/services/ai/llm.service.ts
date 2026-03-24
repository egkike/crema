/**
 * LLM Service
 * Unified interface for LLM providers (OpenAI, Ollama)
 * Supports chat completions for AI agents
 */

import { config } from '../../config/index';
import logger from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type LLMProvider = 'openai' | 'ollama' | 'simulator';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============================================================================
// Configuration (from centralized config)
// ============================================================================

const OPENAI_MODEL = config.ai.defaultChatModel;
const OLLAMA_MODEL = config.ai.defaultOllamaChatModel;
const OLLAMA_BASE_URL = config.ai.ollamaBaseUrl;

// ============================================================================
// LLM Service Class
// ============================================================================

export class LLMService {
  private apiKey: string;
  private provider: LLMProvider;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = config.ai.openaiApiKey;
    
    // Auto-detect provider based on available config
    if (this.apiKey) {
      this.provider = 'openai';
      logger.info('LLM Service: Using OpenAI');
    } else if (config.ai.ollamaEnabled || config.ai.ollamaBaseUrl) {
      this.provider = 'ollama';
      logger.info(`LLM Service: Using Ollama at ${OLLAMA_BASE_URL}`);
    } else {
      this.provider = 'simulator';
      logger.warn('LLM Service: No provider configured - using simulator (not for production)');
    }
  }

  /**
   * Check if LLM service is properly configured for production use
   */
  isConfigured(): boolean {
    return this.provider === 'openai' || this.provider === 'ollama';
  }

  /**
   * Get current provider
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Send a chat completion request
   */
  async chat(request: LLMRequest): Promise<LLMResponse> {
    switch (this.provider) {
      case 'openai':
        return this.openAIChat(request);
      case 'ollama':
        return this.ollamaChat(request);
      case 'simulator':
        return this.simulatorChat(request);
      default:
        throw new Error(`Unknown LLM provider: ${this.provider}`);
    }
  }

  // ============================================================================
  // OpenAI Implementation
  // ============================================================================

  private async openAIChat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = request.model || OPENAI_MODEL;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 500,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'OpenAI chat API error');
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      const choice = data.choices[0];
      if (!choice) {
        throw new Error('No response from OpenAI');
      }

      return {
        content: choice.message.content,
        model,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate OpenAI chat response');
      throw error;
    }
  }

  // ============================================================================
  // Ollama Implementation
  // ============================================================================

  private async ollamaChat(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model || OLLAMA_MODEL;

    try {
      // Convert messages to Ollama format
      const ollamaMessages = request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: ollamaMessages,
          temperature: request.temperature ?? 0.7,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Ollama chat API error');
        throw new Error(`Ollama API error: ${response.status}. Make sure Ollama is running with ${model} model.`);
      }

      const data = await response.json() as {
        message: { content: string };
        done: boolean;
        total_duration?: number;
        prompt_eval_count?: number;
        eval_count?: number;
      };

      if (!data.message) {
        throw new Error('No response from Ollama');
      }

      // Estimate tokens (Ollama doesn't provide exact counts)
      const promptTokens = data.prompt_eval_count || Math.ceil(request.messages.reduce((acc, m) => acc + m.content.length / 4, 0));
      const completionTokens = data.eval_count || Math.ceil(data.message.content.length / 4);

      return {
        content: data.message.content,
        model,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate Ollama chat response');
      throw error;
    }
  }

  // ============================================================================
  // Simulator (for development without API)
  // ============================================================================

  private simulatorChat(request: LLMRequest): LLMResponse {
    const lastMessage = request.messages[request.messages.length - 1]?.content || '';
    
    return {
      content: `[SIMULATOR] Received your message: "${lastMessage.substring(0, 50)}..."\n\nThis is a simulated response. Configure OpenAI API key or Ollama to use real LLM.`,
      model: 'simulator',
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Build a simple prompt with context
   */
  buildPrompt(systemPrompt: string, context: string, userQuestion: string): LLMMessage[] {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Context:\n${context}` },
      { role: 'user', content: userQuestion },
    ];
  }

  /**
   * Estimate cost for a request (OpenAI only)
   */
  estimateCost(tokens: number): number {
    if (this.provider !== 'openai') return 0;
    // GPT-4o mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens
    // Simplified estimation
    return (tokens / 1_000_000) * 0.40;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const llmService = new LLMService();
