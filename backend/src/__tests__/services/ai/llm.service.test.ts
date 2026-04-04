import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config before imports
vi.mock('../../../config/index', () => ({
  config: {
    ai: {
      provider: 'simulator',
      openaiApiKey: 'test-key',
      openaiModel: 'gpt-4o-mini',
      ollamaBaseUrl: 'http://localhost:11434',
      defaultOllamaChatModel: 'llama3',
      anthropicApiKey: 'test-key',
      anthropicModel: 'claude-3-haiku-20240307',
      geminiApiKey: 'test-key',
      geminiModel: 'gemini-1.5-flash',
    },
    db: {
      schema: 'public',
    },
  },
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { llmService, type LLMMessage } from '../../../services/ai/llm.service';

describe('LLMService - Provider Configuration', () => {
  it('should get current provider', () => {
    const provider = llmService.getProvider();
    expect(provider).toBeDefined();
  });

  it('should check if configured for production', () => {
    const isConfigured = llmService.isConfigured();
    expect(typeof isConfigured).toBe('boolean');
  });
});

describe('LLMService - Non-streaming (chat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('chat with simulator', () => {
    it('should return simulator response', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = await llmService.chat({ messages });

      expect(result.content).toContain('SIMULATOR');
      expect(result.model).toBe('simulator');
    });

    it('should handle system prompt', async () => {
      const messages = [
        { role: 'system' as const, content: 'You are a helpful assistant' },
        { role: 'user' as const, content: 'Hi' },
      ];

      const result = await llmService.chat({ messages });

      expect(result.content).toBeDefined();
    });

    it('should handle custom model', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];

      const result = await llmService.chat({ messages, model: 'custom-model' });

      expect(result.content).toBeDefined();
    });

    it('should handle temperature parameter', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];

      const result = await llmService.chat({ messages, temperature: 0.5 });

      expect(result.content).toBeDefined();
    });

    it('should handle maxTokens parameter', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];

      const result = await llmService.chat({ messages, maxTokens: 100 });

      expect(result.content).toBeDefined();
    });

    it('should handle empty messages', async () => {
      const result = await llmService.chat({ messages: [] });

      expect(result.content).toBeDefined();
    });

    it('should handle multiple messages', async () => {
      const messages: LLMMessage[] = [
        { role: 'system' as const, content: 'You are a coder' },
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const result = await llmService.chat({ messages });

      expect(result.content).toBeDefined();
    });
  });
});

describe('LLMService - Streaming', () => {
  describe('chatStream with simulator', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return content from simulator stream', async () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toContain('SIMULATOR');
      expect(result.content).toContain('Hello');
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('should call onChunk for each chunk', async () => {
      const messages = [{ role: 'user' as const, content: 'Test message' }];
      const chunks: string[] = [];

      await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(chunks.length).toBeGreaterThan(0);
      const fullContent = chunks.join('');
      expect(fullContent).toContain('Test message');
    });

    it('should handle empty messages array', async () => {
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages: [],
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toBeDefined();
    });

    it('should handle custom model in stream', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        model: 'custom-model',
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toBeDefined();
    });

    it('should handle temperature in stream', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        temperature: 0.3,
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toBeDefined();
    });

    it('should handle maxTokens in stream', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        maxTokens: 50,
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('chatStream fallback to non-streaming', () => {
    it('should fallback to chat when streaming is not available', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
      });

      expect(result.content).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('chatStream cancellation', () => {
    it('should accept AbortSignal without throwing', async () => {
      const messages = [{ role: 'user' as const, content: 'Cancel test' }];
      const chunks: string[] = [];
      const abortController = new AbortController();

      const result = await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
        signal: abortController.signal,
      });

      expect(result.content).toBeDefined();
    });
  });
});

describe('LLMService - Multiple Concurrent Requests', () => {
  it('should handle multiple concurrent chat requests', async () => {
    const messages = [{ role: 'user' as const, content: 'Test' }];

    const [result1, result2, result3] = await Promise.all([
      llmService.chat({ messages }),
      llmService.chat({ messages }),
      llmService.chat({ messages }),
    ]);

    expect(result1.content).toBeDefined();
    expect(result2.content).toBeDefined();
    expect(result3.content).toBeDefined();
  });

  it('should handle multiple concurrent stream requests', async () => {
    const messages = [{ role: 'user' as const, content: 'Test' }];

    const [result1, result2] = await Promise.all([
      llmService.chatStream({ messages }),
      llmService.chatStream({ messages }),
    ]);

    expect(result1.content).toBeDefined();
    expect(result2.content).toBeDefined();
  });
});
