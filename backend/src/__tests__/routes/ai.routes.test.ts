import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

import { app } from '../../app';
import '../setup';
import { generateTestAccessToken, generateTestRefreshToken } from '../setup';

// Mock insights service — actual implementation is not under test here
vi.mock('../../services/ai/agents.service', () => ({
  insightsService: {
    predictChurn: vi.fn(),
    compareEntities: vi.fn(),
    generateRecoveryEmail: vi.fn(),
  },
}));

// Mock AppError so we can throw real instances from mocked services
vi.mock('../../errors/AppError', () => ({
  AppError: class extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

// Mock credits service — passthrough with default balance
vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    getBalance: vi.fn().mockResolvedValue({ balance: 100, expiresAt: new Date(Date.now() + 86400000) }),
    useCredits: vi.fn().mockResolvedValue(undefined),
    addCredits: vi.fn().mockResolvedValue(true),
    getOperationCost: vi.fn().mockReturnValue(1),
  },
}));

// Mock rate limit module — passthrough for happy path, override for 429 tests
vi.mock('../../middlewares/rateLimit/rateLimit', () => {
  const passthrough = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());
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
    seoOptimizerLimiter: passthrough,
    churnPredictionLimiter: passthrough,
    recoveryEmailLimiter: passthrough,
    compareLimiter: passthrough,
  };
});

import {
  churnPredictionLimiter,
  compareLimiter,
} from '../../middlewares/rateLimit/rateLimit';
import { insightsService } from '../../services/ai/agents.service';
import { aiCreditService } from '../../services/ai/credits.service';
import { AppError } from '../../errors/AppError';
import pool from '../../db/postgres';

// Minimal query result type matching pg.QueryResultBase used in mocks
interface PoolQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

// Test constants — proper UUIDs that pass zod validation
const CREATOR_USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const PRODUCT_ID = '123e4567-e89b-12d3-a456-426614174020';
const OTHER_PRODUCT_ID = '123e4567-e89b-12d3-a456-426614174021';
const TARGET_USER_ID = '123e4567-e89b-12d3-a456-426614174050';

const supertestApp = request(app);

/**
 * Build cookies for an authenticated creator.
 */
function buildCreatorCookies(): string {
  const access = generateTestAccessToken({
    id: CREATOR_USER_ID,
    username: 'creator',
    email: 'creator@test.com',
    level: 3,
  });
  const refresh = generateTestRefreshToken({
    id: CREATOR_USER_ID,
    username: 'creator',
    email: 'creator@test.com',
    level: 3,
  });
  return `access_token=${access}; refresh_token=${refresh}`;
}

// =============================================================================
// POST /api/ai/insights/predict/churn
// =============================================================================

describe('AI Insights Routes — POST /api/ai/insights/predict/churn', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: pool.query returns a product owned by CREATOR_USER_ID
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id') && sql.includes('"products"') && sql.includes('creator_id')) {
        return { rows: [{ id: PRODUCT_ID, creator_id: CREATOR_USER_ID }], rowCount: 1 } as PoolQueryResult;
      }
      return { rows: [], rowCount: 0 } as PoolQueryResult;
    });

    // Default: credits available
    vi.mocked(aiCreditService.getBalance).mockResolvedValue({
      balance: 100,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Default: service returns valid prediction
    vi.mocked(insightsService.predictChurn).mockResolvedValue({
      predictions: [
        {
          id: 'pred-1',
          userId: TARGET_USER_ID,
          userName: 'Student One',
          churnScore: 85,
          riskFactors: ['inactive 45 days', 'low progress'],
          narrative: 'High churn risk detected',
          recommendedAction: 'Send recovery email',
          confidence: 'high',
        },
      ],
      totalStudents: 1,
      creditsUsed: 5,
    });
  });

  it('Returns 401 without JWT token', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(401);
  });

  it('Returns 400 with missing productId', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ threshold: 50 });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with invalid UUID for productId', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('Returns 403 when user does not own the product', async () => {
    // Mock pool.query to return empty rows for ownership check
    // (user is not the creator of OTHER_PRODUCT_ID)
    vi.mocked(pool.query).mockImplementation(async () => ({
      rows: [],
      rowCount: 0,
    } as PoolQueryResult));

    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: OTHER_PRODUCT_ID });

    expect(res.status).toBe(403);
  });

  it('Returns 402 when user has insufficient credits', async () => {
    // Service throws AppError 402 when credits are insufficient
    vi.mocked(insightsService.predictChurn).mockRejectedValue(
      new AppError('Créditos insuficientes', 402)
    );

    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(402);
  });

  it('Returns 200 with valid request and ownership', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.predictions).toBeDefined();
    expect(res.body.data.creditsUsed).toBe(5);
  });

  it('Accepts custom threshold parameter', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: PRODUCT_ID, threshold: 80 });

    expect(res.status).toBe(200);
    expect(insightsService.predictChurn).toHaveBeenCalledWith(
      PRODUCT_ID,
      CREATOR_USER_ID,
      80
    );
  });

  it('Returns 429 when rate limit exceeded', async () => {
    vi.mocked(churnPredictionLimiter).mockImplementation((_req, res, _next) => {
      res.status(429).json({ success: false, error: 'Too many requests' });
    });

    const res = await supertestApp
      .post('/api/ai/insights/predict/churn')
      .set('Cookie', buildCreatorCookies())
      .send({ productId: PRODUCT_ID });

    expect(res.status).toBe(429);
  });
});

// =============================================================================
// POST /api/ai/insights/compare
// =============================================================================

describe('AI Insights Routes — POST /api/ai/insights/compare', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default: pool.query returns both products owned by CREATOR_USER_ID
    vi.mocked(pool.query).mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM') && sql.includes('"products"') && sql.includes('ANY')) {
        return {
          rows: [{ id: PRODUCT_ID }, { id: OTHER_PRODUCT_ID }],
          rowCount: 2,
        } as PoolQueryResult;
      }
      return { rows: [], rowCount: 0 } as PoolQueryResult;
    });

    // Default: credits available
    vi.mocked(aiCreditService.getBalance).mockResolvedValue({
      balance: 100,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Default: service returns valid comparison
    vi.mocked(insightsService.compareEntities).mockResolvedValue({
      entityA: { label: PRODUCT_ID, data: { sales: 100 } },
      entityB: { label: OTHER_PRODUCT_ID, data: { sales: 80 } },
      narrative: 'Product A has more sales than Product B',
      deltas: { sales: { a: 100, b: 80, delta: 20, deltaPercent: 25 } },
      recommendation: 'Analyze Product A success factors',
    });
  });

  it('Returns 401 without JWT token', async () => {
    const res = await supertestApp.post('/api/ai/insights/compare').send({
      entityType: 'product',
      entityA: PRODUCT_ID,
      entityB: OTHER_PRODUCT_ID,
      metrics: ['sales'],
    });

    expect(res.status).toBe(401);
  });

  it('Returns 400 with invalid entityType', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'invalid_type',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with missing entityA', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with empty metrics array', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: [],
      });

    expect(res.status).toBe(400);
  });

  it('Returns 400 with missing metrics field', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
      });

    expect(res.status).toBe(400);
  });

  it('Returns 403 when user does not own both products', async () => {
    // Service throws AppError 403 when ownership check fails internally
    vi.mocked(insightsService.compareEntities).mockRejectedValue(
      new AppError('No tienes permiso para acceder a uno o ambos productos', 403)
    );

    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(403);
  });

  it('Returns 402 when user has insufficient credits', async () => {
    // Service throws AppError 402 when credits are insufficient
    vi.mocked(insightsService.compareEntities).mockRejectedValue(
      new AppError('Créditos insuficientes', 402)
    );

    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(402);
  });

  it('Returns 200 with valid period comparison', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'period',
        entityA: '2024-01',
        entityB: '2024-02',
        metrics: ['sales', 'revenue'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.narrative).toBeDefined();
    expect(res.body.data.deltas).toBeDefined();
  });

  it('Returns 200 with valid product comparison', async () => {
    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(200);
    expect(insightsService.compareEntities).toHaveBeenCalledWith(
      'product',
      PRODUCT_ID,
      OTHER_PRODUCT_ID,
      ['sales'],
      CREATOR_USER_ID
    );
  });

  it('Returns 429 when rate limit exceeded', async () => {
    vi.mocked(compareLimiter).mockImplementation((_req, res, _next) => {
      res.status(429).json({ success: false, error: 'Too many requests' });
    });

    const res = await supertestApp
      .post('/api/ai/insights/compare')
      .set('Cookie', buildCreatorCookies())
      .send({
        entityType: 'product',
        entityA: PRODUCT_ID,
        entityB: OTHER_PRODUCT_ID,
        metrics: ['sales'],
      });

    expect(res.status).toBe(429);
  });
});

