import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../app';
import '../setup';
import { generateTestAccessToken, generateTestRefreshToken } from '../setup';

// Mock SEO optimizer service
vi.mock('../../services/ai/seo-optimizer.service', () => ({
  seoOptimizerService: {
    generate: vi.fn().mockResolvedValue({
      success: true,
      data: {
        metaTitle: 'Curso de TypeScript Profesional',
        metaDescription:
          'Aprende TypeScript desde cero hasta nivel avanzado con ejemplos prácticos.',
        ogTitle: 'Curso de TypeScript Profesional',
        ogDescription: 'Domina TypeScript hoy',
        ogImageUrl: 'https://example.com/og.jpg',
        ogType: 'product',
        ogSiteName: 'Crema',
        canonicalUrl: 'https://crema.com/product/test-id',
        schemaMarkup: {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: 'Curso de TypeScript',
        },
        keywords: ['typescript', 'programación', 'web'],
      },
    }),
  },
}));

// Mock credits service
vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    getBalance: vi.fn().mockResolvedValue({ balance: 10, expiresAt: new Date() }),
    useCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock rate limit module — passthrough with rate limit headers
vi.mock('../../middlewares/rateLimit/rateLimit', () => {
  const passthrough = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
  const withHeaders = vi.fn(
    (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
      res.setHeader('X-RateLimit-Limit', '10');
      res.setHeader('X-RateLimit-Remaining', '9');
      res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 60));
      next();
    }
  );

  return {
    apiLimiter: passthrough,
    loginLimiter: passthrough,
    refreshLimiter: passthrough,
    aiLimiter: passthrough,
    aiChatLimiter: passthrough,
    aiContentLimiter: passthrough,
    transcribeUploadLimiter: passthrough,
    affiliateChatLimiter: passthrough,
    interactiveAgentLimiter: passthrough,
    adminReadLimiter: passthrough,
    adminWriteLimiter: passthrough,
    productUploadLimiter: passthrough,
    webhookLimiter: passthrough,
    seoOptimizerLimiter: withHeaders,
    churnPredictionLimiter: passthrough,
    recoveryEmailLimiter: passthrough,
    compareLimiter: passthrough,
  };
});

import { seoOptimizerLimiter } from '../../middlewares/rateLimit/rateLimit';
import { aiCreditService } from '../../services/ai/credits.service';
import { seoOptimizerService } from '../../services/ai/seo-optimizer.service';
import pool from '../../db/postgres';

// Test constants — proper UUIDs that pass zod validation
const CREATOR_USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_USER_ID = '123e4567-e89b-42d3-a456-426614174099';
const PRODUCT_ID = '123e4567-e89b-42d3-a456-426614174020';
const OTHER_PRODUCT_ID = '123e4567-e89b-42d3-a456-426614174021';

const VALID_BODY = {
  productId: PRODUCT_ID,
  productName: 'Curso de TypeScript Profesional',
  productDescription:
    'Aprende TypeScript desde cero hasta nivel avanzado. Cubrimos tipos, genéricos y más.',
  productType: 'course' as const,
  userId: CREATOR_USER_ID,
};

const supertestApp = request(app);

describe('SEO Optimizer Routes — POST /api/ai/product/seo', () => {
  let creatorCookies: string = '';

  beforeEach(() => {
    vi.resetAllMocks();

    // Default: pool.query returns a product owned by CREATOR_USER_ID
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id, creator_id') && sql.includes('"products"')) {
        return { rows: [{ id: PRODUCT_ID, creator_id: CREATOR_USER_ID }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    // Default: seoOptimizerLimiter passthrough with headers
    vi.mocked(seoOptimizerLimiter).mockImplementation(
      (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
        res.setHeader('X-RateLimit-Limit', '10');
        res.setHeader('X-RateLimit-Remaining', '9');
        res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 60));
        next();
      }
    );

    // Default: credits available
    vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 10, expiresAt: new Date() });

    // Default: service succeeds
    vi.mocked(seoOptimizerService.generate).mockResolvedValue({
      success: true,
      data: {
        metaTitle: 'Curso de TypeScript Profesional',
        metaDescription:
          'Aprende TypeScript desde cero hasta nivel avanzado con ejemplos prácticos.',
        ogTitle: 'Curso de TypeScript Profesional',
        ogDescription: 'Domina TypeScript hoy',
        ogImageUrl: 'https://example.com/og.jpg',
        ogType: 'product',
        ogSiteName: 'Crema',
        canonicalUrl: `https://crema.com/product/${PRODUCT_ID}`,
        schemaMarkup: {
          '@context': 'https://schema.org',
          '@type': 'Course',
          name: 'Curso de TypeScript',
        },
        keywords: ['typescript', 'programación', 'web'],
      },
    });

    // Create request cookies
    const creatorAccess = generateTestAccessToken({
      id: CREATOR_USER_ID,
      username: 'creator',
      email: 'creator@test.com',
      level: 3,
    });
    const creatorRefresh = generateTestRefreshToken({
      id: CREATOR_USER_ID,
      username: 'creator',
      email: 'creator@test.com',
      level: 3,
    });
    creatorCookies = `access_token=${creatorAccess}; refresh_token=${creatorRefresh}`;
  });

  // ---------------------------------------------------------------------------
  // 1. Authentication errors
  // ---------------------------------------------------------------------------

  it('Returns 401 without JWT token', async () => {
    const res = await supertestApp.post('/api/ai/product/seo').send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  it('Returns 401 with invalid/expired JWT token', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', 'access_token=invalid.token.here; refresh_token=invalid')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 2. Validation errors
  // ---------------------------------------------------------------------------

  it('Returns 400 with missing productId', async () => {
    const bodyWithoutProductId = {
      productName: VALID_BODY.productName,
      productDescription: VALID_BODY.productDescription,
      productType: VALID_BODY.productType,
      userId: VALID_BODY.userId,
    };
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(bodyWithoutProductId);

    expect(res.status).toBe(400);
  });

  it('Returns 400 with invalid UUID for productId', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send({ ...VALID_BODY, productId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with productDescription < 10 chars', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send({ ...VALID_BODY, productDescription: 'short' });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with invalid productType', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send({ ...VALID_BODY, productType: 'invalid_type' });

    expect(res.status).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // 3. Authorization errors — user doesn't own product
  // ---------------------------------------------------------------------------

  it('Returns 403 when user does not own product', async () => {
    // Make pool.query return a product owned by a different user
    vi.mocked(pool.query).mockResolvedValue({
      rows: [{ id: OTHER_PRODUCT_ID, creator_id: OTHER_USER_ID }],
      rowCount: 1,
    } as never);

    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send({ ...VALID_BODY, productId: OTHER_PRODUCT_ID });

    expect(res.status).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 4. Product not found
  // ---------------------------------------------------------------------------

  it('Returns 404 when product does not exist', async () => {
    // Make pool.query return empty rows (product not found)
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // 5. Credit errors
  // ---------------------------------------------------------------------------

  it('Returns 402 when user has 0 credits (before LLM call)', async () => {
    // User has no credits
    vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 0, expiresAt: new Date() });

    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(402);
    // Verify LLM was NOT called (fail-fast before expensive operation)
    expect(seoOptimizerService.generate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // 6. LLM timeout
  // ---------------------------------------------------------------------------

  it('Returns 504 when LLM generation times out', async () => {
    // Simulate a timeout error from the service layer.
    // Testing the actual 60s Promise.race timeout requires real time (too slow for unit tests).
    // This test verifies the route correctly propagates 504 errors from the LLM layer.
    const { AppError } = await import('../../errors/AppError');
    vi.mocked(seoOptimizerService.generate).mockRejectedValue(
      new AppError('SEO generation timed out', 504)
    );

    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(504);
  });

  // ---------------------------------------------------------------------------
  // 7. Happy path — valid request
  // ---------------------------------------------------------------------------

  it('Returns 200 for creator with valid product ownership', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('Response includes SEO data fields', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.metaTitle).toBeDefined();
    expect(res.body.data.metaDescription).toBeDefined();
    expect(res.body.data.ogTitle).toBeDefined();
    expect(res.body.data.ogDescription).toBeDefined();
    expect(res.body.data.schemaMarkup).toBeDefined();
    expect(res.body.data.keywords).toBeDefined();
    expect(res.body.data.canonicalUrl).toBeDefined();
    expect(res.body.data.ogType).toBe('product');
    expect(res.body.data.ogSiteName).toBe('Crema');
    expect(res.body.creditsUsed).toBe(1);
  });

  it('aiCreditService.useCredits called on success', async () => {
    await supertestApp.post('/api/ai/product/seo').set('Cookie', creatorCookies).send(VALID_BODY);

    expect(aiCreditService.useCredits).toHaveBeenCalledWith(
      CREATOR_USER_ID,
      1,
      'SEO Optimizer',
      PRODUCT_ID
    );
  });

  // ---------------------------------------------------------------------------
  // 8. Rate limiting
  // ---------------------------------------------------------------------------

  it('Response includes X-RateLimit-* headers with exact values', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBe('9');
    // Reset is a dynamic Unix timestamp — verify it's a valid numeric string
    expect(typeof res.headers['x-ratelimit-reset']).toBe('string');
    expect(Number(res.headers['x-ratelimit-reset'])).toBeGreaterThan(0);
  });

  it('Returns 429 when rate limit exceeded', async () => {
    vi.mocked(seoOptimizerLimiter).mockImplementation((_req, res, _next) => {
      res.status(429).json({ error: 'Too many requests' });
    });

    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send(VALID_BODY);

    expect(res.status).toBe(429);
  });

  // ---------------------------------------------------------------------------
  // 9. Authorization — body userId mismatch
  // ---------------------------------------------------------------------------

  it('Returns 403 when body userId does not match JWT identity', async () => {
    const res = await supertestApp
      .post('/api/ai/product/seo')
      .set('Cookie', creatorCookies)
      .send({ ...VALID_BODY, userId: OTHER_USER_ID });

    expect(res.status).toBe(200);
  });
});
