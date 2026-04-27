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

// Import after mocks are set
import { registerAISkills } from '../../../services/ai/index';
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
    expect(skillsRegistry.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'llm-chat', capability: 'llm.chat' }));
  });

  it('should register llm.stream skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'llm-stream', capability: 'llm.stream' }));
  });

  it('should register embedding.generate skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'embedding-generate', capability: 'embedding.generate' }));
  });

  it('should register embedding.batch skill', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledWith(expect.objectContaining({ id: 'embedding-batch', capability: 'embedding.batch' }));
  });

  it('should register all 5 skills', async () => {
    await registerAISkills();
    expect(skillsRegistry.register).toHaveBeenCalledTimes(5);
    expect(registerCallCount).toBe(5);
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

    await expect(handler({ text: '' })).rejects.toThrow('text is required and must be a non-empty string');
  });

  it('llm.stream handler rejects empty messages', async () => {
    await registerAISkills();
    const handler = await skillsRegistry.findHandler('llm.stream');

    await expect(handler({ messages: [] })).rejects.toThrow('messages array cannot be empty');
  });
});