import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock references (vi.mock factories are hoisted above all declarations) ─

const {
  mockSearchSimilar,
  mockChat,
  mockGetOperationCost,
  mockUseCredits,
  mockConfigGetNumber,
  mockConfigGet,
  mockRedisGet,
  mockRedisSet,
} = vi.hoisted(() => ({
  mockSearchSimilar: vi.fn(),
  mockChat: vi.fn(),
  mockGetOperationCost: vi.fn(),
  mockUseCredits: vi.fn(),
  mockConfigGetNumber: vi.fn(),
  mockConfigGet: vi.fn(),
  mockRedisGet: vi.fn(),
  mockRedisSet: vi.fn(),
}));

// ── Mocks (hoisted before any import that depends on them) ──────────────

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../services/ai/memory.service', () => ({
  memoryService: { searchSimilar: mockSearchSimilar },
}));

vi.mock('../../services/ai/llm.service', () => ({
  llmService: { chat: mockChat },
}));

vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    getOperationCost: mockGetOperationCost,
    useCredits: mockUseCredits,
  },
}));

vi.mock('../../services/config.service', () => ({
  configService: {
    getNumber: mockConfigGetNumber,
    get: mockConfigGet,
  },
}));

vi.mock('ioredis', () => {
  const RedisMock = function (this: { get: unknown; set: unknown; on: unknown }) {
    this.get = mockRedisGet;
    this.set = mockRedisSet;
    this.on = vi.fn().mockReturnThis();
  } as unknown as { new(): { get: unknown; set: unknown; on: unknown } };
  return { default: RedisMock };
});

// ── Import SUT after mocks ──────────────────────────────────────────────

import {
  normalizeDescription,
  buildCacheKey,
  cacheGet,
  cacheSet,
  fetchProductRagContext,
  callLLMForOptimization,
  parseStructuredResponse,
  deductCreditsAfterSuccess,
} from '../../lib/ai-product-optimizer.lib';
import logger from '../../utils/logger';

// =========================================================================
// T1.0 — normalizeDescription
// =========================================================================
describe('normalizeDescription', () => {
  it('trims whitespace', () => {
    expect(normalizeDescription('  hello  ')).toBe('hello');
  });

  it('lowercases', () => {
    expect(normalizeDescription('HELLO')).toBe('hello');
  });

  it('strips HTML tags', () => {
    expect(normalizeDescription('<p>Hello</p>')).toBe('hello');
  });

  it('collapses whitespace', () => {
    expect(normalizeDescription('a  b   c')).toBe('a b c');
  });

  it('caps at 5000 chars', () => {
    const long = 'a'.repeat(6000);
    expect(normalizeDescription(long).length).toBe(5000);
  });

  it('preserves strings at exactly 5000 chars', () => {
    expect(normalizeDescription('a'.repeat(5000)).length).toBe(5000);
  });
});

// =========================================================================
// T1.1 — buildCacheKey
// =========================================================================
describe('buildCacheKey', () => {
  it('returns the same key for the same inputs (deterministic)', () => {
    const key1 = buildCacheKey('prod-1', 'A course about TypeScript', 'course', 1);
    const key2 = buildCacheKey('prod-1', 'A course about TypeScript', 'course', 1);
    expect(key1).toBe(key2);
  });

  it('returns different keys for different inputs', () => {
    const key1 = buildCacheKey('prod-1', 'A course about TypeScript', 'course', 1);
    const key2 = buildCacheKey('prod-2', 'A course about TypeScript', 'course', 1);
    expect(key1).not.toBe(key2);
  });

  it('returns different keys when schema version changes', () => {
    const key1 = buildCacheKey('prod-1', 'A course about TypeScript', 'course', 1);
    const key2 = buildCacheKey('prod-1', 'A course about TypeScript', 'course', 2);
    expect(key1).not.toBe(key2);
  });
});

// =========================================================================
// T1.2 — cacheGet / cacheSet
// =========================================================================
describe('cacheGet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed object when Redis returns valid JSON', async () => {
    const data = { titles: ['a', 'b'], description: 'desc' };
    mockRedisGet.mockResolvedValue(JSON.stringify(data));

    const result = await cacheGet<typeof data>('some-key');
    expect(result).toEqual(data);
  });

  it('returns null when Redis returns null', async () => {
    mockRedisGet.mockResolvedValue(null);

    const result = await cacheGet('some-key');
    expect(result).toBeNull();
  });

  it('returns null when Redis throws', async () => {
    mockRedisGet.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await cacheGet('some-key');
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('cacheSet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls Redis.set with correct args on success', async () => {
    mockRedisSet.mockResolvedValue(undefined);
    const value = { titles: ['a'] };

    await cacheSet('test-key', value, 604800);

    expect(mockRedisSet).toHaveBeenCalledWith('test-key', JSON.stringify(value), 'EX', 604800);
  });

  it('logs warning and does not throw when Redis throws', async () => {
    mockRedisSet.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(cacheSet('key', { data: 1 }, 604800)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});

// =========================================================================
// T1.3 — fetchProductRagContext
// =========================================================================
describe('fetchProductRagContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates to memoryService.searchSimilar with correct params', async () => {
    const fakeResults = [{ id: '1', content: 'chunk' }];
    mockSearchSimilar.mockResolvedValue(fakeResults);

    const result = await fetchProductRagContext('user-1', 'TypeScript basics');

    expect(mockSearchSimilar).toHaveBeenCalledWith(
      'user-1',
      'TypeScript basics',
      10,
      ['lesson', 'faq', 'review']
    );
    expect(result).toBe(fakeResults);
  });
});

// =========================================================================
// T1.4 — callLLMForOptimization
// =========================================================================
describe('callLLMForOptimization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads config, calls llmService.chat, and returns content', async () => {
    mockConfigGetNumber.mockImplementation(async (_key: string, def: number) => def);
    mockConfigGet.mockResolvedValue(null);
    mockChat.mockResolvedValue({ content: '{"titles":["a"]}' });

    const result = await callLLMForOptimization(
      'system prompt',
      'user prompt',
      'description_generator'
    );

    expect(mockConfigGetNumber).toHaveBeenCalledWith('description_generator.temperature', 0.7);
    expect(mockConfigGetNumber).toHaveBeenCalledWith('description_generator.max_tokens', 2000);
    expect(mockConfigGet).toHaveBeenCalledWith('description_generator.model');
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'user prompt' },
        ],
        temperature: 0.7,
        maxTokens: 2000,
      })
    );
    expect(result).toBe('{"titles":["a"]}');
  });
});

// =========================================================================
// T1.5 — parseStructuredResponse
// =========================================================================
describe('parseStructuredResponse', () => {
  it('parses valid JSON correctly', () => {
    const raw = '{"titles":["a","b","c"],"description":"desc"}';
    const fallback = { titles: [] as string[], description: '' };
    const result = parseStructuredResponse(raw, fallback);
    expect(result).toEqual({ titles: ['a', 'b', 'c'], description: 'desc' });
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"titles":["x"]}\n```';
    const fallback = { titles: [] as string[] };
    const result = parseStructuredResponse(raw, fallback);
    expect(result).toEqual({ titles: ['x'] });
  });

  it('returns fallback without throwing on malformed JSON', () => {
    const fallback = { titles: ['fallback'] };
    const result = parseStructuredResponse('not json at all {{{', fallback);
    expect(result).toBe(fallback);
  });

  it('strips uppercase JSON fence (case-insensitive)', () => {
    const raw = '```JSON\n{"titles":["y"]}\n```';
    const fallback = { titles: [] as string[] };
    const result = parseStructuredResponse(raw, fallback);
    expect(result).toEqual({ titles: ['y'] });
  });

  it('handles truncated LLM output with opening-only fence (Fix #2)', () => {
    const raw = '```json\n{"titles":["a","b"]}';
    const fallback = { titles: [] as string[] };
    const result = parseStructuredResponse(raw, fallback);
    expect(result).toEqual({ titles: ['a', 'b'] });
  });
});

// =========================================================================
// T1.6 — deductCreditsAfterSuccess
// =========================================================================
describe('deductCreditsAfterSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls getOperationCost and useCredits with correct params', async () => {
    mockGetOperationCost.mockReturnValue(1);
    mockUseCredits.mockResolvedValue(undefined);

    await deductCreditsAfterSuccess('user-1', 'description_generation', 'meta info');

    expect(mockGetOperationCost).toHaveBeenCalledWith('description_generation');
    expect(mockUseCredits).toHaveBeenCalledWith('user-1', 1, 'meta info');
  });
});
