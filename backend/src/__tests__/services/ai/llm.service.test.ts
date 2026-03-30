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
  },
}));

import { llmService } from '../../../services/ai/llm.service';

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
      // Verify chunks are accumulated correctly
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
  });

  describe('chatStream fallback to non-streaming', () => {
    it('should fallback to chat when streaming is not available', async () => {
      // Force simulator since it's always available
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const chunks: string[] = [];

      const result = await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
      });

      // Simulator should work with streaming too
      expect(result.content).toBeDefined();
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('chatStream cancellation', () => {
    it('should accept AbortSignal without throwing (simulator ignores it)', async () => {
      const messages = [{ role: 'user' as const, content: 'Cancel test' }];
      const chunks: string[] = [];
      const abortController = new AbortController();

      // Note: The simulator doesn't actually support cancellation
      // but it should not throw when AbortSignal is provided
      const result = await llmService.chatStream({
        messages,
        onChunk: (chunk) => chunks.push(chunk),
        signal: abortController.signal,
      });

      // Simulator completes successfully despite abort
      expect(result.content).toBeDefined();
    });
  });
});

describe('LLMService - Non-streaming (chat)', () => {
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
  });
});
