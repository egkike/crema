/**
 * Embedding Service
 * Phase 1: Foundation (Memory + Credits)
 * Generates vector embeddings using OpenAI's text-embedding-3-small model
 * or Ollama (local) as alternative
 */

import { config } from '../../config/index';
import { configService } from '../../services/config.service';
import logger from '../../utils/logger';

const EMBEDDING_MODEL = config.ai.openaiEmbeddingModel;
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

// Ollama configuration from centralized config
const OLLAMA_MODEL = config.ai.defaultOllamaEmbeddingModel;
const OLLAMA_BASE_URL = config.ai.ollamaBaseUrl;

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

type EmbeddingProvider = 'openai' | 'ollama' | 'simulator';

export class EmbeddingService {
  private apiKey: string;
  private baseUrl = 'https://api.openai.com/v1';
  private provider: EmbeddingProvider = 'openai';
  private dimensions: number = DEFAULT_EMBEDDING_DIMENSIONS;
  private configLoaded: boolean = false;

  constructor() {
    this.apiKey = config.ai.openaiApiKey;
    
    // Auto-detect provider based on available config
    if (this.apiKey) {
      this.provider = 'openai';
      logger.info('Using OpenAI for embeddings');
    } else if (config.ai.ollamaEnabled || config.ai.ollamaBaseUrl) {
      this.provider = 'ollama';
      logger.info('Using Ollama for embeddings');
    } else {
      this.provider = 'simulator';
      logger.warn('No embedding provider configured - using simulator (not for production)');
    }

    // Load config dimensions asynchronously (best effort - will use default if fails)
    configService.getNumber('ai.embedding_dimensions', DEFAULT_EMBEDDING_DIMENSIONS).then(val => {
      this.dimensions = val;
      this.configLoaded = true;
      logger.info({ dimensions: val }, 'Loaded embedding dimensions from ConfigService');
    }).catch(err => {
      logger.warn({ err }, 'Failed to load embedding dimensions from ConfigService, using default');
      this.configLoaded = true; // Mark as loaded even on failure (using default)
    });
  }

  /**
   * Wait for config to be loaded before use
   */
  private async waitForConfig(): Promise<void> {
    // Poll until config is loaded (max 5 seconds)
    const start = Date.now();
    while (!this.configLoaded) {
      if (Date.now() - start > 5000) {
        logger.warn('Config load timeout, using default dimensions');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  /**
   * Check if embedding service is properly configured for production use
   */
  isConfigured(): boolean {
    return this.provider === 'openai' || this.provider === 'ollama';
  }

  /**
   * Get current provider
   */
  getProvider(): EmbeddingProvider {
    return this.provider;
  }

  /**
   * Generate embedding for a single text using configured provider
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.waitForConfig();
    switch (this.provider) {
      case 'openai':
        return this.generateOpenAIEmbedding(text);
      case 'ollama':
        return this.generateOllamaEmbedding(text);
      case 'simulator':
        return this.generateSimulatorEmbedding(text);
      default:
        throw new Error(`Unknown provider: ${this.provider}`);
    }
  }

  /**
   * Generate embeddings using OpenAI API
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
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
          dimensions: this.dimensions,
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
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to generate OpenAI embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings using Ollama (local, free)
   */
  private async generateOllamaEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: text,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, 'Ollama embedding API error');
        throw new Error(`Ollama API error: ${response.status}. Make sure Ollama is running with nomic-embed-text model.`);
      }

      const data = await response.json();
      
      if (!data.embedding) {
        throw new Error('No embedding returned from Ollama');
      }

      return data.embedding;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Failed to generate Ollama embedding');
      throw error;
    }
  }

  /**
   * Generate simulated embedding (for testing only - NOT for production)
   * Returns a deterministic random vector based on text hash
   */
  private generateSimulatorEmbedding(text: string): number[] {
    // Simple hash to seed the random generator
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    // Seeded random number generator
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    
    // Generate deterministic vector
    const embedding: number[] = [];
    for (let i = 0; i < this.dimensions; i++) {
      embedding.push(seededRandom(hash + i) * 2 - 1); // Normalize to [-1, 1]
    }
    
    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.waitForConfig();
    if (this.provider === 'simulator') {
      // Simulator can handle arrays directly
      return texts.map(text => this.generateSimulatorEmbedding(text));
    }

    // For OpenAI, batch processing is more efficient
    if (this.provider === 'openai') {
      if (!this.apiKey) {
        throw new Error('OpenAI API key not configured');
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
            dimensions: this.dimensions,
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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ error: errorMessage }, 'Failed to generate embeddings batch');
        throw error;
      }
    }

    // For Ollama, process one by one
    if (this.provider === 'ollama') {
      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.generateOllamaEmbedding(text);
        embeddings.push(embedding);
      }
      return embeddings;
    }

    throw new Error(`Unknown provider: ${this.provider}`);
  }

  /**
   * Get embedding dimension size
   */
  getDimensions(): number {
    return this.dimensions;
  }

  /**
   * Get model name
   */
  getModel(): string {
    return this.provider === 'ollama' ? OLLAMA_MODEL : EMBEDDING_MODEL;
  }
}

export const embeddingService = new EmbeddingService();
