/**
 * Embedding Service
 * Phase 1: Foundation (Memory + Credits)
 * Generates vector embeddings using OpenAI's text-embedding-3-small model
 */

import { config } from '../../config/index';
import logger from '../../utils/logger';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingService {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';

  constructor() {
    this.apiKey = config.openai?.apiKey || '';
  }

  /**
   * Check if OpenAI API is configured
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'OpenAI embedding API error');
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data: OpenAIEmbeddingResponse = await response.json();
      
      if (!data.data || data.data.length === 0) {
        throw new Error('No embedding returned from OpenAI');
      }

      return data.data[0].embedding;
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'OpenAI embedding API error');
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data: OpenAIEmbeddingResponse = await response.json();
      
      // Sort by index to maintain order
      const sortedEmbeddings = [...data.data].sort((a, b) => a.index - b.index);
      return sortedEmbeddings.map(e => e.embedding);
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to generate embeddings batch');
      throw error;
    }
  }

  /**
   * Get embedding dimension size
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Get model name
   */
  getModel(): string {
    return EMBEDDING_MODEL;
  }
}

export const embeddingService = new EmbeddingService();
