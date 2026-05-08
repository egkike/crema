/**
 * LLM Service
 * Unified interface for LLM providers (OpenAI, Ollama, Anthropic, Gemini)
 * Supports chat completions for AI agents
 */

import https from 'node:https';

import { config } from '../../config/index';
import { configService } from '../config.service';
import logger from '../../utils/logger';
import { AppError } from '../../errors/AppError';

const DEFAULT_SIMULATOR_DELAY = 50;

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
  signal?: AbortSignal;
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

// Keep-alive HTTPS agent for external API calls (reuses TCP connections)
const httpsAgent = new https.Agent({ keepAlive: true });

// Undici extension for Node.js fetch (not in standard RequestInit)
interface UndiciRequestInit extends RequestInit {
  dispatcher?: https.Agent;
}

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
      const streamBase = { messages, ...requestOptions };
      const streamWithExtras: { messages: LLMMessage[]; onChunk?: (chunk: string) => void; signal?: AbortSignal; model?: string; temperature?: number; maxTokens?: number } = streamBase;
      if (onChunk) streamWithExtras.onChunk = onChunk;
      if (signal) streamWithExtras.signal = signal;

      switch (this.provider) {
        case 'openai':
          return await this.openAIStream(streamWithExtras);
        case 'ollama':
          return await this.ollamaStream(streamWithExtras);
        case 'anthropic':
          return await this.anthropicStream(streamWithExtras);
        case 'gemini':
          return await this.geminiStream(streamWithExtras);
        case 'simulator':
          return await this.simulatorStream(streamWithExtras);
        default:
          throw new Error(`Streaming not supported for provider: ${this.provider}`);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      // If streaming fails, not aborted, and is a real stream error (not just "stream" in message), try fallback
      const isStreamError = err.message.includes('stream') && 
        !err.message.includes('aborted') && 
        !err.message.includes('cancelled') &&
        !err.message.includes('timeout');
      
      if (!signal?.aborted && isStreamError) {
        logger.warn({ provider: this.provider, error: err.message }, 'Stream failed, falling back to non-streaming');
        
        const chatRequest: { messages: LLMMessage[]; model?: string; temperature?: number; maxTokens?: number; signal?: AbortSignal } = {
          messages: options.messages,
        };
        if (options.model !== undefined) chatRequest.model = options.model;
        if (options.temperature !== undefined) chatRequest.temperature = options.temperature;
        if (options.maxTokens !== undefined) chatRequest.maxTokens = options.maxTokens;
        if (signal) chatRequest.signal = signal;
        
        const response = await this.chat(chatRequest);
        
        // Simulate streaming with full response
        if (onChunk) {
          onChunk(response.content);
        }
        
        const streamResponse: { content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } } = {
          content: response.content,
        };
        if (response.usage) {
          streamResponse.usage = response.usage;
        }
        return streamResponse;
      }
      
      throw err;
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
      const fetchOptions: UndiciRequestInit = {
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
        dispatcher: httpsAgent,
      };
      if (request.signal) {
        fetchOptions.signal = request.signal;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', fetchOptions);

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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Failed to generate OpenAI chat response');
      throw err;
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

      const fetchOptions: UndiciRequestInit = {
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
        dispatcher: httpsAgent,
      };
      if (request.signal) {
        fetchOptions.signal = request.signal;
      }

      const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, fetchOptions);

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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Failed to generate Ollama chat response');
      throw err;
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

      const fetchOptions: UndiciRequestInit = {
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
        dispatcher: httpsAgent,
      };
      if (request.signal) {
        fetchOptions.signal = request.signal;
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', fetchOptions);

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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Failed to generate Anthropic chat response');
      throw err;
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

      const fetchOptions: UndiciRequestInit = {
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
        dispatcher: httpsAgent,
      };
      if (request.signal) {
        fetchOptions.signal = request.signal;
      }

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        fetchOptions
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      logger.error({ error: err.message }, 'Failed to generate Gemini chat response');
      throw err;
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

    const fetchOptions: UndiciRequestInit = {
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
      dispatcher: httpsAgent,
    };
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ provider: 'openai', status: response.status, detail: errorText }, 'OpenAI stream error');
      throw new Error('Stream processing failed');
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
        // Check abort signal during read
        if (options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        
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

    const fetchOptions: UndiciRequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        stream: true,
      }),
      dispatcher: httpsAgent,
    };
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ provider: 'ollama', status: response.status, detail: errorText }, 'Ollama stream error');
      throw new Error('Stream processing failed');
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        // Check abort signal during read
        if (options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        
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

    const fetchOptions: UndiciRequestInit = {
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
      dispatcher: httpsAgent,
    };
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', fetchOptions);

    if (!response.ok) {
      const error = await response.text();
      logger.error({ provider: 'anthropic', status: response.status, detail: error }, 'Anthropic stream error');
      throw new Error('Stream processing failed');
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
        // Check abort signal during read
        if (options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        
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

    const fetchOptions: UndiciRequestInit = {
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
      dispatcher: httpsAgent,
    };
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const error = await response.text();
      logger.error({ provider: 'gemini', status: response.status, detail: error }, 'Gemini stream error');
      throw new Error('Stream processing failed');
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        // Check abort signal during read
        if (options.signal?.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        
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
    signal?: AbortSignal;
  }): Promise<ChatStreamResponse> {
    const lastMessage = options.messages[options.messages.length - 1]?.content || '';
    const response = `[SIMULATOR] Received: "${lastMessage.substring(0, 30)}..." - This is a simulated stream response.`;
    
    // Check if already aborted before starting
    if (options.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    
    // Simulate streaming with small chunks
    const chunks = response.match(/.{1,10}/g) || [];
    const simDelay = await configService.getNumber('ai.simulator_delay', DEFAULT_SIMULATOR_DELAY);
    for (const chunk of chunks) {
      // Check abort signal in each iteration
      if (options.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      options.onChunk?.(chunk);
      await new Promise(resolve => setTimeout(resolve, simDelay));
    }
    
    return { content: response };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Build a simple prompt with context
   * Wraps user input with delimiters to prevent prompt injection
   * @throws Error if user input contains delimiter strings
   */
  buildPrompt(systemPrompt: string, context: string, userQuestion: string): LLMMessage[] {
    // Validate: reject input containing delimiter strings to prevent breaking
    if (userQuestion.includes('[USER_INPUT_START]') || userQuestion.includes('[USER_INPUT_END]')) {
      throw new AppError('Invalid input: reserved delimiter strings not allowed in description', 400);
    }

    return [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Context:\n${context}` },
      { role: 'user', content: `[USER_INPUT_START]\n${userQuestion}\n[USER_INPUT_END]` },
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
