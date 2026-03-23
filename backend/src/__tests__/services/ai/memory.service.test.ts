import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { memoryService } from '../../../services/ai/memory.service';
import { memoryRepository } from '../../../repositories/ai/memory.repository';
import { embeddingService } from '../../../services/ai/embedding.service';
import { aiCreditService } from '../../../services/ai/credits.service';
import { AppError } from '../../../errors/AppError';
import type { EmbeddingSourceType } from '../../../types/ai.types';

// Mocks
vi.mock('../../../repositories/ai/memory.repository', () => ({
  memoryRepository: {
    createEmbedding: vi.fn(),
    getBySource: vi.fn(),
    getByUser: vi.fn(),
    deleteBySource: vi.fn(),
    semanticSearch: vi.fn(),
    countBySourceType: vi.fn(),
    rebuildIndex: vi.fn(),
  },
}));

vi.mock('../../../services/ai/embedding.service', () => ({
  embeddingService: {
    isConfigured: vi.fn(),
    generateEmbedding: vi.fn(),
  },
}));

vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: {
    getOperationCost: vi.fn(),
    useCredits: vi.fn(),
  },
}));

vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Test constants
const USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const SOURCE_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('addEmbedding', () => {
    const sourceType: EmbeddingSourceType = 'lesson';
    const content = 'This is a test lesson content about TypeScript';

    it('should successfully create embedding when service is configured', async () => {
      vi.mocked(embeddingService.isConfigured).mockReturnValue(true);
      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);
      vi.mocked(memoryRepository.createEmbedding).mockResolvedValue({
        id: 'embedding-1',
        user_id: USER_ID,
        source_type: sourceType,
        source_id: SOURCE_ID,
        content,
        embedding: [0.1, 0.2, 0.3],
        metadata: {},
        created_at: new Date(),
      } as any);

      const result = await memoryService.addEmbedding(
        USER_ID,
        sourceType,
        SOURCE_ID,
        content,
        { module: 'Intro' }
      );

      expect(result.source_id).toBe(SOURCE_ID);
      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith(content);
    });

    it('should throw error when embedding service is not configured', async () => {
      vi.mocked(embeddingService.isConfigured).mockReturnValue(false);

      await expect(
        memoryService.addEmbedding(USER_ID, sourceType, SOURCE_ID, content)
      ).rejects.toThrow(AppError);

      await expect(
        memoryService.addEmbedding(USER_ID, sourceType, SOURCE_ID, content)
      ).rejects.toThrow('AI embedding service not configured');
    });
  });

  describe('addEmbeddingWithCredits', () => {
    const sourceType: EmbeddingSourceType = 'faq';
    const content = 'What is TypeScript?';

    it('should use credits and create embedding', async () => {
      vi.mocked(aiCreditService.getOperationCost).mockReturnValue(1);
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({} as any);
      vi.mocked(embeddingService.isConfigured).mockReturnValue(true);
      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue([0.1]);
      vi.mocked(memoryRepository.createEmbedding).mockResolvedValue({
        id: 'embedding-1',
        source_type: sourceType,
        source_id: SOURCE_ID,
      } as any);

      await memoryService.addEmbeddingWithCredits(
        USER_ID,
        sourceType,
        SOURCE_ID,
        content
      );

      expect(aiCreditService.useCredits).toHaveBeenCalledWith(
        USER_ID,
        1,
        `Embedding: ${sourceType}/${SOURCE_ID}`
      );
    });
  });

  describe('searchSimilar', () => {
    const query = 'How to learn TypeScript?';

    it('should return search results when service is configured', async () => {
      vi.mocked(embeddingService.isConfigured).mockReturnValue(true);
      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue([
        0.1, 0.2, 0.3,
      ]);
      vi.mocked(memoryRepository.semanticSearch).mockResolvedValue([
        {
          id: 'result-1',
          source_type: 'lesson',
          source_id: 'lesson-1',
          content: 'TypeScript basics',
          metadata: {},
          similarity: 0.95,
        },
        {
          id: 'result-2',
          source_type: 'faq',
          source_id: 'faq-1',
          content: 'What is TypeScript?',
          metadata: {},
          similarity: 0.88,
        },
      ]);

      await memoryService.searchSimilar(USER_ID, query, 10);

      expect(memoryRepository.semanticSearch).toHaveBeenCalled();
    });

    it('should filter by source types when provided', async () => {
      vi.mocked(embeddingService.isConfigured).mockReturnValue(true);
      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue([0.1]);
      vi.mocked(memoryRepository.semanticSearch).mockResolvedValue([]);

      await memoryService.searchSimilar(USER_ID, query, 10, ['lesson', 'faq']);

      expect(memoryRepository.semanticSearch).toHaveBeenCalledWith(
        expect.any(String),
        USER_ID,
        10,
        ['lesson', 'faq']
      );
    });

    it('should throw error when service is not configured', async () => {
      vi.mocked(embeddingService.isConfigured).mockReturnValue(false);

      await expect(
        memoryService.searchSimilar(USER_ID, query)
      ).rejects.toThrow('AI embedding service not configured');
    });
  });

  describe('searchSimilarWithCredits', () => {
    const query = 'What is React?';

    it('should use credits and perform search', async () => {
      vi.mocked(aiCreditService.getOperationCost).mockReturnValue(1);
      vi.mocked(aiCreditService.useCredits).mockResolvedValue({} as any);
      vi.mocked(embeddingService.isConfigured).mockReturnValue(true);
      vi.mocked(embeddingService.generateEmbedding).mockResolvedValue([0.1]);
      vi.mocked(memoryRepository.semanticSearch).mockResolvedValue([]);

      await memoryService.searchSimilarWithCredits(
        USER_ID,
        query
      );

      expect(aiCreditService.useCredits).toHaveBeenCalledWith(
        USER_ID,
        1,
        `Semantic search: ${query.slice(0, 50)}`
      );
    });
  });

  describe('deleteEmbedding', () => {
    it('should successfully delete embedding', async () => {
      vi.mocked(memoryRepository.deleteBySource).mockResolvedValue(true);

      await memoryService.deleteEmbedding('lesson', SOURCE_ID);

      expect(memoryRepository.deleteBySource).toHaveBeenCalledWith('lesson', SOURCE_ID);
    });

    it('should return false when embedding not found', async () => {
      vi.mocked(memoryRepository.deleteBySource).mockResolvedValue(false);

      const result = await memoryService.deleteEmbedding('lesson', SOURCE_ID);

      expect(result).toBe(false);
    });
  });

  describe('getEmbedding', () => {
    it('should return embedding when found', async () => {
      const mockEmbedding = {
        id: 'embedding-1',
        source_type: 'lesson',
        source_id: SOURCE_ID,
        content: 'Test content',
      };

      vi.mocked(memoryRepository.getBySource).mockResolvedValue(mockEmbedding as any);

      const result = await memoryService.getEmbedding('lesson', SOURCE_ID);

      expect(result).toEqual(mockEmbedding);
    });

    it('should return null when not found', async () => {
      vi.mocked(memoryRepository.getBySource).mockResolvedValue(null);

      const result = await memoryService.getEmbedding('lesson', SOURCE_ID);

      expect(result).toBeNull();
    });
  });

  describe('getUserEmbeddings', () => {
    it('should return user embeddings', async () => {
      const mockEmbeddings = [
        { id: 'e1', source_type: 'lesson' },
        { id: 'e2', source_type: 'faq' },
      ];

      vi.mocked(memoryRepository.getByUser).mockResolvedValue(mockEmbeddings as any);

      const result = await memoryService.getUserEmbeddings(USER_ID, 10);

      expect(result).toHaveLength(2);
      expect(memoryRepository.getByUser).toHaveBeenCalledWith(USER_ID, 10);
    });
  });

  describe('countBySourceType', () => {
    it('should return count of embeddings by source type', async () => {
      vi.mocked(memoryRepository.countBySourceType).mockResolvedValue(5);

      const result = await memoryService.countBySourceType('lesson');

      expect(result).toBe(5);
    });
  });

  describe('rebuildIndex', () => {
    it('should request index rebuild', async () => {
      vi.mocked(memoryRepository.rebuildIndex).mockResolvedValue({
        deleted: 10,
        message: 'Index rebuild requested',
      });

      const result = await memoryService.rebuildIndex(SOURCE_ID);

      expect(result.deleted).toBe(10);
      expect(result.message).toBe('Index rebuild requested');
    });
  });
});