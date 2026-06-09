import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock configService
vi.mock('../../../services/config.service', () => ({
  configService: {
    getBoolean: vi.fn().mockResolvedValue(true),
    getNumber: vi.fn().mockResolvedValue(0.7),
    get: vi.fn().mockResolvedValue('test-model'),
  },
}));

// Mock llmService
vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn().mockResolvedValue({ content: 'Hello! How can I help you?', model: 'test-model' }),
    chatStream: vi.fn(),
    buildPrompt: vi.fn(),
    getProvider: vi.fn().mockReturnValue('simulator'),
    isConfigured: vi.fn().mockReturnValue(true),
  },
}));

// Mock userContextRepository
vi.mock('../../../repositories/user-context.repository', () => ({
  userContextRepository: {
    findByUserAndProduct: vi.fn(),
    upsert: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Capture mock references AFTER vi.mock (which is hoisted) via imports
import { userContextRepository } from '../../../repositories/user-context.repository';
import logger from '../../../utils/logger';
import { llmService } from '../../../services/ai/llm.service';
import { configService } from '../../../services/config.service';
import { conciergeService } from '../../../services/ai/concierge.service';

describe('conciergeService.context sanitization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-set default mock implementations after clearAllMocks
    vi.mocked(configService.getBoolean).mockResolvedValue(true);
    vi.mocked(configService.getNumber).mockResolvedValue(0.7);
    vi.mocked(configService.get).mockResolvedValue('test-model');
    vi.mocked(llmService.chat).mockResolvedValue({
      content: 'Hello! How can I help you?',
      model: 'test-model',
    });
  });

  it('chat succeeds when userContextRepository throws, and logs sanitized warn', async () => {
    // Mock findByUserAndProduct to throw a constraint error
    vi.mocked(userContextRepository.findByUserAndProduct).mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint')
    );
    vi.mocked(userContextRepository.upsert).mockRejectedValueOnce(
      new Error('foreign key violation')
    );

    const result = await conciergeService.chat({
      message: 'Hello',
      userId: 'user-1',
    });

    // Assert chat succeeded (did NOT throw) — fire-and-forget pattern
    expect(result).toBeDefined();
    expect(result.response).toBe('Hello! How can I help you?');

    // Let the fire-and-forget promise chain settle
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalled();
    }, { timeout: 1000 });

    // Assert logger.warn was called with the sanitized operation context
    const warnCalls = vi.mocked(logger.warn).mock.calls.flat().join(' ');
    expect(warnCalls).toMatch(/concierge\.contextFind|concierge\.contextUpsert|Failed to save user context/);
  });
});
