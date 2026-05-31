import crypto from 'crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../db/postgres', () => ({
  default: {
    query: vi.fn(),
  },
}));

vi.mock('../../../utils/validators.util', () => ({
  getValidatedSchema: vi.fn().mockReturnValue('public'),
}));

vi.mock('../../../errors/AppError', () => ({
  AppError: class extends Error {
    constructor(message: string, statusCode: number) {
      super(message);
      (this as any).statusCode = statusCode;
    }
  },
}));

// Mock AI services
vi.mock('../../../services/ai/credits.service', () => ({
  aiCreditService: {
    deductCredits: vi.fn().mockResolvedValue(true),
    addCredits: vi.fn().mockResolvedValue(true),
    getBalance: vi.fn().mockResolvedValue({ balance: 100, expiresAt: new Date(Date.now() + 86400000) }),
    useCredits: vi.fn().mockResolvedValue(undefined),
    getOperationCost: vi.fn().mockImplementation((op) => {
      if (op === 'churn_prediction') return 5;
      return 1;
    }),
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn().mockRejectedValue(new Error('LLM mock not configured for this test')),
    chatStream: vi.fn(),
    buildPrompt: vi.fn((system, context, question) => [
      { role: 'system', content: system },
      { role: 'system', content: `Context:\n${context}` },
      { role: 'user', content: `[USER_INPUT_START]\n${question}\n[USER_INPUT_END]` },
    ]),
    getProvider: vi.fn().mockReturnValue('simulator'),
    isConfigured: vi.fn().mockReturnValue(false),
  },
}));

describe('AgentsService', () => {
  describe('exports', () => {
    it('should export qaAgentService', async () => {
      const { qaAgentService } = await import('../../../services/ai/agents.service');
      expect(qaAgentService).toBeDefined();
    });

    it('should export analyticsService', async () => {
      const { analyticsService } = await import('../../../services/ai/agents.service');
      expect(analyticsService).toBeDefined();
    });

    it('should export tutorService', async () => {
      const { tutorService } = await import('../../../services/ai/agents.service');
      expect(tutorService).toBeDefined();
    });

    it('should export insightsService', async () => {
      const { insightsService } = await import('../../../services/ai/agents.service');
      expect(insightsService).toBeDefined();
    });
  });
});

// =============================================================================
// predictChurn Tests (Task 2 — Strict TDD)
// =============================================================================

describe('insightsService.predictChurn', () => {
  const productId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const studentId1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const studentId2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-set default mock implementations after clearAllMocks
    const creditsModule = await import('../../../services/ai/credits.service');
    const aiCreditService = creditsModule.aiCreditService;
    (aiCreditService.getBalance as ReturnType<typeof vi.fn>).mockResolvedValue({ balance: 100, expiresAt: new Date(Date.now() + 86400000) });
    (aiCreditService.useCredits as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (aiCreditService.getOperationCost as ReturnType<typeof vi.fn>).mockImplementation((op) => {
      if (op === 'churn_prediction') return 5;
      return 1;
    });
  });

  async function getPredictChurn() {
    const { insightsService } = await import('../../../services/ai/agents.service');
    return insightsService.predictChurn.bind(insightsService);
  }

  async function mockPoolQuery(
    ownershipResult: unknown[] = [{ id: productId }],
    studentDataResult: unknown[] = [],
    persistResult: { rows: Array<{ id: string }>; rowCount?: number } = { rows: [{ id: crypto.randomUUID() }], rowCount: 1 }
  ) {
    const pool = (await import('../../../db/postgres')).default;
    const queryMock = pool.query as ReturnType<typeof vi.fn>;

    // Call order: 1) ownership check, 2) student data query, 3) persist (INSERT + RETURNING)
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM') && sql.includes('products') && sql.includes('creator_id') && sql.includes('$2')) {
        return { rows: ownershipResult };
      }
      if (sql.includes('FROM') && sql.includes('orders') && sql.includes('buyer_id')) {
        return { rows: studentDataResult };
      }
      if (sql.includes('INTO') && sql.includes('churn_predictions') && sql.includes('INSERT')) {
        return persistResult;
      }
      return { rows: [] };
    });
  }

  it('should throw 403 when user does not own the product', async () => {
    await mockPoolQuery([]); // Empty = not found

    const predictChurn = await getPredictChurn();

    const err = await predictChurn(productId, userId).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as any).statusCode).toBe(403);
  });

  it('should throw 402 when credits are insufficient', async () => {
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    vi.mocked(aiCreditService.getBalance).mockResolvedValue({ balance: 4, expiresAt: new Date(Date.now() + 86400000) });
    await mockPoolQuery([{ id: productId }]);

    const predictChurn = await getPredictChurn();

    const err = await predictChurn(productId, userId).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as any).statusCode).toBe(402);
    expect(err.message).toBe('Créditos insuficientes');
  });

  it('should return empty predictions when product has no students', async () => {
    await mockPoolQuery([{ id: productId }], []); // No student data

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    expect(result.predictions).toEqual([]);
    expect(result.totalStudents).toBe(0);
    expect(result.creditsUsed).toBe(0);
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    expect(aiCreditService.useCredits).not.toHaveBeenCalled();
  });

  it('should return predictions with churn scores for at-risk students', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'Student 1 is inactive', recommendedAction: 'Send email' },
        { userId: studentId2, narrative: 'Student 2 has low progress', recommendedAction: 'Offer help' },
      ]),
      model: 'simulator',
    });

    // Student data: one inactive (>30 days), one with low progress
    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(), // 45 days ago
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
      {
        buyer_id: studentId2,
        user_name: 'Student Two',
        last_purchase_date: new Date(Date.now() - 20 * 86400000).toISOString(), // 20 days ago
        progress: 10,
        interactions_60d: 2,
        days_since_last_access: 20,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    // Student 1: daysSinceLastAccess=45>30 (+40) + progress<20% AND days>14 (+30) + interactions=0 (+20) = 90
    // Student 2: daysSinceLastAccess=20 NOT>30 (0) + progress<20% AND days>14 (+30) + interactions=2 NOT 0 (0) = 30
    // With default threshold 50: only Student 1 (90 >= 50) is included
    expect(result.predictions).toHaveLength(1);
    expect(result.totalStudents).toBe(2);

    const pred1 = result.predictions.find((p) => p.userId === studentId1);
    expect(pred1).toBeDefined();
    expect(pred1!.churnScore).toBe(90);
    expect(pred1!.riskFactors.length).toBeGreaterThan(0);
    expect(pred1!.narrative).toBe('Student 1 is inactive');
    expect(pred1!.recommendedAction).toBe('Send email');
  });

  it('should return partial results when LLM fails but heuristic scores succeed', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    vi.mocked(llmService.chat).mockRejectedValue(new Error('LLM service unavailable'));

    // Student with high churn score
    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(),
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    // Should still return predictions with heuristic scores, but no narrative
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].churnScore).toBeGreaterThanOrEqual(50);
    expect(result.predictions[0].narrative).toBeNull();
    expect(result.predictions[0].recommendedAction).toBeNull();
    // Credits should be refunded when LLM fails (creditsUsed = 0)
    expect(result.creditsUsed).toBe(0);
    expect(aiCreditService.useCredits).toHaveBeenCalledTimes(1);
    expect(aiCreditService.addCredits).toHaveBeenCalledWith(
      userId, 5, 'Refund - churn prediction LLM failed'
    );
  });

  it('should respect custom threshold', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'High risk student', recommendedAction: 'Immediate action' },
      ]),
      model: 'simulator',
    });

    // Two students with different scores
    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(), // score ~60
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
      {
        buyer_id: studentId2,
        user_name: 'Student Two',
        last_purchase_date: new Date(Date.now() - 20 * 86400000).toISOString(), // score ~30
        progress: 10,
        interactions_60d: 2,
        days_since_last_access: 20,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    // With threshold=70, Student 1 (score 90) >= 70 → included, Student 2 (score 30) < 70 → excluded
    const result = await predictChurn(productId, userId, 70);

    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].userId).toBe(studentId1);
    expect(result.predictions[0].churnScore).toBe(90);
  });

  it('should include confidence level based on data availability', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'Active student with data', recommendedAction: 'Monitor' },
      ]),
      model: 'simulator',
    });

    // Student with interactions (high confidence — 5 interactions >= 3 threshold)
    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 10 * 86400000).toISOString(), // 10 days ago
        progress: 50,
        interactions_60d: 5,
        days_since_last_access: 10,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    // Use threshold=0 to include all students
    const result = await predictChurn(productId, userId, 0);

    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].confidence).toBe('high');
  });

  it('should deduct credits after successful prediction', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'At risk', recommendedAction: 'Email' },
      ]),
      model: 'simulator',
    });

    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(),
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    await predictChurn(productId, userId);

    expect(aiCreditService.useCredits).toHaveBeenCalledWith(
      userId, 5, 'Churn Prediction'
    );
  });

  it('should persist predictions to churn_predictions table', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'Inactive student', recommendedAction: 'Send email' },
      ]),
      model: 'simulator',
    });

    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(),
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    // Verify prediction.id is populated after persistence
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].id).toBeDefined();
    expect(typeof result.predictions[0].id).toBe('string');
    expect(result.predictions[0].id!.length).toBeGreaterThan(0);

    const pool = (await import('../../../db/postgres')).default;
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    // Check that INSERT into churn_predictions was called
    const insertCalls = queryMock.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('churn_predictions') && call[0].includes('INSERT')
    );
    expect(insertCalls.length).toBeGreaterThan(0);
  });

  it('should assign low confidence for students with no interaction data', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'No interaction data', recommendedAction: 'Re-engage' },
      ]),
      model: 'simulator',
    });

    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 90 * 86400000).toISOString(),
        progress: 5,
        interactions_60d: 0,
        days_since_last_access: 90,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId, 0);

    expect(result.predictions[0].confidence).toBe('low');
  });

  it('should return empty predictions when no students exceed threshold', async () => {
    // Student with low churn score (days=5, progress=80, interactions=10 → score=0)
    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 5 * 86400000).toISOString(),
        progress: 80,
        interactions_60d: 10,
        days_since_last_access: 5,
      },
    ];
    await mockPoolQuery([{ id: productId }], studentData);

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    expect(result.predictions).toEqual([]);
    expect(result.totalStudents).toBe(1);
    expect(result.creditsUsed).toBe(0);
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    expect(aiCreditService.useCredits).not.toHaveBeenCalled();
  });

  it('should refund credits and return null IDs when persistence fails', async () => {
    const { llmService } = await import('../../../services/ai/llm.service');
    const { aiCreditService } = await import('../../../services/ai/credits.service');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: JSON.stringify([
        { userId: studentId1, narrative: 'At risk', recommendedAction: 'Email' },
      ]),
      model: 'simulator',
    });

    const studentData = [
      {
        buyer_id: studentId1,
        user_name: 'Student One',
        last_purchase_date: new Date(Date.now() - 45 * 86400000).toISOString(),
        progress: 15,
        interactions_60d: 0,
        days_since_last_access: 45,
      },
    ];
    // Make persist INSERT throw
    await mockPoolQuery([{ id: productId }], studentData, { rows: [], rowCount: 0 });
    const pool = (await import('../../../db/postgres')).default;
    const queryMock = pool.query as ReturnType<typeof vi.fn>;
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM') && sql.includes('products') && sql.includes('creator_id') && sql.includes('$2')) {
        return { rows: [{ id: productId }] };
      }
      if (sql.includes('FROM') && sql.includes('orders') && sql.includes('buyer_id')) {
        return { rows: studentData };
      }
      if (sql.includes('INTO') && sql.includes('churn_predictions') && sql.includes('INSERT')) {
        throw new Error('Database connection lost');
      }
      return { rows: [] };
    });

    const predictChurn = await getPredictChurn();
    const result = await predictChurn(productId, userId);

    // Verify predictions have null IDs
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].id).toBeNull();
    // Verify credits were refunded (creditsUsed should be 0)
    expect(result.creditsUsed).toBe(0);
    // Verify addCredits was called for refund
    expect(aiCreditService.addCredits).toHaveBeenCalledWith(
      userId, 5, 'Refund - churn prediction persistence failed'
    );
  });
});
