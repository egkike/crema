/**
 * Memory Service
 * Phase 1: Foundation (Memory + Credits)
 * Manages vector embeddings for semantic search across Crema content
 */

import type {
  AIEmbedding,
  EmbeddingSourceType,
  EmbeddingSearchResult,
} from '../../types/ai.types';
import { memoryRepository } from '../../repositories/ai/memory.repository';
import { AppError } from '../../errors/AppError';
import logger from '../../utils/logger';

import { embeddingService } from './embedding.service';
import { aiCreditService } from './credits.service';

export class MemoryService {
  /**
   * Add an embedding for content
   */
  async addEmbedding(
    userId: string | null,
    sourceType: EmbeddingSourceType,
    sourceId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<AIEmbedding> {
    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      throw new AppError('AI embedding service not configured', 503);
    }

    // Generate embedding
    const embedding = await embeddingService.generateEmbedding(content);

    // Store in database
    const result = await memoryRepository.createEmbedding(
      userId,
      sourceType,
      sourceId,
      content,
      embedding,
      metadata
    );

    logger.info({ sourceType, sourceId }, 'Embedding created');
    return result;
  }

  /**
   * Add embedding with credits (requires payment)
   */
  async addEmbeddingWithCredits(
    userId: string,
    sourceType: EmbeddingSourceType,
    sourceId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<AIEmbedding> {
    // Check credits
    const cost = aiCreditService.getOperationCost('search');
    await aiCreditService.useCredits(userId, cost, `Embedding: ${sourceType}/${sourceId}`);

    return this.addEmbedding(null, sourceType, sourceId, content, metadata);
  }

  /**
   * Search for similar content using semantic search
   */
  async searchSimilar(
    userId: string | null,
    query: string,
    limit: number = 10,
    sourceTypes?: EmbeddingSourceType[]
  ): Promise<EmbeddingSearchResult[]> {
    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      throw new AppError('AI embedding service not configured', 503);
    }

    // Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Search in database using vector similarity
    // Format embedding as vector string for pgvector
    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const results = await memoryRepository.semanticSearch(
      vectorStr,
      userId,
      limit,
      sourceTypes
    );

    return results;
  }

  /**
   * Search with credits (requires payment)
   */
  async searchSimilarWithCredits(
    userId: string,
    query: string,
    limit: number = 10,
    sourceTypes?: EmbeddingSourceType[]
  ): Promise<EmbeddingSearchResult[]> {
    // Check credits
    const cost = aiCreditService.getOperationCost('search');
    await aiCreditService.useCredits(userId, cost, `Semantic search: ${query.slice(0, 50)}`);

    return this.searchSimilar(userId, query, limit, sourceTypes);
  }

  /**
   * Delete embedding by source
   */
  async deleteEmbedding(
    sourceType: EmbeddingSourceType,
    sourceId: string
  ): Promise<boolean> {
    const result = await memoryRepository.deleteBySource(sourceType, sourceId);
    logger.info({ sourceType, sourceId, deleted: result }, 'Embedding deleted');
    return result;
  }

  /**
   * Rebuild index for a product (placeholder for full rebuild)
   */
  async rebuildIndex(productId: string): Promise<{ deleted: number; message: string }> {
    const result = await memoryRepository.rebuildIndex(productId);
    logger.info({ productId, ...result }, 'Index rebuild requested');
    return result;
  }

  /**
   * Get embedding by source
   */
  async getEmbedding(
    sourceType: EmbeddingSourceType,
    sourceId: string
  ): Promise<AIEmbedding | null> {
    return memoryRepository.getBySource(sourceType, sourceId);
  }

  /**
   * Get all embeddings for a user
   */
  async getUserEmbeddings(
    userId: string,
    limit: number = 100
  ): Promise<AIEmbedding[]> {
    return memoryRepository.getByUser(userId, limit);
  }

  /**
   * Count embeddings by source type
   */
  async countBySourceType(sourceType: EmbeddingSourceType): Promise<number> {
    return memoryRepository.countBySourceType(sourceType);
  }
}

export const memoryService = new MemoryService();
