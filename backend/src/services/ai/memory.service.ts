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

const VALID_SOURCE_TYPES: EmbeddingSourceType[] = ['lesson', 'faq', 'policy', 'qa', 'review', 'insight', 'saved_dashboard'];
const MAX_LIMIT = 100;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidSourceType(value: string): value is EmbeddingSourceType {
  return VALID_SOURCE_TYPES.includes(value as EmbeddingSourceType);
}

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
   * WARNING #2: Credits deducted AFTER successful addEmbedding to prevent credit loss on failure
   * SUGGESTION #1: Store payer userId in embedding record (not null)
   */
  async addEmbeddingWithCredits(
    userId: string,
    sourceType: EmbeddingSourceType,
    sourceId: string,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<AIEmbedding> {
    // Add embedding first, storing payer userId
    const result = await this.addEmbedding(userId, sourceType, sourceId, content, metadata);

    // Only deduct credits AFTER successful embedding
    const cost = aiCreditService.getOperationCost('search');
    await aiCreditService.useCredits(userId, cost, `Embedding: ${sourceType}/${sourceId}`);

    return result;
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

    // Validate query
    if (!query || query.trim().length === 0) {
      throw new AppError('Query is required', 400);
    }

    // CRITICAL #4: Cap limit at maximum
    const cappedLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    // WARNING #8: Validate userId format when provided
    if (userId && !isValidUUID(userId)) {
      throw new AppError('Invalid userId format', 400);
    }

    // WARNING #5: Validate sourceTypes against enum
    if (sourceTypes && sourceTypes.length > 0) {
      const invalidTypes = sourceTypes.filter(t => !isValidSourceType(t));
      if (invalidTypes.length > 0) {
        throw new AppError(`Invalid sourceTypes: ${invalidTypes.join(', ')}. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`, 400);
      }
    }

    // RBAC: When userId is provided, derive sourceTypes from user's accessible products if not specified
    if (userId) {
      const sourceTypesToCheck = sourceTypes && sourceTypes.length > 0
        ? sourceTypes
        : await memoryRepository.getAccessibleSourceTypes(userId);

      if (sourceTypesToCheck.length === 0) {
        throw new AppError('No tienes acceso a ningún contenido', 403);
      }

      const hasAccess = await memoryRepository.validateProductAccess(userId, sourceTypesToCheck);
      if (!hasAccess) {
        throw new AppError('No tienes acceso a este contenido', 403);
      }
      sourceTypes = sourceTypesToCheck;
    }

    // Generate embedding for query
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // WARNING #5: Validate embedding is a valid number array before constructing vector string
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      throw new AppError('Invalid embedding from AI service: not an array or empty', 500);
    }
    if (queryEmbedding.some(v => typeof v !== 'number' || isNaN(v))) {
      throw new AppError('Invalid embedding values from AI service: contains non-numeric values', 500);
    }

    // Search in database using vector similarity
    const vectorStr = `[${queryEmbedding.join(',')}]`;
    const results = await memoryRepository.semanticSearch(
      vectorStr,
      userId,
      cappedLimit,
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
    // WARNING #6: Use deferred charging - only deduct AFTER successful search
    const cost = aiCreditService.getOperationCost('search');

    const results = await this.searchSimilar(userId, query, limit, sourceTypes);
    await aiCreditService.useCredits(userId, cost, `Semantic search: ${query.slice(0, 50)}`);
    return results;
  }

  /**
   * Delete embedding by source
   * WARNING #3: This is an internal/admin method - caller MUST handle RBAC validation
   * Note: UUID validation only required for product-bound types (lesson, faq, review)
   */
  async deleteEmbedding(
    sourceType: EmbeddingSourceType,
    sourceId: string
  ): Promise<boolean> {
    // Validate sourceId is a valid UUID for product-bound types
    const PRODUCT_BOUND_TYPES: EmbeddingSourceType[] = ['lesson', 'faq', 'review'];
    if (PRODUCT_BOUND_TYPES.includes(sourceType)) {
      if (!isValidUUID(sourceId)) {
        throw new AppError('Invalid sourceId format', 400);
      }
    }

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

  /**
   * Check if content needs re-embedding (content changed)
   * Returns true if no existing embedding or content hash changed
   */
  async needsReembed(
    sourceType: EmbeddingSourceType,
    sourceId: string,
    newContent: string
  ): Promise<boolean> {
    // Generate simple hash of content
    const contentHash = this.hashContent(newContent);
    
    // Get existing embedding
    const existing = await memoryRepository.getBySource(sourceType, sourceId);
    
    // Need reembed if no existing or hash changed
    if (!existing) {
      return true;
    }
    
    // Check if content hash in metadata matches
    const existingHash = existing.metadata?.contentHash as string | undefined;
    return existingHash !== contentHash;
  }

  /**
   * Embed content with automatic content hash tracking
   * Only creates if content changed or doesn't exist
   */
  async embed(params: {
    type: EmbeddingSourceType;
    id: string;
    content: string;
    title?: string;
    metadata?: Record<string, unknown>;
    productId?: string;
    creatorId?: string;
  }): Promise<AIEmbedding | null> {
    // Check if needs re-embedding
    const shouldEmbed = await this.needsReembed(params.type, params.id, params.content);

    if (!shouldEmbed) {
      logger.debug({ type: params.type, id: params.id }, 'Content unchanged, skipping embed');
      return null;
    }

    // Check if embedding service is configured
    if (!embeddingService.isConfigured()) {
      logger.warn('Embedding service not configured, skipping embed');
      return null;
    }

    // Generate embedding
    const embedding = await embeddingService.generateEmbedding(params.content);

    // Prepare metadata with content hash
    const metadata = {
      ...params.metadata,
      contentHash: this.hashContent(params.content),
      title: params.title,
      creatorId: params.creatorId,
    };

    // Try to update existing or create new
    const existing = await memoryRepository.getBySource(params.type, params.id);

    if (existing) {
      // Update and return directly - updateEmbedding now returns updated row
      const updated = await memoryRepository.updateEmbedding(params.id, params.type, params.content, embedding, metadata);
      logger.info({ type: params.type, id: params.id }, 'Embedding updated');
      return updated;
    } else {
      // Create and return directly
      const created = await memoryRepository.createEmbedding(
        params.creatorId || null,
        params.type,
        params.id,
        params.content,
        embedding,
        metadata
      );
      logger.info({ type: params.type, id: params.id }, 'Embedding created');
      return created;
    }
  }

  /**
   * Simple hash function for content comparison
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

export const memoryService = new MemoryService();
