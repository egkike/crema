import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool
const mockQuery = vi.fn();
vi.mock('../../db/postgres', () => ({
  default: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock llmService
vi.mock('../../services/ai/llm.service', () => ({
  llmService: {
    chat: vi.fn(),
    buildPrompt: vi.fn((system, context, question) => [
      { role: 'system', content: system },
      { role: 'system', content: `Context:\n${context}` },
      { role: 'user', content: `[USER_INPUT_START]\n${question}\n[USER_INPUT_END]` },
    ]),
    getProvider: () => 'simulator',
    isConfigured: () => false,
  },
}));

// Mock credits service
vi.mock('../../services/ai/credits.service', () => ({
  aiCreditService: {
    deductCredits: vi.fn().mockResolvedValue({ success: true, remaining: 100 }),
    addCredits: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock validators
vi.mock('../../utils/validators.util', () => ({
  getValidatedSchema: () => 'public',
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { qaAgentService, insightsService } from '../../services/ai/agents.service';

describe('agents.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('qaAgentService', () => {
    describe('getConfig', () => {
      it('should return QA agent config for a product', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'config-1',
              product_id: 'prod-1',
              is_enabled: true,
              model: 'gpt-4o-mini',
              system_prompt: 'Custom prompt',
              temperature: 0.7,
              max_tokens: 500,
              use_memory: true,
              use_faqs: false,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });

        const result = await qaAgentService.getConfig('prod-1');

        expect(result).not.toBeNull();
        expect(result?.id).toBe('config-1');
        expect(result?.is_enabled).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('product_qa_agent_config'),
          ['prod-1']
        );
      });

      it('should return null when config not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await qaAgentService.getConfig('prod-nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('updateConfig', () => {
      it('should update existing config', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'config-1',
              product_id: 'prod-1',
              is_enabled: true,
              model: 'gpt-4',
              system_prompt: 'Updated prompt',
              temperature: 0.8,
              max_tokens: 1000,
              use_memory: true,
              use_faqs: true,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });

        const result = await qaAgentService.updateConfig('prod-1', {
          isEnabled: true,
          model: 'gpt-4',
          systemPrompt: 'Updated prompt',
          temperature: 0.8,
          maxTokens: 1000,
          useMemory: true,
          useFaqs: true,
        });

        expect(result.model).toBe('gpt-4');
        expect(result.temperature).toBe(0.8);
      });

      it('should throw error when no updates provided and no existing config', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          qaAgentService.updateConfig('prod-1', {})
        ).rejects.toThrow('No config to create');
      });
    });

    describe('createConversation', () => {
      it('should create a new conversation', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'conv-1',
              agent_type: 'qa',
              product_id: 'prod-1',
              user_id: 'user-1',
              status: 'active',
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });

        const result = await qaAgentService.createConversation('qa', 'prod-1', 'user-1');

        expect(result.id).toBe('conv-1');
        expect(result.agent_type).toBe('qa');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('agent_conversations'),
          ['qa', 'prod-1', 'user-1', '{}']
        );
      });
    });

    describe('getConversation', () => {
      it('should return conversation with messages', async () => {
        mockQuery
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'conv-1',
                agent_type: 'qa',
                product_id: 'prod-1',
                user_id: 'user-1',
                status: 'active',
                metadata: {},
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id: 'msg-1',
                conversation_id: 'conv-1',
                role: 'user',
                content: 'Hello',
                tokens_used: 10,
                created_at: new Date(),
              },
            ],
          });

        const result = await qaAgentService.getConversation('conv-1');

        expect(result).not.toBeNull();
        expect(result?.conversation.id).toBe('conv-1');
        expect(result?.messages).toHaveLength(1);
        expect(result?.messages[0].role).toBe('user');
      });

      it('should return null when conversation not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await qaAgentService.getConversation('conv-nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('getUserConversations', () => {
      it('should return user conversations', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'conv-1',
              agent_type: 'qa',
              product_id: 'prod-1',
              user_id: 'user-1',
              status: 'active',
              metadata: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });

        const result = await qaAgentService.getUserConversations('user-1');

        expect(result).toHaveLength(1);
        expect(result[0].agent_type).toBe('qa');
      });

      it('should filter by agent type', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await qaAgentService.getUserConversations('user-1', 'tutor', 10);

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("AND agent_type = $2"),
          expect.arrayContaining(['tutor', 10])
        );
      });
    });

    describe('addMessage', () => {
      it('should add a message to conversation', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              conversation_id: 'conv-1',
              role: 'user',
              content: 'Hello',
              tokens_used: 10,
              created_at: new Date(),
            },
          ],
        });

        const result = await qaAgentService.addMessage('conv-1', 'user', 'Hello', 10);

        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello');
        expect(result.tokens_used).toBe(10);
      });
    });
  });

  describe('insightsService', () => {
    describe('getDashboards', () => {
      it('should return user dashboards', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'dash-1',
              name: 'Sales Overview',
              description: 'Monthly sales data',
              is_default: true,
            },
            {
              id: 'dash-2',
              name: 'User Analytics',
              description: null,
              is_default: false,
            },
          ],
        });

        const result = await insightsService.getDashboards('user-123');

        expect(result.dashboards).toHaveLength(2);
        expect(result.dashboards[0].name).toBe('Sales Overview');
        expect(result.dashboards[0].isDefault).toBe(true);
        expect(result.dashboards[1].description).toBeNull();
      });

      it('should return empty array when no dashboards', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await insightsService.getDashboards('user-no-dash');

        expect(result.dashboards).toHaveLength(0);
      });
    });

    describe('createDashboard', () => {
      it('should create a new dashboard', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'dash-new' }],
        });

        const result = await insightsService.createDashboard('user-123', 'New Dashboard', 'Description');

        expect(result.id).toBe('dash-new');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          ['user-123', 'New Dashboard', 'Description']
        );
      });

      it('should create dashboard without description', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'dash-new' }],
        });

        const result = await insightsService.createDashboard('user-123', 'Simple Dashboard');

        expect(result.id).toBe('dash-new');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT'),
          ['user-123', 'Simple Dashboard', null]
        );
      });
    });

    describe('updateDashboard', () => {
      it('should update dashboard name', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await insightsService.updateDashboard('dash-1', { name: 'Updated Name' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('name = $2'),
          ['dash-1', 'Updated Name']
        );
      });

      it('should update dashboard description', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await insightsService.updateDashboard('dash-1', { description: 'New desc' });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('description = $2'),
          ['dash-1', 'New desc']
        );
      });

      it('should update dashboard config', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await insightsService.updateDashboard('dash-1', {
          config: { charts: ['bar', 'line'] },
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('config = $2'),
          ['dash-1', JSON.stringify({ charts: ['bar', 'line'] })]
        );
      });
    });

    describe('deleteDashboard', () => {
      it('should delete a dashboard', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await insightsService.deleteDashboard('dash-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE'),
          ['dash-1']
        );
      });
    });

    describe('getDashboardById', () => {
      it('should return dashboard by ID', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'dash-1',
              name: 'Test Dashboard',
              description: 'Test desc',
              creator_id: 'user-123',
              is_default: false,
              config: {},
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        });

        const result = await insightsService.getDashboardById('dash-1');

        expect(result).not.toBeNull();
        expect(result?.name).toBe('Test Dashboard');
      });

      it('should return null when dashboard not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await insightsService.getDashboardById('dash-nonexistent');

        expect(result).toBeNull();
      });
    });
  });
});
