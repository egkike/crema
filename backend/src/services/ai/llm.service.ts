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
// Chat Stream Types
// ============================================================================

export interface ChatStreamOptions {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface ChatStreamResponse {
  content: string;
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

  /**
   * Chat with streaming response
   */
  async chatStream(options: ChatStreamOptions): Promise<ChatStreamResponse> {
    const { messages, onChunk, signal, ...requestOptions } = options;

    try {
      switch (this.provider) {
        case 'openai':
          return await this.openAIStream({ ...requestOptions, messages, onChunk, signal });
        case 'ollama':
          return await this.ollamaStream({ ...requestOptions, messages, onChunk, signal });
        case 'anthropic':
          return await this.anthropicStream({ ...requestOptions, messages, onChunk, signal });
        case 'gemini':
          return await this.geminiStream({ ...requestOptions, messages, onChunk, signal });
        case 'simulator':
          return await this.simulatorStream({ ...requestOptions, messages, onChunk });
        default:
          throw new Error(`Streaming not supported for provider: ${this.provider}`);
      }
    } catch (error: any) {
      // If streaming fails and not cancelled, try fallback to non-streaming
      if (!signal?.aborted && error.message?.includes('stream')) {
        logger.warn({ provider: this.provider, error: error.message }, 'Stream failed, falling back to non-streaming');
        
        const response = await this.chat({
          messages: options.messages,
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
        });
        
        // Simulate streaming with full response
        if (onChunk) {
          onChunk(response.content);
        }
        
        return { content: response.content, usage: response.usage };
      }
      
      throw error;
    }
  }

  // ============================================================================
  // OpenAI Streaming Implementation
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
  // OpenAI Stream Implementation
  // ============================================================================

  private async openAIStream(options: {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<ChatStreamResponse> {
    const apiKey = config.ai.openaiApiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const model = options.model || OPENAI_MODEL;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 500,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI stream error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            
            if (delta) {
              fullContent += delta;
              options.onChunk?.(delta);
            }
            
            if (parsed.usage) {
              usage = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent, usage };
  }

  // ============================================================================
  // Ollama Stream Implementation
  // ============================================================================

  private async ollamaStream(options: {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<ChatStreamResponse> {
    const model = options.model || OLLAMA_MODEL;

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama stream error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            const content = data.message?.content;
            
            if (content) {
              fullContent += content;
              options.onChunk?.(content);
            }
          } catch {
            // Skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent };
  }

  // ============================================================================
  // Anthropic Stream Implementation
  // ============================================================================

  private async anthropicStream(options: {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<ChatStreamResponse> {
    const apiKey = config.ai.anthropicApiKey;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const model = options.model || ANTHROPIC_MODEL;

    // Convertir mensajes al formato de Anthropic
    const anthropicMessages = options.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      }));

    const systemPrompt = options.messages.find(m => m.role === 'system')?.content || '';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'x-stream': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens || 1024,
        temperature: options.temperature ?? 0.7,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic stream error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            
            // Anthropic envía "message_delta" con el contenido
            if (parsed.type === 'content_block_delta') {
              const text = parsed.delta?.text;
              if (text) {
                fullContent += text;
                options.onChunk?.(text);
              }
            }
            
            // Track usage cuando termina
            if (parsed.type === 'message_delta' && parsed.usage) {
              usage = {
                promptTokens: parsed.usage.input_tokens,
                completionTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
              };
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent, usage };
  }

  // ============================================================================
  // Gemini Stream Implementation
  // ============================================================================

  private async geminiStream(options: {
    messages: LLMMessage[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    onChunk?: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<ChatStreamResponse> {
    const apiKey = config.ai.geminiApiKey;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const model = options.model || GEMINI_MODEL;

    // Convertir mensajes al formato de Gemini
    const contents = options.messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const systemInstruction = options.messages.find(m => m.role === 'system')?.content || '';

    const url = `https://generativelanguage.googleapis.com/v1beta/${model}:streamGenerateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini stream error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          
          try {
            const parsed = JSON.parse(data);
            
            // Gemini envía candidatos con partes
            const candidate = parsed?.candidates?.[0];
            const part = candidate?.content?.parts?.[0];
            const text = part?.text;
            
            if (text) {
              fullContent += text;
              options.onChunk?.(text);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return { content: fullContent };
  }

  // ============================================================================
  // Simulator Stream Implementation
  // ============================================================================

  private async simulatorStream(options: {
    messages: LLMMessage[];
    onChunk?: (chunk: string) => void;
  }): Promise<ChatStreamResponse> {
    const lastMessage = options.messages[options.messages.length - 1]?.content || '';
    const response = `[SIMULATOR] Received: "${lastMessage.substring(0, 30)}..." - This is a simulated stream response.`;
    
    // Simulate streaming with small chunks
    const chunks = response.match(/.{1,10}/g) || [];
    for (const chunk of chunks) {
      options.onChunk?.(chunk);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate delay
    }
    
    return { content: response };
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
