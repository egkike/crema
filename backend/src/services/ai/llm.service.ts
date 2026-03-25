/**
 * LLM Service
 * Unified interface for LLM providers (OpenAI, Ollama, Anthropic, Gemini)
 * Supports chat completions for AI agents
 */

import { config } from '../../config/index';
import logger from '../../utils/logger';

// ============================================================================
// Types
// ============================================================================

export type LLMProvider = 'openai' | 'ollama' | 'anthropic' | 'gemini' | 'simulator';

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

const OPENAI_MODEL = config.ai.openaiModel;
const OLLAMA_MODEL = config.ai.defaultOllamaChatModel;
const OLLAMA_BASE_URL = config.ai.ollamaBaseUrl;
const ANTHROPIC_MODEL = config.ai.anthropicModel;
const GEMINI_MODEL = config.ai.geminiModel;

// ============================================================================
// LLM Service Class
// ============================================================================

export class LLMService {
  private provider: LLMProvider;

  constructor() {
    // Use provider from config, with fallback to auto-detect
    this.provider = config.ai.provider;
    
    // Log provider selection
    switch (this.provider) {
      case 'openai':
        logger.info('LLM Service: Using OpenAI');
        break;
      case 'ollama':
        logger.info(`LLM Service: Using Ollama at ${OLLAMA_BASE_URL}`);
        break;
      case 'anthropic':
        logger.info(`LLM Service: Using Anthropic (${ANTHROPIC_MODEL})`);
        break;
      case 'gemini':
        logger.info(`LLM Service: Using Gemini (${GEMINI_MODEL})`);
        break;
      default:
        logger.warn('LLM Service: Using simulator (not for production)');
    }
  }

  /**
   * Check if LLM service is properly configured for production use
   */
  isConfigured(): boolean {
    return ['openai', 'ollama', 'anthropic', 'gemini'].includes(this.provider);
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
      case 'anthropic':
        return this.anthropicChat(request);
      case 'gemini':
        return this.geminiChat(request);
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
    const apiKey = config.ai.openaiApiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = request.model || OPENAI_MODEL;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
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
  // Anthropic (Claude) Implementation
  // ============================================================================

  private async anthropicChat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = config.ai.anthropicApiKey;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const model = request.model || ANTHROPIC_MODEL;

    try {
      // Convert messages to Anthropic format
      const anthropicMessages = request.messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        }));

      // Get system prompt if exists
      const systemPrompt = request.messages.find(m => m.role === 'system')?.content || '';

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxTokens || 1024,
          temperature: request.temperature ?? 0.7,
          system: systemPrompt,
          messages: anthropicMessages,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Anthropic chat API error');
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const data = await response.json() as {
        content: Array<{ text: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      const content = data.content[0]?.text || '';
      const usage = data.usage;

      return {
        content,
        model,
        usage: {
          promptTokens: usage.input_tokens,
          completionTokens: usage.output_tokens,
          totalTokens: usage.input_tokens + usage.output_tokens,
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate Anthropic chat response');
      throw error;
    }
  }

  // ============================================================================
  // Google Gemini Implementation
  // ============================================================================

  private async geminiChat(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = config.ai.geminiApiKey;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = request.model || GEMINI_MODEL;

    try {
      // Convert messages to Gemini format
      const contents = request.messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        }));

      // Get system instruction if exists
      const systemInstruction = request.messages.find(m => m.role === 'system')?.content || '';

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
            contents,
            generationConfig: {
              temperature: request.temperature ?? 0.7,
              maxOutputTokens: request.maxTokens || 1024,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Gemini chat API error');
        throw new Error(`Gemini API error: ${response.status}`);
      }

      const data = await response.json() as {
        candidates?: Array<{
          content?: { parts?: Array<{ text: string }> };
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const usage = data.usageMetadata || {};

      return {
        content,
        model,
        usage: {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: (usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0),
        },
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate Gemini chat response');
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
