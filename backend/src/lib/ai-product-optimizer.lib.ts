// ai-product-optimizer.lib.ts — Shared helpers for product optimization services

import crypto from 'crypto';

import Redis from 'ioredis';
import type { z } from 'zod';

import { config } from '../config';
import { aiCreditService } from '../services/ai/credits.service';
import { llmService, type LLMMessage } from '../services/ai/llm.service';
import { memoryService } from '../services/ai/memory.service';
import { configService } from '../services/config.service';
import type { EmbeddingSearchResult } from '../types/ai.types';
import logger from '../utils/logger';

// ==========================================================================
// Cache constants
// ==========================================================================
const CACHE_PREFIX = 'description-generator:';
const CACHE_TTL = 604_800; // 7 days in seconds

export { CACHE_PREFIX, CACHE_TTL };

// ==========================================================================
// Description normalization — HTML strip regex (module-level constant)
// ==========================================================================
const HTML_TAG_RE = /<[^>]*>/g;

// ==========================================================================
// Lazy Redis client (same pattern as config.service.ts getRedisCache)
// ==========================================================================
let redisClient: Redis | null = null;

function getCacheRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: config.redis?.host ?? 'localhost',
      port: config.redis?.port ?? 6379,
      password: config.redis?.password || undefined,
      keyPrefix: 'crema:',
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });
    redisClient.on('error', (err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'Cache Redis client error'
      );
    });
  }
  return redisClient;
}

// ==========================================================================
// normalizeDescription
// ==========================================================================
export function normalizeDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .replace(HTML_TAG_RE, '')   // Strip HTML tags
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .slice(0, 5000);             // Cap length (matches zod max)
}

// ==========================================================================
// Cache key generation
// ==========================================================================
export function buildCacheKey(
  productId: string,
  description: string,
  productType: string,
  schemaVersion: number
): string {
  const normalized = normalizeDescription(description);
  const raw = `${productId.length}:${productId}|${normalized.length}:${normalized}|${productType.length}:${productType}|v${schemaVersion}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return `${CACHE_PREFIX}${hash}`;
}

// ==========================================================================
// Cache helpers (wrap Redis with graceful degradation)
// ==========================================================================
/**
 * Retrieve a cached value from Redis.
 *
 * Caller is responsible for ensuring `T` matches the stored schema.
 * Schema version mismatch can yield undefined fields.
 * See design §3.4 for v2 schema versioning plan.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getCacheRedis();
    const raw = await redis.get(key);
    if (!raw) return null;
    // TODO: add schema version check in v2
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), key }, 'cacheGet: Redis error, degrading to no-cache');
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl: number): Promise<void> {
  try {
    const redis = getCacheRedis();
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), key }, 'cacheSet: Redis error, skipping cache write');
    // Graceful degradation — generating service still succeeds
  }
}

// ==========================================================================
// RAG context fetch — query constructed from product description
// ==========================================================================
export async function fetchProductRagContext(
  userId: string,
  query: string
): Promise<EmbeddingSearchResult[]> {
  return memoryService.searchSimilar(userId, query, 10, ['lesson', 'faq', 'review']);
}

// ==========================================================================
// LLM call wrapper with config reading
// ==========================================================================
export async function callLLMForOptimization(
  systemPrompt: string,
  userPrompt: string,
  configPrefix: string,
  /**
   * Reserved for v2 Zod-validated LLM responses. Currently unused — type
   * signature preserved per design W16. Will be wired up once the LLM
   * response validation layer is built (target: description-generator PR 4 or
   * a dedicated v2 hardening PR).
   */
  _schema?: z.ZodType<unknown>
): Promise<string> {
  const temperature = await configService.getNumber(`${configPrefix}.temperature`, 0.7);
  const maxTokens = await configService.getNumber(`${configPrefix}.max_tokens`, 2000);
  const model = await configService.get(`${configPrefix}.model`);

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const response = await llmService.chat({
    messages,
    model: model || undefined,
    temperature,
    maxTokens,
  });

  return response.content;
}

// ==========================================================================
// Structured response parser (never throws)
// ==========================================================================
export function parseStructuredResponse<T>(rawText: string, fallback: T): T {
  let jsonStr = rawText.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  } else {
    // Handle truncated output: strip opening-only fence
    jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '');
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    logger.warn({ rawText: jsonStr.slice(0, 200) }, 'parseStructuredResponse: malformed JSON');
    return fallback;
  }
}

// ==========================================================================
// Credit deduction after success
// ==========================================================================
export async function deductCreditsAfterSuccess(
  userId: string,
  operationKey: 'search' | 'chat' | 'generate_insight' | 'churn_prediction' | 'description_generation',
  metadata: string
): Promise<void> {
  const cost = aiCreditService.getOperationCost(operationKey);
  await aiCreditService.useCredits(userId, cost, metadata);
}
