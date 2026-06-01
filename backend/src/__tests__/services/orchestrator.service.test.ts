import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config service
vi.mock('../../services/config.service', () => ({
  configService: {
    getNumber: vi.fn(),
  },
}));

import { orchestratorService } from '../../services/orchestrator.service';
import { skillsRegistry, clearRegisteredSkills, Skill } from '../../services/skills-registry.service';
import { configService } from '../../services/config.service';

// Helper to create a mock skill
function createMockSkill(
  capability: string,
  handler: (input: unknown) => Promise<unknown>
): Skill {
  return {
    id: `id-${capability}`,
    name: `Skill ${capability}`,
    capability,
    description: `Test skill for ${capability}`,
    parameters: [
      { name: 'query', type: 'string', required: true },
      { name: 'limit', type: 'number', required: false, default: 10 },
    ],
    options: { timeout: 30000 },
    handler,
  };
}

describe('orchestrator.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegisteredSkills();
  });

  afterEach(() => {
    clearRegisteredSkills();
  });

  // =========================================================================
  // executeQuery - success cases
  // =========================================================================

  describe('executeQuery - success', () => {
    it('should find handler, execute, and return result', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'success' });
      const mockSkill = createMockSkill('test.success', mockHandler);

      // Mock skillsRegistry.findByCapability
      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);

      // Mock configService.getNumber for timeout
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      const result = await orchestratorService.executeQuery('test.success', { query: 'test input' });

      expect(result.success).toBe(true);
      expect(result.capability).toBe('test.success');
      expect(result.data).toEqual({ result: 'success' });
      // Handler receives original input (validation doesn't mutate)
      expect(mockHandler).toHaveBeenCalledWith({ query: 'test input' }, { timeout: 30000 });
    });
  });

  // =========================================================================
  // executeQuery - capability not found
  // =========================================================================

  describe('executeQuery - capability not found', () => {
    it('should return error response when capability is not registered', async () => {
      // Mock skillsRegistry.findByCapability to return null
      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(null);

      const result = await orchestratorService.executeQuery('nonexistent.capability', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Capability not found');
      expect(result.capability).toBe('nonexistent.capability');
    });
  });

  // =========================================================================
  // executeQuery - validation failure
  // =========================================================================

  describe('executeQuery - validation failure', () => {
    it('should return ValidationError in response when input validation fails', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'ok' });
      const mockSkill = createMockSkill('test.validation', mockHandler);

      // Mock skillsRegistry.findByCapability
      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);

      // Mock configService.getNumber for timeout
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      // Provide invalid input (missing required field 'query')
      const result = await orchestratorService.executeQuery('test.validation', {
        // missing required 'query' field
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required field');
      expect(result.error).toContain('query');
      expect(result.capability).toBe('test.validation');
    });

    it('should return ValidationError for wrong type', async () => {
      const mockHandler = vi.fn().mockResolvedValue({ result: 'ok' });
      const mockSkill = createMockSkill('test.type', mockHandler);

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      // Provide wrong type (number instead of string)
      const result = await orchestratorService.executeQuery('test.type', {
        query: 12345,
      } as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid type');
      expect(result.error).toContain('query');
    });
  });

  // =========================================================================
  // executeQuery - timeout
  // =========================================================================

  describe('executeQuery - timeout', () => {
    it('should kill long-running handler and return error', async () => {
      // Create a handler that never resolves
      const longRunningHandler = vi.fn().mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );
      const mockSkill = createMockSkill('test.timeout', longRunningHandler);

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);
      // Set very short timeout (10ms) for test
      vi.spyOn(configService, 'getNumber').mockResolvedValue(10);

      const result = await orchestratorService.executeQuery('test.timeout', {
        query: 'test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.capability).toBe('test.timeout');
    });
  });

  // =========================================================================
  // executeQuery - handler throws
  // =========================================================================

  describe('executeQuery - handler throws', () => {
    it('should return generic error message when handler throws', async () => {
      const errorMessage = 'Handler internal error';
      const throwingHandler = vi.fn().mockRejectedValue(new Error(errorMessage));
      const mockSkill = createMockSkill('test.throwing', throwingHandler);

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      const result = await orchestratorService.executeQuery('test.throwing', {
        query: 'test',
      });

      expect(result.success).toBe(false);
      // Generic message (no internal details exposed)
      expect(result.error).toBe('An error occurred while executing the capability');
      expect(result.capability).toBe('test.throwing');
    });

    it('should handle non-Error thrown values with generic message', async () => {
      const throwingHandler = vi.fn().mockRejectedValue('string error');
      const mockSkill = createMockSkill('test.stringerror', throwingHandler);

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(mockSkill);
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      const result = await orchestratorService.executeQuery('test.stringerror', {
        query: 'test',
      });

      expect(result.success).toBe(false);
      // Generic message (no internal details exposed)
      expect(result.error).toBe('An error occurred while executing the capability');
    });
  });

  // =========================================================================
  // listCapabilities
  // =========================================================================

  describe('listCapabilities', () => {
    it('should return all registered skills', async () => {
      const mockSkills: Skill[] = [
        {
          id: 'skill-1',
          name: 'Skill One',
          capability: 'skill.one',
          description: 'First skill',
          parameters: [],
          options: {},
        },
        {
          id: 'skill-2',
          name: 'Skill Two',
          capability: 'skill.two',
          description: 'Second skill',
          parameters: [],
          options: {},
        },
      ];

      vi.spyOn(skillsRegistry, 'listAll').mockResolvedValue(mockSkills);

      const result = await orchestratorService.listCapabilities();

      expect(result).toHaveLength(2);
      expect(result[0]?.capability).toBe('skill.one');
      expect(result[1]?.capability).toBe('skill.two');
    });

    it('should return empty array on error', async () => {
      vi.spyOn(skillsRegistry, 'listAll').mockRejectedValue(new Error('DB error'));

      const result = await orchestratorService.listCapabilities();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // executeQuery - uses skill's parameter schema for validation
  // =========================================================================

  describe('executeQuery - uses skill parameter schema', () => {
    it('should validate using skill-specific parameter schema', async () => {
      // Skill with different parameters than default
      const skillWithParams: Skill = {
        id: 'custom-skill',
        name: 'Custom Skill',
        capability: 'custom.skill',
        description: 'Custom skill with specific params',
        parameters: [
          { name: 'userId', type: 'string', required: true },
          { name: 'active', type: 'boolean', required: false, default: true },
        ],
        options: {},
        handler: vi.fn().mockResolvedValue({ ok: true }),
      };

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(skillWithParams);
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      // Valid input
      const result = await orchestratorService.executeQuery('custom.skill', {
        userId: 'user-123',
        active: false,
      });

      expect(result.success).toBe(true);

      // Invalid: missing required userId
      const result2 = await orchestratorService.executeQuery('custom.skill', {
        active: true,
      } as any);

      expect(result2.success).toBe(false);
      expect(result2.error).toContain('userId');
    });

  it('should validate input and pass original to handler without applying defaults', async () => {
      const skillWithDefaults: Skill = {
        id: 'defaults-skill',
        name: 'Skill with Defaults',
        capability: 'defaults.skill',
        description: 'Skill that uses defaults',
        parameters: [
          { name: 'query', type: 'string', required: true },
          { name: 'limit', type: 'number', required: false, default: 50 },
        ],
        options: {},
        handler: vi.fn().mockImplementation((input: unknown) => {
          // Handler receives original input (defaults NOT applied to caller's object)
          return Promise.resolve({ received: input });
        }),
      };

      vi.spyOn(skillsRegistry, 'findByCapability').mockResolvedValue(skillWithDefaults);
      vi.spyOn(configService, 'getNumber').mockResolvedValue(100);

      // Only provide query, limit should get default value 50
      const result = await orchestratorService.executeQuery('defaults.skill', {
        query: 'test',
      });

      expect(result.success).toBe(true);
      // Handler receives original input (no mutation)
      expect(result.data).toEqual({ received: { query: 'test' } });
    });
  });

  // =========================================================================
  // listCapabilities — Insights Expansion (Task 5)
  // =========================================================================

  describe('listCapabilities — insights expansion skills', () => {
    it('should include insights.predict capability when registered', async () => {
      const mockSkills: Skill[] = [
        {
          id: 'insights-predict',
          name: 'Churn Prediction',
          capability: 'insights.predict',
          description: 'Predict churn probability for product students',
          parameters: [
            { name: 'productId', type: 'string', required: true },
            { name: 'threshold', type: 'number', required: false, default: 50 },
          ],
          options: { timeout: 60000 },
          handler: vi.fn(),
        },
      ];

      vi.spyOn(skillsRegistry, 'listAll').mockResolvedValue(mockSkills);

      const result = await orchestratorService.listCapabilities();

      expect(result).toHaveLength(1);
      expect(result[0]?.capability).toBe('insights.predict');
    });

    it('should include insights.compare capability when registered', async () => {
      const mockSkills: Skill[] = [
        {
          id: 'insights-compare',
          name: 'A/B Comparative Analysis',
          capability: 'insights.compare',
          description: 'Compare two entities (periods or products) across metrics',
          parameters: [
            { name: 'entityType', type: 'string', required: true },
            { name: 'entityA', type: 'string', required: true },
            { name: 'entityB', type: 'string', required: true },
            { name: 'metrics', type: 'array', required: true },
          ],
          options: { timeout: 60000 },
          handler: vi.fn(),
        },
      ];

      vi.spyOn(skillsRegistry, 'listAll').mockResolvedValue(mockSkills);

      const result = await orchestratorService.listCapabilities();

      expect(result).toHaveLength(1);
      expect(result[0]?.capability).toBe('insights.compare');
    });

    it('should include insights.recover capability when registered', async () => {
      const mockSkills: Skill[] = [
        {
          id: 'insights-recover',
          name: 'Recovery Email Generator',
          capability: 'insights.recover',
          description: 'Generate personalized recovery email for at-risk student',
          parameters: [
            { name: 'productId', type: 'string', required: true },
            { name: 'targetUserId', type: 'string', required: true },
            { name: 'tone', type: 'string', required: false, default: 'empathic' },
          ],
          options: { timeout: 30000 },
          handler: vi.fn(),
        },
      ];

      vi.spyOn(skillsRegistry, 'listAll').mockResolvedValue(mockSkills);

      const result = await orchestratorService.listCapabilities();

      expect(result).toHaveLength(1);
      expect(result[0]?.capability).toBe('insights.recover');
    });

    it('should return all three insights capabilities together when registered', async () => {
      const mockSkills: Skill[] = [
        {
          id: 'insights-predict',
          name: 'Churn Prediction',
          capability: 'insights.predict',
          description: 'Predict churn',
          parameters: [],
          options: {},
          handler: vi.fn(),
        },
        {
          id: 'insights-compare',
          name: 'A/B Comparative',
          capability: 'insights.compare',
          description: 'Compare entities',
          parameters: [],
          options: {},
          handler: vi.fn(),
        },
        {
          id: 'insights-recover',
          name: 'Recovery Email',
          capability: 'insights.recover',
          description: 'Generate recovery email',
          parameters: [],
          options: {},
          handler: vi.fn(),
        },
      ];

      vi.spyOn(skillsRegistry, 'listAll').mockResolvedValue(mockSkills);

      const result = await orchestratorService.listCapabilities();

      const capabilities = result.map((s) => s.capability);
      expect(capabilities).toContain('insights.predict');
      expect(capabilities).toContain('insights.compare');
      expect(capabilities).toContain('insights.recover');
    });
  });
});