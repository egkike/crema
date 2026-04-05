import { describe, it, expect, vi } from 'vitest';

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

vi.mock('../../errors/AppError', () => ({
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
  },
}));

vi.mock('../../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    chatStream: vi.fn(),
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
