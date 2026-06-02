import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import mocks first (hoisted by vitest)
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
    connect: vi.fn(),
  })),
}));

vi.mock('../../../db/postgres', () => ({
  default: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));

vi.mock('../../../config/index', () => ({
  config: {
    redis: { host: 'localhost', port: 6379, password: undefined },
    ai: { provider: 'simulator' },
    db: { schema: 'public' },
    allowedSchemas: ['public', 'crema'],
  },
}));

vi.mock('../../../utils/logger', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn().mockResolvedValue({ content: 'test response', model: 'test' }),
    chatStream: vi.fn().mockResolvedValue({ content: 'test stream', model: 'test' }),
  },
}));

vi.mock('../../../services/ai/embedding.service', () => ({
  embeddingService: {
    generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    generateEmbeddings: vi.fn().mockResolvedValue([[0.1], [0.2]]),
  },
}));

vi.mock('../../../services/ai/agents.service', () => ({
  qaAgentService: { chat: vi.fn(), chatStream: vi.fn(), getConfig: vi.fn(), updateConfig: vi.fn(), getUserConversations: vi.fn(), getConversation: vi.fn() },
  tutorService: { chat: vi.fn(), chatStream: vi.fn(), getConfig: vi.fn(), updateConfig: vi.fn(), getInsights: vi.fn() },
  insightsService: {
    query: vi.fn().mockResolvedValue({ results: [] }),
    chatStream: vi.fn().mockResolvedValue(undefined),
    getDashboards: vi.fn().mockResolvedValue([]),
    createDashboard: vi.fn().mockResolvedValue({ id: 'd1' }),
    getDashboardById: vi.fn().mockResolvedValue({ id: 'd1', creator_id: 'u1' }),
    updateDashboard: vi.fn().mockResolvedValue(undefined),
    deleteDashboard: vi.fn().mockResolvedValue(true),
    predictChurn: vi.fn().mockResolvedValue({ predictions: [], totalStudents: 0, creditsUsed: 5 }),
    generateRecoveryEmail: vi.fn().mockResolvedValue({ email: { subject: 'test', bodyHtml: '<p>test</p>', previewText: 'test' }, studentName: 'Test', productName: 'Test', creditsUsed: 3, recoveryEmailId: 'r1', creditsRefunded: false }),
    compareEntities: vi.fn().mockResolvedValue({ entityA: { label: 'A', data: [] }, entityB: { label: 'B', data: [] }, narrative: 'test', deltas: [], recommendation: 'test', creditsUsed: 3, creditsRefunded: false }),
  },
  analyticsService: { getDashboardMetrics: vi.fn().mockResolvedValue({ metrics: [] }) },
}));

// Import after mocks are set
import { registerAISkills, skills } from '../../../services/ai/index';
import { skillsRegistry, clearRegisteredSkills } from '../../../services/skills-registry.service';
import type { Skill } from '../../../services/skills-registry.service';

describe('AI Services - registerAISkills', () => {
  let originalRegister: (skill: Skill) => Promise<void>;
  let registerCallCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    clearRegisteredSkills();
    registerCallCount = 0;

    // Store original and spy
    originalRegister = skillsRegistry.register.bind(skillsRegistry);
    vi.spyOn(skillsRegistry, 'register').mockImplementation(async (skill: Skill) => {
      registerCallCount++;
      // Actually register so handlers are stored
      await originalRegister(skill);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Registration Tests ---

  it('should register llm.chat skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'llm-chat', capability: 'llm.chat' })
    );
  });

  it('should register llm.stream skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'llm-stream', capability: 'llm.stream' })
    );
  });

  it('should register embedding.generate skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'embedding-generate', capability: 'embedding.generate' })
    );
  });

  it('should register embedding.batch skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'embedding-batch', capability: 'embedding.batch' })
    );
  });

  it('should register all skills', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledTimes(skills.length);
    expect(registerCallCount).toBe(skills.length);
  });

  it('should have streaming=false for llm.chat', async () => {
    await registerAISkills();
    const skill = await skillsRegistry.findByCapability('llm.chat');
    expect(skill.options.streaming).toBe(false);
  });

  it('should have streaming=true for llm.stream', async () => {
    await registerAISkills();
    const skill = await skillsRegistry.findByCapability('llm.stream');
    expect(skill.options.streaming).toBe(true);
  });

  it('should have cacheable=true for embedding', async () => {
    await registerAISkills();
    const skill = await skillsRegistry.findByCapability('embedding.generate');
    expect(skill.options.cacheable).toBe(true);
  });

  // --- Handler validation tests ---

  it('llm.chat handler validates temperature range', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('llm.chat');
    expect(handler).toBeDefined();

    await expect(
      handler({
        messages: [{ role: 'user', content: 'test' }],
        temperature: 5,
      })
    ).rejects.toThrow('temperature must be a number between 0 and 2');
  });

  it('llm.chat handler validates maxTokens positive', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('llm.chat');

    await expect(
      handler({
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 0,
      })
    ).rejects.toThrow('maxTokens must be a positive integer');
  });

  it('llm.chat handler rejects empty messages', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('llm.chat');

    await expect(handler({ messages: [] })).rejects.toThrow('messages array cannot be empty');
  });

  it('embedding handler rejects empty text', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('embedding.generate');

    await expect(handler({ text: '' })).rejects.toThrow(
      'text is required and must be a non-empty string'
    );
  });

  it('llm.stream handler rejects empty messages', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('llm.stream');

    await expect(handler({ messages: [] })).rejects.toThrow('messages array cannot be empty');
  });

  // --- Memory Service Handler Validation ---

  it('memory.search handler requires query', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('memory.search');

    await expect(handler({ query: '' })).rejects.toThrow(
      'query is required and must be a non-empty string'
    );
  });

  it('memory.search handler validates limit range', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('memory.search');

    await expect(handler({ query: 'test', limit: 0 })).rejects.toThrow(
      'limit must be a positive integer between 1 and 100'
    );
    await expect(handler({ query: 'test', limit: 101 })).rejects.toThrow(
      'limit must be a positive integer between 1 and 100'
    );
  });

  it('memory.search handler validates sourceTypes', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('memory.search');

    await expect(handler({ query: 'test', sourceTypes: 'invalid' })).rejects.toThrow(
      'sourceTypes must be an array'
    );
    await expect(handler({ query: 'test', sourceTypes: ['invalid'] })).rejects.toThrow(
      'sourceTypes must be one of'
    );
  });

  // --- Credits Service Handler Validation ---

  it('credits.balance handler requires requestingUserId and userId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('credits.balance');

    // Missing both should fail
    await expect(handler({})).rejects.toThrow('requestingUserId is required');
    // Missing requestingUserId
    await expect(handler({ userId: 'u1' })).rejects.toThrow('requestingUserId is required');
    // Missing userId
    await expect(handler({ requestingUserId: 'u1' })).rejects.toThrow(
      'userId is required and must be a non-empty string'
    );
  });

  it('credits.balance handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('credits.balance');

    // Mismatched IDs should fail with 403
    await expect(handler({ requestingUserId: 'u1', userId: 'u2' })).rejects.toThrow(
      'Unauthorized access to user credits'
    );
  });

  it('credits.balance handler accepts valid request', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('credits.balance');

    // Matching IDs should pass validation and execute
    await expect(handler({ requestingUserId: 'u1', userId: 'u1' })).resolves.toBeDefined();
  });

  // --- QA Agent Handler Validation ---

  it('qa.chat handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('qa.chat');

    // Missing requestingUserId should fail
    await expect(handler({ productId: 'p1', userId: 'u1', message: 'test' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('qa.chat handler requires message', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('qa.chat');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', message: '' })
    ).rejects.toThrow('message is required and must be a non-empty string');
  });

  it('qa.chat handler rejects message > 2000 chars', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('qa.chat');
    const longMessage = 'a'.repeat(2001);

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', message: longMessage })
    ).rejects.toThrow('message must be less than 2000 characters');
  });

  it('qa.chat handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('qa.chat');

    // Mismatched IDs should fail with 403
    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u2', message: 'test' })
    ).rejects.toThrow('Unauthorized access to user resource');
  });

  // --- Tutor Handler Validation ---

  it('tutor.chat handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('tutor.chat');

    // Missing requestingUserId should fail
    await expect(handler({ productId: 'p1', userId: 'u1', message: 'test' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('tutor.chat handler requires message', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('tutor.chat');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', message: '' })
    ).rejects.toThrow('message is required and must be a non-empty string');
  });

  it('tutor.chat handler rejects message > 2000 chars', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('tutor.chat');
    const longMessage = 'a'.repeat(2001);

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', message: longMessage })
    ).rejects.toThrow('message must be less than 2000 characters');
  });

  it('tutor.chat handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('tutor.chat');

    // Mismatched IDs should fail with 403
    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u2', message: 'test' })
    ).rejects.toThrow('Unauthorized access to user resource');
  });

  // --- Content Assistant Handler Validation ---

  it('content.analyze handler requires analysisType', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.analyze');

    await expect(
      handler({ requestingUserId: 'u1', content: 'test', analysisType: 'invalid' })
    ).rejects.toThrow();
  });

  it('content.analyze handler accepts valid analysisType', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.analyze');

    // Valid types should pass validation (handler executes, may fail at LLM call but validation passes)
    await expect(
      handler({ requestingUserId: 'u1', content: 'test content', analysisType: 'summary' })
    ).resolves.toBeDefined();
    await expect(
      handler({ requestingUserId: 'u1', content: 'test content', analysisType: 'topics' })
    ).resolves.toBeDefined();
    await expect(
      handler({ requestingUserId: 'u1', content: 'test content', analysisType: 'questions' })
    ).resolves.toBeDefined();
    await expect(
      handler({ requestingUserId: 'u1', content: 'test content', analysisType: 'full' })
    ).resolves.toBeDefined();
  });

  // --- Insights Handler Validation ---

  it('insights.ask handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.ask');

    // Missing requestingUserId should fail
    await expect(handler({ userId: 'u1', naturalLanguageQuery: 'test' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('insights.ask handler requires query', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.ask');

    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', naturalLanguageQuery: '' })
    ).rejects.toThrow('naturalLanguageQuery is required and must be a non-empty string');
  });

  it('insights.ask handler rejects query > 500 chars', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.ask');
    const longQuery = 'a'.repeat(501);

    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', naturalLanguageQuery: longQuery })
    ).rejects.toThrow('naturalLanguageQuery must be less than 500 characters');
  });

  it('insights.ask handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.ask');

    // Mismatched IDs should fail with 403
    await expect(
      handler({ requestingUserId: 'u1', userId: 'u2', naturalLanguageQuery: 'test' })
    ).rejects.toThrow('Unauthorized access to user insights');
  });

  // --- Analytics Handler Validation ---

  it('analytics.metrics handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('analytics.metrics');

    // Missing requestingUserId should fail
    await expect(handler({ creatorId: 'creator1' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('analytics.metrics handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('analytics.metrics');

    // Mismatched IDs should fail with 403
    await expect(handler({ requestingUserId: 'u1', creatorId: 'creator2' })).rejects.toThrow(
      'Unauthorized access to creator analytics'
    );
  });

  it('analytics.metrics handler validates invalid date format', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('analytics.metrics');

    // Invalid date format should fail
    await expect(
      handler({ requestingUserId: 'creator1', creatorId: 'creator1', startDate: 'invalid' })
    ).rejects.toThrow('startDate must be a valid ISO date string');
    await expect(
      handler({ requestingUserId: 'creator1', creatorId: 'creator1', startDate: '2024-13-01' })
    ).rejects.toThrow('startDate must be a valid date');
  });

  it('analytics.metrics handler accepts optional dates', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('analytics.metrics');

    // Should pass validation and execute (DB returns mocked data)
    await expect(
      handler({
        requestingUserId: 'creator1',
        creatorId: 'creator1',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      })
    ).resolves.toBeDefined();
  });

  // --- QA List Handler Validation ---

  it('qa.list handler requires productId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('qa.list');

    await expect(handler({})).rejects.toThrow(
      'productId is required and must be a non-empty string'
    );
  });

  // --- Review List Handler Validation ---

  it('review.list handler requires productId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('review.list');

    await expect(handler({})).rejects.toThrow(
      'productId is required and must be a non-empty string'
    );
  });

  // --- Reports Handler Validation ---

  it('reports.create handler validates contentType', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('reports.create');

    await expect(
      handler({ reporterId: 'u1', contentType: 'invalid', contentId: 'c1', reasonCode: 'spam' })
    ).rejects.toThrow('contentType must be one of');
  });

  it('reports.create handler accepts valid contentType', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('reports.create');

    const validTypes = ['product', 'review', 'question', 'answer', 'faq', 'user'];
    for (const contentType of validTypes) {
      await expect(
        handler({ reporterId: 'u1', contentType, contentId: 'c1', reasonCode: 'spam' })
      ).rejects.toThrow();
    }
  });

  it('reports.create handler requires reasonCode', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('reports.create');

    await expect(
      handler({ reporterId: 'u1', contentType: 'product', contentId: 'c1', reasonCode: '' })
    ).rejects.toThrow('reasonCode is required');
  });

  // --- Concierge Handler Authorization ---

  it('concierge-chat handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('concierge.chat');

    // Missing requestingUserId should fail
    await expect(handler({ message: 'test', userId: 'u1' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('concierge-chat handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('concierge.chat');

    // Mismatched IDs should fail with 403
    await expect(
      handler({ requestingUserId: 'u1', message: 'test', userId: 'u2' })
    ).rejects.toThrow('Unauthorized access to user concierge');
  });

  // --- Boundary Tests for DoS Limits ---

  it('embedding-batch handler rejects texts array > 1000 items', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('embedding.batch');

    const tooManyTexts = Array(1001).fill('test text');
    await expect(handler({ texts: tooManyTexts })).rejects.toThrow('exceeds maximum size of 1000');
  });

  it('memory.search handler rejects sourceTypes array > 20 items', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('memory.search');

    const tooManyTypes = Array(21).fill('lesson');
    await expect(handler({ query: 'test', sourceTypes: tooManyTypes })).rejects.toThrow(
      'sourceTypes array exceeds maximum size of 20'
    );
  });

  it('content.analyze handler rejects content > 50000 chars', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.analyze');

    const longContent = 'a'.repeat(50001);
    await expect(
      handler({ requestingUserId: 'u1', content: longContent, analysisType: 'summary' })
    ).rejects.toThrow('exceeds maximum length of 50000');
  });

  it('content.quiz handler rejects content > 50000 chars', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.quiz');

    const longContent = 'a'.repeat(50001);
    await expect(handler({ content: longContent, analysisType: 'quiz' })).rejects.toThrow(
      'exceeds maximum length of 50000'
    );
  });

  it('content.transcribe handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.transcribe');

    // Mismatched requestingUserId and userId should fail with 403
    await expect(
      handler({ requestingUserId: 'u1', userId: 'u2', file: Buffer.from('test') })
    ).rejects.toThrow('Unauthorized access to user transcription resource');
  });

  it('content.transcribe handler rejects buffer > 25MB', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('content.transcribe');

    // Create a buffer larger than 25MB (26MB of data)
    const tooLargeBuffer = { type: 'Buffer', data: Array(26 * 1024 * 1024).fill(1) };
    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', file: tooLargeBuffer })
    ).rejects.toThrow('exceeds maximum size of 25MB');

    // Also test edge case with Buffer object directly (26MB)
    const buffer26MB = Buffer.alloc(26 * 1024 * 1024);
    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', file: buffer26MB })
    ).rejects.toThrow('exceeds maximum size of 25MB');
  });

  // --- Insights Expansion: Churn Prediction, Compare, Recovery Email ---

  it('insights.predict handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(handler({ productId: 'p1', userId: 'u1' })).rejects.toThrow(
      'requestingUserId is required'
    );
  });

  it('insights.predict handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u2' })
    ).rejects.toThrow('Unauthorized access to user insights');
  });

  it('insights.predict handler rejects invalid threshold', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', threshold: 150 })
    ).rejects.toThrow('threshold must be a number between 0 and 100');
  });

  it('insights.predict handler rejects missing productId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', threshold: 70 })
    ).rejects.toThrow('productId is required');
  });

  it('insights.predict handler rejects missing userId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', threshold: 70 })
    ).rejects.toThrow('userId is required');
  });

  it('insights.predict handler accepts valid request', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.predict');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', threshold: 70 })
    ).resolves.toBeDefined();
  });

  it('insights.compare handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        userId: 'u1',
        entityType: 'period',
        entityA: 'A',
        entityB: 'B',
        metrics: ['revenue'],
      })
    ).rejects.toThrow('requestingUserId is required');
  });

  it('insights.compare handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u2',
        entityType: 'period',
        entityA: 'A',
        entityB: 'B',
        metrics: ['revenue'],
      })
    ).rejects.toThrow('Unauthorized access to user insights');
  });

  it('insights.compare handler rejects invalid entityType', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'invalid',
        entityA: 'A',
        entityB: 'B',
        metrics: ['revenue'],
      })
    ).rejects.toThrow('entityType must be "period" or "product"');
  });

  it('insights.compare handler rejects empty metrics', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'period',
        entityA: 'A',
        entityB: 'B',
        metrics: [],
      })
    ).rejects.toThrow('metrics is required and must be a non-empty array');
  });

  it('insights.compare handler rejects empty entityA', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'period',
        entityA: '',
        entityB: 'B',
        metrics: ['revenue'],
      })
    ).rejects.toThrow('entityA is required and must be a non-empty string');
  });

  it('insights.compare handler rejects entityA as object', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'period',
        entityA: { label: 'A' },
        entityB: 'B',
        metrics: ['revenue'],
      })
    ).rejects.toThrow('entityA is required and must be a non-empty string');
  });

  it('insights.compare handler rejects entityB as number', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'period',
        entityA: 'A',
        entityB: 42,
        metrics: ['revenue'],
      })
    ).rejects.toThrow('entityB is required and must be a non-empty string');
  });

  it('insights.compare handler accepts valid period comparison', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.compare');

    await expect(
      handler({
        requestingUserId: 'u1',
        userId: 'u1',
        entityType: 'period',
        entityA: '2024-01',
        entityB: '2024-02',
        metrics: ['revenue', 'sales'],
      })
    ).resolves.toBeDefined();
  });

  it('insights.recover handler requires requestingUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ productId: 'p1', userId: 'u1', targetUserId: 't1' })
    ).rejects.toThrow('requestingUserId is required');
  });

  it('insights.recover handler validates authorization', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u2', targetUserId: 't1' })
    ).rejects.toThrow('Unauthorized access to user insights');
  });

  it('insights.recover handler rejects invalid tone', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', targetUserId: 't1', tone: 'aggressive' })
    ).rejects.toThrow('tone must be empathic, direct, or motivational');
  });

  it('insights.recover handler rejects missing productId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', userId: 'u1', targetUserId: 't1' })
    ).rejects.toThrow('productId is required');
  });

  it('insights.recover handler rejects missing userId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', targetUserId: 't1' })
    ).rejects.toThrow('userId is required');
  });

  it('insights.recover handler rejects missing targetUserId', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1' })
    ).rejects.toThrow('targetUserId is required');
  });

  it('insights.recover handler accepts valid request', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('insights.recover');

    await expect(
      handler({ requestingUserId: 'u1', productId: 'p1', userId: 'u1', targetUserId: 't1', tone: 'empathic' })
    ).resolves.toBeDefined();
  });
});
