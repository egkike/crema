import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app';
import '../setup';
import { generateTestAccessToken, generateTestRefreshToken } from '../setup';

// Mock affiliate chat service
vi.mock('../../services/ai/affiliate-chat.service', () => ({
  affiliateChatService: {
    chat: vi.fn().mockResolvedValue({
      response: 'Test response',
      sources: [],
    }),
  },
  classifyIntent: vi.fn().mockReturnValue('product_info'),
  sanitizeInput: vi.fn((s: string) => s),
}));

// Mock credits service
vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    useCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock routeHelpers — verifyProductAccess resolves by default (user has access)
vi.mock('../../utils/routeHelpers.util', () => ({
  verifyProductOwnership: vi.fn().mockResolvedValue(undefined),
  verifyProductAccess: vi.fn().mockResolvedValue(undefined),
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
    affiliateChatLimiter: withHeaders,
    interactiveAgentLimiter: passthrough,
    adminReadLimiter: passthrough,
    adminWriteLimiter: passthrough,
    productUploadLimiter: passthrough,
    webhookLimiter: passthrough,
    seoOptimizerLimiter: passthrough,
    churnPredictionLimiter: passthrough,
    recoveryEmailLimiter: passthrough,
    compareLimiter: passthrough,
  };
});

import { affiliateChatLimiter } from '../../middlewares/rateLimit/rateLimit';
import { aiCreditService } from '../../services/ai/credits.service';
import { classifyIntent } from '../../services/ai/affiliate-chat.service';
import pool from '../../db/postgres';
import { AppError } from '../../errors/AppError';

import { verifyProductAccess } from '../../utils/routeHelpers.util';

// Test constants — valid UUIDs that pass zod validation
const BUYER_USER_ID = '123e4567-e89b-42d3-a456-426614174000';
const AFFILIATE_USER_ID = '123e4567-e89b-42d3-a456-426614174001';
const PRODUCT_ID = '123e4567-e89b-42d3-a456-426614174020';

const supertestApp = request(app);

describe('Affiliate Chat Routes', () => {
  let buyerCookies: string = '';
  let affiliateCookies: string = '';

  beforeEach(() => {
    vi.resetAllMocks();

    // Reset verifyProductAccess to resolve (has access)
    vi.mocked(verifyProductAccess).mockResolvedValue(undefined);

    // Reset pool.query to return empty rows
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    // Reset affiliateChatLimiter to passthrough with headers
    vi.mocked(affiliateChatLimiter).mockImplementation(
      (_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
        res.setHeader('X-RateLimit-Limit', '10');
        res.setHeader('X-RateLimit-Remaining', '9');
        res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + 60));
        next();
      }
    );

    // Create request cookies
    const buyerAccess = generateTestAccessToken({
      id: BUYER_USER_ID,
      username: 'buyer',
      email: 'buyer@test.com',
      level: 3,
    });
    const buyerRefresh = generateTestRefreshToken({
      id: BUYER_USER_ID,
      username: 'buyer',
      email: 'buyer@test.com',
      level: 3,
    });
    buyerCookies = `access_token=${buyerAccess}; refresh_token=${buyerRefresh}`;

    const affiliateAccess = generateTestAccessToken({
      id: AFFILIATE_USER_ID,
      username: 'affiliate',
      email: 'affiliate@test.com',
      level: 3,
    });
    const affiliateRefresh = generateTestRefreshToken({
      id: AFFILIATE_USER_ID,
      username: 'affiliate',
      email: 'affiliate@test.com',
      level: 3,
    });
    affiliateCookies = `access_token=${affiliateAccess}; refresh_token=${affiliateRefresh}`;
  });

  describe('POST /api/ai/affiliate/chat', () => {
    it('Returns 401 without JWT', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .send({ productId: PRODUCT_ID, message: 'Test', userId: BUYER_USER_ID });

      expect(res.status).toBe(401);
    });

    it('Returns 400 with missing productId', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ message: 'Test', userId: BUYER_USER_ID });

      expect(res.status).toBe(400);
    });

    it('Returns 400 with invalid UUID productId', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: 'not-a-uuid', message: 'Test', userId: BUYER_USER_ID });

      expect(res.status).toBe(400);
    });

    it('Returns 400 with empty message', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: '', userId: BUYER_USER_ID });

      expect(res.status).toBe(400);
    });

    it('Returns 400 with message > 2000 chars', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'a'.repeat(2001), userId: BUYER_USER_ID });

      expect(res.status).toBe(400);
    });

    it('Returns 403 when user has no product access', async () => {
      // Make verifyProductAccess throw 403
      vi.mocked(verifyProductAccess).mockRejectedValue(
        new AppError('You do not have access to this product. Purchase required.', 403)
      );

      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test message', userId: BUYER_USER_ID });

      expect(res.status).toBe(403);
    });

    it('Returns 200 for buyer with confirmed order', async () => {
      // Buyer: pool.query for orders check returns a row
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'order-1' }], rowCount: 1 } as never);

      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test message', userId: BUYER_USER_ID });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('Returns 200 for affiliate with active link', async () => {
      // Affiliate: pool.query for orders check returns empty (not a buyer)
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', affiliateCookies)
        .send({ productId: PRODUCT_ID, message: 'Test message', userId: AFFILIATE_USER_ID });

      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('aiCreditService.useCredits NOT called for buyers', async () => {
      // Buyer: pool.query for orders check returns a row
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ id: 'order-1' }], rowCount: 1 } as never);

      await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test', userId: BUYER_USER_ID });

      expect(aiCreditService.useCredits).not.toHaveBeenCalled();
    });

    it('aiCreditService.useCredits called for affiliates', async () => {
      // Affiliate: pool.query for orders check returns empty
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

      await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', affiliateCookies)
        .send({ productId: PRODUCT_ID, message: 'Test', userId: AFFILIATE_USER_ID });

      expect(aiCreditService.useCredits).toHaveBeenCalled();
    });

    it('Ignores body userId — JWT identity is the only source of truth', async () => {
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test', userId: AFFILIATE_USER_ID });
      expect(res.status).toBe(200);
    });

    it('aiCreditService.useCredits NOT called for affiliate_metrics intent', async () => {
      // Affiliate: pool.query for orders check returns empty (not a buyer)
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
      // Force classifyIntent to return affiliate_metrics
      vi.mocked(classifyIntent).mockReturnValue('affiliate_metrics');

      await supertestApp.post('/api/ai/affiliate/chat').set('Cookie', affiliateCookies).send({
        productId: PRODUCT_ID,
        message: 'cuanto son mis comisiones',
        userId: AFFILIATE_USER_ID,
      });

      expect(aiCreditService.useCredits).not.toHaveBeenCalled();
    });

    it('useCredits 402 error is swallowed — response stays 200', async () => {
      // Affiliate: pool.query for orders check returns empty (not a buyer)
      vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

      // Simulate insufficient credits — route catches this and only logs it
      vi.mocked(aiCreditService.useCredits).mockRejectedValue(
        new AppError('Insufficient AI credits', 402)
      );

      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', affiliateCookies)
        .send({ productId: PRODUCT_ID, message: 'Test message', userId: AFFILIATE_USER_ID });

      // The route try/catch around useCredits swallows the error — response is still 200
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
      expect(aiCreditService.useCredits).toHaveBeenCalled();
    });

    it('Returns 429 when rate limit exceeded', async () => {
      vi.mocked(affiliateChatLimiter).mockImplementation((_req, res, _next) => {
        res.status(429).json({ error: 'Too many requests' });
      });

      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test', userId: BUYER_USER_ID });

      expect(res.status).toBe(429);
    });

    it('Response includes X-RateLimit-* headers', async () => {
      // The affiliateChatLimiter middleware sets rate limit headers on every response.
      // With the mock in place, we verify the middleware is invoked (headers would be
      // set in production). The mock's withHeaders function calls setHeader before next().
      const res = await supertestApp
        .post('/api/ai/affiliate/chat')
        .set('Cookie', buyerCookies)
        .send({ productId: PRODUCT_ID, message: 'Test', userId: BUYER_USER_ID });

      // Verify the request succeeded through the rate limiter
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);

      // Explicit rate limit header assertions
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});
