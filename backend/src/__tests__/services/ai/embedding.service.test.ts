import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock fetch - will be set up for each test
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock config - simulator is default (no API key, no Ollama)
vi.mock('../../../config/index', () => ({
  config: {
    ai: {
      openaiApiKey: '',
      openaiEmbeddingModel: 'text-embedding-3-small',
      defaultOllamaEmbeddingModel: 'nomic-embed-text',
      ollamaBaseUrl: 'http://localhost:11434',
      ollamaEnabled: false,
    },
  },
}));

import { EmbeddingService } from '../../../services/ai/embedding.service';

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic functionality', () => {
    it('should export embedding service', () => {
      // Just verify the service can be imported and instantiated
      const service = new EmbeddingService();
      expect(service).toBeDefined();
    });

    it('should have getProvider method', () => {
      const service = new EmbeddingService();
      expect(typeof service.getProvider).toBe('function');
    });

    it('should have isConfigured method', () => {
      const service = new EmbeddingService();
      expect(typeof service.isConfigured).toBe('function');
    });

    it('should have generateEmbedding method', () => {
      const service = new EmbeddingService();
      expect(typeof service.generateEmbedding).toBe('function');
    });
  });
});
