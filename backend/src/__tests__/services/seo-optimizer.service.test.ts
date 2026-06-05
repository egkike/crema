import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mock fixtures — must be declared before any vi.mock() factory
// (vitest hoists vi.mock() to the top of the file).
// ---------------------------------------------------------------------------

const { mockConfig, mockChat } = vi.hoisted(() => ({
  mockConfig: {
    brandName: 'TestBrand',
    frontendUrl: 'https://test.crema.com',
    ogImageDefault: '/img/og-default.png',
  },
  mockChat: vi.fn(),
}));

// Mock config — injects env-driven values for brand, frontendUrl, ogImageDefault.
// Tests mutate `mockConfig.*` directly to cover the fallback chain tiers.
vi.mock('../../config', () => ({
  config: mockConfig,
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

// Mock configService (DB-backed runtime knobs) — return defaults so the
// service skips its DB path and uses 0.7 / 2000 / undefined for LLM params.
vi.mock('../../services/config.service', () => ({
  configService: {
    get: vi.fn().mockResolvedValue(undefined),
    getNumber: vi.fn().mockImplementation((_key: string, def: number) => Promise.resolve(def)),
    getBoolean: vi.fn().mockResolvedValue(false),
  },
}));

// Mock memoryService (RAG search) — return empty so the service uses the
// raw input as prompt context, simplifying test fixtures.
vi.mock('../../services/ai/memory.service', () => ({
  memoryService: {
    searchSimilar: vi.fn().mockResolvedValue([]),
  },
}));

// Mock llmService — controlled by per-test mockChat.mockResolvedValueOnce calls.
vi.mock('../../services/ai/llm.service', () => ({
  llmService: {
    chat: mockChat,
  },
}));

import { seoOptimizerService } from '../../services/ai/seo-optimizer.service';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const VALID_INPUT = {
  userId: '00000000-0000-0000-0000-000000000001',
  productId: '00000000-0000-0000-0000-000000000020',
  productName: 'Curso de TypeScript Profesional Avanzado',
  productDescription:
    'Aprende TypeScript desde cero hasta nivel avanzado con ejemplos prácticos y proyectos reales del mundo actual.',
  productType: 'course' as const,
  creatorName: 'Test Creator',
};

// LLM JSON payload — metaTitle is 50 chars to pass the 30-60 char gate at
// service line 316. Schema markup is omitted because the service builds
// its own via buildSchemaMarkup() (covers the provider.name config-driven case).
const LLM_RESPONSE_BASE = {
  metaTitle: 'Curso de TypeScript Profesional Avanzado Completo',
  metaDescription:
    'Aprende TypeScript desde cero hasta nivel avanzado con ejemplos prácticos y proyectos reales del mundo actual.',
  ogTitle: 'Curso de TypeScript Profesional Avanzado',
  ogDescription: 'Domina TypeScript hoy con ejemplos prácticos reales',
  keywords: ['typescript', 'programación', 'web', 'avanzado', 'cursos'],
};

const buildLLMResponse = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({ ...LLM_RESPONSE_BASE, ...overrides });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seoOptimizerService — config-driven brand, canonical, and OG fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChat.mockReset();
  });

  afterEach(() => {
    // Reset config overrides so per-test mutations don't leak across tests.
    mockConfig.brandName = 'TestBrand';
    mockConfig.frontendUrl = 'https://test.crema.com';
    mockConfig.ogImageDefault = '/img/og-default.png';
  });

  // -------------------------------------------------------------------------
  // 1. OG image fallback chain (3 tiers)
  // -------------------------------------------------------------------------

  it('ogImageUrl returns the LLM-provided value when present (tier 1 wins)', async () => {
    mockChat.mockResolvedValueOnce({
      content: buildLLMResponse({ ogImageUrl: 'https://cdn.example.com/og.jpg' }),
    });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.ogImageUrl).toBe('https://cdn.example.com/og.jpg');
  });

  it('ogImageUrl falls back to config.ogImageDefault when the LLM omits it (tier 2)', async () => {
    mockChat.mockResolvedValueOnce({
      content: buildLLMResponse(), // no ogImageUrl field
    });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.ogImageUrl).toBe('/img/og-default.png');
  });

  it('ogImageUrl returns "" when both LLM and config are empty (tier 3 — documented "no image" signal)', async () => {
    mockConfig.ogImageDefault = '';
    mockChat.mockResolvedValueOnce({
      content: buildLLMResponse(), // no ogImageUrl field
    });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.ogImageUrl).toBe('');
  });

  // -------------------------------------------------------------------------
  // 2. Brand name driven by config.brandName
  // -------------------------------------------------------------------------

  it('ogSiteName returns config.brandName', async () => {
    mockChat.mockResolvedValueOnce({ content: buildLLMResponse() });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.ogSiteName).toBe('TestBrand');
  });

  // -------------------------------------------------------------------------
  // 3. Canonical URL driven by config.frontendUrl
  // -------------------------------------------------------------------------

  it('canonicalUrl returns `${config.frontendUrl}/product/${input.productId}`', async () => {
    mockChat.mockResolvedValueOnce({ content: buildLLMResponse() });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    expect(result.data?.canonicalUrl).toBe(
      `https://test.crema.com/product/${VALID_INPUT.productId}`
    );
  });

  // -------------------------------------------------------------------------
  // 4. Schema.org provider.name driven by config.brandName (course type)
  // -------------------------------------------------------------------------

  it('schemaMarkup.provider.name returns config.brandName for course type', async () => {
    mockChat.mockResolvedValueOnce({ content: buildLLMResponse() });

    const result = await seoOptimizerService.generate(VALID_INPUT);

    expect(result.success).toBe(true);
    const schemaMarkup = result.data?.schemaMarkup as Record<string, unknown>;
    const provider = schemaMarkup.provider as Record<string, unknown>;
    expect(provider.name).toBe('TestBrand');
  });
});
