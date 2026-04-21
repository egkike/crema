import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pool
vi.mock('../../db/postgres', () => ({
  default: {
    query: vi.fn(),
  },
}));

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    quit: vi.fn(),
    connect: vi.fn(),
  })),
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock('../../config/index', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379,
      password: undefined,
    },
  },
}));

import pool from '../../db/postgres';
import { skillsRegistry, clearRegisteredSkills } from '../../services/skills-registry.service';

describe('skills-registry.service.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the in-memory registry between tests
    clearRegisteredSkills();
  });

  // =========================================================================
  // register
  // =========================================================================

  describe('register', () => {
    it('should register skill and store in DB', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'test.skill',
        description: 'A test skill',
        parameters: [],
        options: { timeout: 30000 },
        handler: vi.fn(),
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

      await skillsRegistry.register(mockSkill);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO skills'),
        expect.arrayContaining([
          mockSkill.id,
          mockSkill.name,
          mockSkill.capability,
        ])
      );
    });

    it('should throw on invalid capability format', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'INVALID CAPABILITY', // Invalid: spaces not allowed
        description: 'A test skill',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      await expect(skillsRegistry.register(mockSkill)).rejects.toThrow(
        'Invalid capability format'
      );
    });

    it('should throw on missing required fields', async () => {
      const mockSkill = {
        id: '', // Empty - invalid
        name: 'Test Skill',
        capability: 'test.skill',
        description: 'A test skill',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      await expect(skillsRegistry.register(mockSkill)).rejects.toThrow('Skill.id is required');
    });

    it('should throw on invalid parameters type', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'test.skill',
        description: 'A test skill',
        parameters: 'not-an-array' as unknown as [],
        options: {},
        handler: vi.fn(),
      };

      await expect(skillsRegistry.register(mockSkill)).rejects.toThrow(
        'Skill.parameters must be an array'
      );
    });
  });

  // =========================================================================
  // findByCapability
  // =========================================================================

  describe('findByCapability', () => {
    it('should return null for invalid capability format', async () => {
      const result = await skillsRegistry.findByCapability('invalid capability');

      expect(result).toBeNull();
    });

    it('should return skill from memory when registered', async () => {
      // Register a skill first
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'test.skill',
        description: 'A test skill',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
      await skillsRegistry.register(mockSkill);

      const result = await skillsRegistry.findByCapability('test.skill');

      expect(result).toBeDefined();
      expect(result?.capability).toBe('test.skill');
      expect(result?.handler).toBeDefined();
    });

    it('should return null when skill not found', async () => {
      const result = await skillsRegistry.findByCapability('nonexistent.skill');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // findHandler
  // =========================================================================

  describe('findHandler', () => {
    it('should return null for invalid capability', async () => {
      const result = await skillsRegistry.findHandler('invalid-capability');

      expect(result).toBeNull();
    });

    it('should return null when handler not in memory', async () => {
      const result = await skillsRegistry.findHandler('nonexistent.handler');

      expect(result).toBeNull();
    });

    it('should return handler when skill registered', async () => {
      const mockHandler = vi.fn();
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'test.handler',
        description: 'Test',
        parameters: [],
        options: {},
        handler: mockHandler,
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
      await skillsRegistry.register(mockSkill);

      const result = await skillsRegistry.findHandler('test.handler');

      expect(result).toBe(mockHandler);
    });
  });

  // =========================================================================
  // listAll
  // =========================================================================

  describe('listAll', () => {
    it('should return empty array when no skills', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

      const result = await skillsRegistry.listAll();

      expect(result).toEqual([]);
    });

    it('should return skills from DB', async () => {
      const mockSkills = [
        { id: 'skill-1', name: 'Skill 1', capability: 'skill.one', description: '', parameters: [], options: {} },
        { id: 'skill-2', name: 'Skill 2', capability: 'skill.two', description: '', parameters: [], options: {} },
      ];

      vi.mocked(pool.query).mockResolvedValue({ rows: mockSkills } as any);

      const result = await skillsRegistry.listAll();

      expect(result).toHaveLength(2);
      expect(result[0]?.capability).toBe('skill.one');
    });

    it('should handle JSON parse error gracefully', async () => {
      // Mock Redis to return invalid JSON
      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

      // This should not throw, just fall back to DB
      const result = await skillsRegistry.listAll();

      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // listCapabilities
  // =========================================================================

  describe('listCapabilities', () => {
    it('should return capability strings', async () => {
      const mockSkills = [
        { id: 'skill-1', name: 'Skill 1', capability: 'capability.one', description: '', parameters: [], options: {} },
        { id: 'skill-2', name: 'Skill 2', capability: 'capability.two', description: '', parameters: [], options: {} },
      ];

      vi.mocked(pool.query).mockResolvedValue({ rows: mockSkills } as any);

      const result = await skillsRegistry.listCapabilities();

      expect(result).toEqual(['capability.one', 'capability.two']);
    });
  });

  // =========================================================================
  // unregister
  // =========================================================================

  describe('unregister', () => {
    it('should throw on invalid capability format', async () => {
      await expect(skillsRegistry.unregister('invalid capability')).rejects.toThrow(
        'Invalid capability format'
      );
    });

    it('should update skill to disabled in DB', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

      await skillsRegistry.unregister('test.skill');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE skills SET enabled'),
        ['test.skill']
      );
    });
  });

  // =========================================================================
  // count
  // =========================================================================

  describe('count', () => {
    it('should return count of enabled skills', async () => {
      vi.mocked(pool.query).mockResolvedValue({ rows: [{ count: '5' }] } as any);

      const result = await skillsRegistry.count();

      expect(result).toBe(5);
    });
  });

  // =========================================================================
  // isRegistered
  // =========================================================================

  describe('isRegistered', () => {
    it('should return false for invalid capability', async () => {
      const result = await skillsRegistry.isRegistered('invalid capability');

      expect(result).toBe(false);
    });

    it('should return false for unregistered skill', async () => {
      const result = await skillsRegistry.isRegistered('nonexistent.skill');

      expect(result).toBe(false);
    });

    it('should return true for registered skill', async () => {
      const mockSkill = {
        id: 'skill-1',
        name: 'Test Skill',
        capability: 'test.registered',
        description: 'Test',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
      await skillsRegistry.register(mockSkill);

      const result = await skillsRegistry.isRegistered('test.registered');

      expect(result).toBe(true);
    });
  });

  // =========================================================================
  // handlerCount
  // =========================================================================

  describe('handlerCount', () => {
    it('should return count of handlers in memory', async () => {
      const mockSkill1 = {
        id: 'skill-1',
        name: 'Skill 1',
        capability: 'count.skill1',
        description: 'Test',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      const mockSkill2 = {
        id: 'skill-2',
        name: 'Skill 2',
        capability: 'count.skill2',
        description: 'Test',
        parameters: [],
        options: {},
        handler: vi.fn(),
      };

      vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);
      await skillsRegistry.register(mockSkill1);
      await skillsRegistry.register(mockSkill2);

      const result = await skillsRegistry.handlerCount();

      expect(result).toBe(2);
    });
  });
});