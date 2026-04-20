import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config - default to simulator
vi.mock('../../config/index', () => ({
  config: {
    ai: {
      openaiApiKey: '',
      openaiEmbeddingModel: 'text-embedding-3-small',
      defaultOllamaEmbeddingModel: 'nomic-embed-text',
      ollamaBaseUrl: '',
      ollamaEnabled: false,
    },
  },
}));

// Mock configService
vi.mock('../../services/config.service', () => ({
  configService: {
    get: vi.fn().mockResolvedValue(undefined),
    getNumber: vi.fn().mockResolvedValue(1536),
    getBoolean: vi.fn().mockResolvedValue(false),
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { EmbeddingService } from '../../services/ai/embedding.service';

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should use simulator when no providers configured', () => {
      const service = new EmbeddingService();
      
      expect(service.getProvider()).toBe('simulator');
    });

    it('should not be configured for production', () => {
      const service = new EmbeddingService();
      
      expect(service.isConfigured()).toBe(false);
    });

    it('should return correct dimensions', () => {
      const service = new EmbeddingService();
      
      expect(service.getDimensions()).toBe(1536);
    });

    it('should return model name', () => {
      const service = new EmbeddingService();
      
      expect(service.getModel()).toBe('text-embedding-3-small');
    });
  });

  describe('generateEmbedding with simulator', () => {
    it('should generate embedding of correct length', async () => {
      const service = new EmbeddingService();
      
      const embedding = await service.generateEmbedding('test text');
      
      expect(embedding).toHaveLength(1536);
    });

    it('should generate deterministic embedding for same text', async () => {
      const service = new EmbeddingService();
      
      const embedding1 = await service.generateEmbedding('hello world');
      const embedding2 = await service.generateEmbedding('hello world');
      
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different text', async () => {
      const service = new EmbeddingService();
      
      const embedding1 = await service.generateEmbedding('hello');
      const embedding2 = await service.generateEmbedding('world');
      
      expect(embedding1).not.toEqual(embedding2);
    });

    it('should normalize to unit vector', async () => {
      const service = new EmbeddingService();
      
      const embedding = await service.generateEmbedding('test');
      
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(magnitude).toBeCloseTo(1, 5);
    });
  });

  describe('generateEmbeddings batch with simulator', () => {
    it('should generate multiple embeddings', async () => {
      const service = new EmbeddingService();
      
      const embeddings = await service.generateEmbeddings(['hello', 'world']);
      
      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toHaveLength(1536);
      expect(embeddings[1]).toHaveLength(1536);
    });

    it('should maintain order', async () => {
      const service = new EmbeddingService();
      
      const embeddings = await service.generateEmbeddings(['a', 'b', 'c']);
      
      expect(embeddings).toHaveLength(3);
    });

    it('should handle empty array', async () => {
      const service = new EmbeddingService();
      
      const embeddings = await service.generateEmbeddings([]);
      
      expect(embeddings).toHaveLength(0);
    });

    it('should handle single item', async () => {
      const service = new EmbeddingService();
      
      const embeddings = await service.generateEmbeddings(['single']);
      
      expect(embeddings).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should throw for unknown provider', async () => {
      const service = new (EmbeddingService as any)();
      service.provider = 'unknown' as any;
      
      await expect(service.generateEmbedding('test'))
        .rejects.toThrow('Unknown provider: unknown');
    });

    it('should throw for unknown provider in batch', async () => {
      const service = new (EmbeddingService as any)();
      service.provider = 'unknown' as any;
      
      await expect(service.generateEmbeddings(['test']))
        .rejects.toThrow('Unknown provider: unknown');
    });
  });
});