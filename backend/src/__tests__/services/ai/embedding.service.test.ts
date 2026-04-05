import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config - use doMock to allow runtime changes
vi.doMock('../../../config/index', () => ({
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

  describe('generateEmbedding with simulator', () => {
    it('should generate embedding with simulator', async () => {
      const service = new EmbeddingService();
      const embedding = await service.generateEmbedding('Hello world');
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      expect(embedding.every(n => typeof n === 'number')).toBe(true);
    });

    it('should generate embedding for different texts', async () => {
      const service = new EmbeddingService();
      const embedding = await service.generateEmbedding('Hello');
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
    });

    it('should handle empty string', async () => {
      const service = new EmbeddingService();
      const embedding = await service.generateEmbedding('');
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
    });

    it('should handle long text', async () => {
      const service = new EmbeddingService();
      const longText = 'A'.repeat(10000);
      const embedding = await service.generateEmbedding(longText);
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
    });

    it('should generate embeddings', async () => {
      const service = new EmbeddingService();
      const embedding = await service.generateEmbedding('Test');
      
      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
    });
  });
});
